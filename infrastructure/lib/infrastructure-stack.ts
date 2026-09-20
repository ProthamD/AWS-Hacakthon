import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as amplify from '@aws-cdk/aws-amplify-alpha';
import * as path from 'path';
import * as fs from 'fs';

export interface SahayStackProps extends cdk.StackProps {
  readonly bedrockKbId?: string;
  readonly snsEmailEndpoint?: string;
  readonly snsSmsEndpoint?: string;
  readonly frontendUrl?: string;
  readonly groqApiKey?: string;
  readonly deepgramApiKey?: string;    // Deepgram STT key (stored server-side, never in frontend)
  readonly sesFromEmail?: string;      // Verified SES sender email
}

export class SahayStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SahayStackProps = {}) {
    super(scope, id, props);

    const region = props.env?.region || 'ap-south-1';
    const account = props.env?.account || process.env.CDK_DEFAULT_ACCOUNT;

    // =========================================================================
    // DYNAMODB TABLES
    // =========================================================================

    // Caregiver + patient profiles
    const profilesTable = new dynamodb.Table(this, 'CaregiverProfiles', {
      tableName: 'sahay-caregiver-profiles',
      partitionKey: { name: 'caregiverId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
    });

    // Conversation logs + escalation records + nudge logs + alert TTL records
    const conversationsTable = new dynamodb.Table(this, 'ConversationLogs', {
      tableName: 'sahay-conversation-logs',
      partitionKey: { name: 'conversationId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      // TTL: auto-expire alert dedup records after their window (set by Lambda)
      timeToLiveAttribute: 'ttl',
    });
    conversationsTable.addGlobalSecondaryIndex({
      indexName: 'caregiverId-timestamp-index',
      partitionKey: { name: 'caregiverId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
    });

    // Distress scores (separate table for trend analysis)
    const distressTable = new dynamodb.Table(this, 'DistressScores', {
      tableName: 'sahay-distress-scores',
      partitionKey: { name: 'scoreId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    distressTable.addGlobalSecondaryIndex({
      indexName: 'caregiverId-timestamp-index',
      partitionKey: { name: 'caregiverId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
    });

    // Route configurations for location monitoring
    const routeConfigsTable = new dynamodb.Table(this, 'RouteConfigs', {
      tableName: 'sahay-route-configs',
      partitionKey: { name: 'patientId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // =========================================================================
    // S3 BUCKETS
    // =========================================================================

    // Knowledge base data source — caregiver profile documents for RAG
    const kbDocsBucket = new s3.Bucket(this, 'KbDocsBucket', {
      bucketName: `sahay-kb-docs-${account}`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      versioned: true,
      lifecycleRules: [{ id: 'old-version-cleanup', noncurrentVersionExpiration: cdk.Duration.days(30) }],
      cors: [{
        allowedHeaders: ['*'],
        allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
        allowedOrigins: ['*'],
      }],
    });

    // Temporary audio (Polly synthesis + stretch goal audio clips)
    const audioBucket = new s3.Bucket(this, 'AudioBucket', {
      bucketName: `sahay-audio-${account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      lifecycleRules: [
        { id: 'auto-delete-audio', expiration: cdk.Duration.days(1) },
      ],
      cors: [{
        allowedHeaders: ['*'],
        allowedMethods: [s3.HttpMethods.GET],
        allowedOrigins: ['*'],
      }],
    });

    // =========================================================================
    // SNS TOPIC
    // =========================================================================

    const alertsTopic = new sns.Topic(this, 'SahayAlerts', {
      topicName: 'sahay-alerts',
      displayName: 'Sahay Emergency Alerts',
    });

    // Output ARN for reference
    new cdk.CfnOutput(this, 'SnsTopicArn', { value: alertsTopic.topicArn, exportName: 'SahayAlertTopicArn' });

    // =========================================================================
    // COGNITO (Auth)
    // =========================================================================

    const userPool = new cognito.UserPool(this, 'SahayUserPool', {
      userPoolName: 'sahay-caregivers',
      selfSignUpEnabled: true,
      signInAliases: { email: true, phone: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireDigits: true,
        requireUppercase: false,
        requireSymbols: false,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'SahayAppClient', {
      userPool,
      userPoolClientName: 'sahay-web-client',
      generateSecret: false,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
    });

    new cdk.CfnOutput(this, 'CognitoUserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'CognitoClientId', { value: userPoolClient.userPoolClientId });

    // =========================================================================
    // EVENTBRIDGE
    // =========================================================================

    const eventBus = new events.EventBus(this, 'SahayEventBus', {
      eventBusName: 'sahay-events',
    });

    // =========================================================================
    // SHARED LAMBDA ENVIRONMENT
    // =========================================================================

    const commonEnv: Record<string, string> = {
      CAREGIVER_PROFILES_TABLE: profilesTable.tableName,
      CONVERSATION_LOGS_TABLE: conversationsTable.tableName,
      DISTRESS_SCORES_TABLE: distressTable.tableName,
      ROUTE_CONFIGS_TABLE: routeConfigsTable.tableName,
      KB_DOCS_BUCKET: kbDocsBucket.bucketName,
      AUDIO_BUCKET: audioBucket.bucketName,
      SNS_TOPIC_ARN: alertsTopic.topicArn,
      EVENT_BUS_NAME: eventBus.eventBusName,
      BEDROCK_MODEL_ID: 'apac.amazon.nova-lite-v1:0',
      BEDROCK_KB_ID: props.bedrockKbId || '',
      FRONTEND_URL: props.frontendUrl || 'https://main.d33r1s7xj9cmie.amplifyapp.com',
      GROQ_API_KEY: props.groqApiKey || process.env.GROQ_API_KEY || '',
      DEEPGRAM_API_KEY: props.deepgramApiKey || process.env.DEEPGRAM_API_KEY || '',
      // Nodemailer Gmail SMTP — set via CDK context or env vars (never commit actual values)
      SMTP_USER: process.env.SMTP_USER || '',        // e.g. protham.dey@gmail.com
      SMTP_PASS: process.env.SMTP_PASS || '',        // Gmail App Password (16 chars)
      ALERT_TTL_MINUTES: '30',
    };

    const lambdaDefaults = {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    } as const;

    // Helper: create a Lambda with its own least-privilege IAM role
    const makeLambda = (id: string, handlerDir: string, extraEnv: Record<string, string> = {}) => {
      const role = new iam.Role(this, `${id}Role`, {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        ],
      });

      return new lambda.Function(this, id, {
        runtime: lambda.Runtime.NODEJS_24_X,
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        functionName: `sahay-${id.toLowerCase().replace(/[A-Z]/g, (m: string) => '-' + m.toLowerCase())}`,
        code: lambda.Code.fromAsset(path.join(__dirname, '../../lambdas')),
        handler: `${handlerDir}/index.handler`,
        role,
        environment: { ...commonEnv, ...extraEnv },
      });
    };

    // =========================================================================
    // LAMBDA FUNCTIONS
    // =========================================================================

    // Health check
    const healthFn = makeLambda('HealthHandler', 'healthHandler');

    // Onboarding
    const onboardFn = makeLambda('OnboardHandler', 'onboardHandler');
    profilesTable.grantWriteData(onboardFn);
    kbDocsBucket.grantPut(onboardFn);

    // Chat (single-agent — used before 3.2 Step Functions is ready)
    const chatFn = makeLambda('ChatHandler', 'chatHandler');
    profilesTable.grantReadData(chatFn);
    conversationsTable.grantWriteData(chatFn);
    distressTable.grantWriteData(chatFn);
    audioBucket.grantPut(chatFn);
    audioBucket.grantRead(chatFn);
    chatFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:Retrieve'],
      resources: ['*'],
    }));
    chatFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['polly:SynthesizeSpeech'],
      resources: ['*'],
    }));

    // Triage Agent
    const triageFn = makeLambda('TriageAgent', 'triageAgent');
    triageFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));

    // Care Guidance Agent
    const careGuidanceFn = makeLambda('CareGuidanceAgent', 'careGuidanceAgent');
    profilesTable.grantReadData(careGuidanceFn);
    conversationsTable.grantWriteData(careGuidanceFn);
    distressTable.grantWriteData(careGuidanceFn);
    audioBucket.grantPut(careGuidanceFn);
    audioBucket.grantRead(careGuidanceFn);
    careGuidanceFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:Retrieve'],
      resources: ['*'],
    }));

    // Audio Upload Handler
    const audioUploadFn = makeLambda('AudioUploadHandler', 'audioUploadHandler');
    audioBucket.grantReadWrite(audioUploadFn);
    alertsTopic.grantPublish(audioUploadFn);
    careGuidanceFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['polly:SynthesizeSpeech'],
      resources: ['*'],
    }));

    // Voice Companion Handler (Groq-powered patient AI)
    // 512MB: AWS allocates CPU proportional to memory — 2x memory = 2x CPU = faster JSON parse + Polly
    const voiceCompanionFn = makeLambda('VoiceCompanionHandler', 'voiceCompanionHandler');
    voiceCompanionFn.addEnvironment('GROQ_API_KEY', props.groqApiKey || process.env.GROQ_API_KEY || '');
    // Override memory to 512MB for better CPU allocation (voice is latency-sensitive)
    (voiceCompanionFn.node.defaultChild as lambda.CfnFunction).memorySize = 512;
    profilesTable.grantReadData(voiceCompanionFn);
    alertsTopic.grantPublish(voiceCompanionFn);
    audioBucket.grantPut(voiceCompanionFn);

    // Transcribe Handler (Groq Whisper STT — replaces browser SpeechRecognition)
    const transcribeFn = makeLambda('TranscribeHandler', 'transcribeHandler',
      { GROQ_API_KEY: props.groqApiKey || process.env.GROQ_API_KEY || '' }
    );

    // Escalation Agent
    const escalationFn = makeLambda('EscalationAgent', 'escalationAgent');
    profilesTable.grantReadData(escalationFn);
    conversationsTable.grantReadWriteData(escalationFn);
    audioBucket.grantPut(escalationFn);
    audioBucket.grantRead(escalationFn);
    alertsTopic.grantPublish(escalationFn);
    escalationFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['polly:SynthesizeSpeech'],
      resources: ['*'],
    }));

    // Burnout Checker
    const burnoutFn = makeLambda('BurnoutChecker', 'burnoutChecker');
    distressTable.grantReadData(burnoutFn);
    profilesTable.grantReadData(burnoutFn);
    conversationsTable.grantReadWriteData(burnoutFn);
    alertsTopic.grantPublish(burnoutFn);

    // Route Monitor
    const routeMonitorFn = makeLambda('RouteMonitor', 'routeMonitor');
    routeConfigsTable.grantReadWriteData(routeMonitorFn);
    eventBus.grantPutEventsTo(routeMonitorFn);

    // Calming Response Agent
    const calmingFn = makeLambda('CalmingResponseAgent', 'calmingResponseAgent');
    profilesTable.grantReadData(calmingFn);
    routeConfigsTable.grantReadData(calmingFn);
    conversationsTable.grantWriteData(calmingFn);
    audioBucket.grantPut(calmingFn);
    audioBucket.grantRead(calmingFn);
    alertsTopic.grantPublish(calmingFn);
    calmingFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:Retrieve'],
      resources: ['*'],
    }));
    calmingFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['polly:SynthesizeSpeech'],
      resources: ['*'],
    }));

    // QR Generator
    const generateQrFn = makeLambda('GenerateQR', 'generateQR');
    profilesTable.grantReadData(generateQrFn);

    // Alert Handler (Nodemailer Gmail SMTP + DynamoDB 30-min TTL dedup)
    const alertFn = makeLambda('AlertHandler', 'alertHandler');
    conversationsTable.grantReadWriteData(alertFn);
    // No extra IAM needed — uses Gmail SMTP (credentials via env vars, not IAM)

    // Deepgram Token Handler (secure key proxy — key never sent to frontend bundle)
    const deepgramTokenFn = makeLambda('DeepgramTokenHandler', 'deepgramTokenHandler');
    // No extra permissions needed — just reads DEEPGRAM_API_KEY from env

    // =========================================================================
    // STEP FUNCTIONS — Multi-Agent Orchestration
    // =========================================================================

    const triageTask = new tasks.LambdaInvoke(this, 'TriageTask', {
      lambdaFunction: triageFn,
      outputPath: '$.Payload',
    });

    const careGuidanceTask = new tasks.LambdaInvoke(this, 'CareGuidanceTask', {
      lambdaFunction: careGuidanceFn,
      outputPath: '$.Payload',
    });

    const escalationTask = new tasks.LambdaInvoke(this, 'EscalationTask', {
      lambdaFunction: escalationFn,
      outputPath: '$.Payload',
    });

    // Fallback states for circuit breaker
    const triageFallback = new sfn.Pass(this, 'TriageFallback', {
      parameters: {
        'classification': 'ROUTINE',
        'confidence': 0.5,
        'autoEscalate': false,
        'requiresHumanReview': true,
        'caregiverId.$': '$.caregiverId',
        'message.$': '$.message',
        'sessionId.$': '$.sessionId',
        'synthesizeAudio.$': '$.synthesizeAudio',
      },
    });

    const careGuidanceFallback = new sfn.Pass(this, 'CareGuidanceFallback', {
      parameters: {
        'agentType': 'CARE_GUIDANCE_FALLBACK',
        'response': 'मुझे खेद है। ARDSI हेल्पलाइन: 1800-200-ARDSI',
        'audioUrl': null,
      },
    });

    const escalationFallback = new sfn.Pass(this, 'EscalationFallback', {
      parameters: {
        'agentType': 'ESCALATION_FALLBACK',
        'response': 'Emergency: call 112 now. ARDSI: 1800-200-ARDSI.',
        'escalated': true,
        'alertSent': false,
      },
    });

    // Wire the state machine
    const escalationChoice = new sfn.Choice(this, 'EscalationDecision')
      .when(sfn.Condition.booleanEquals('$.autoEscalate', true),
        escalationTask.addCatch(escalationFallback, { resultPath: '$.error' })
      )
      .otherwise(
        careGuidanceTask.addCatch(careGuidanceFallback, { resultPath: '$.error' })
      );

    triageTask
      .addCatch(triageFallback.next(escalationChoice), { resultPath: '$.error' })
      .next(escalationChoice);

    const stateMachine = new sfn.StateMachine(this, 'SahayOrchestration', {
      stateMachineName: 'sahay-multi-agent',
      definition: triageTask,
      timeout: cdk.Duration.seconds(60),
    });

    // Lambda to invoke Step Functions from API Gateway
    const orchestratorFn = new lambda.Function(this, 'OrchestratorHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      functionName: 'sahay-orchestrator',
      code: lambda.Code.fromInline(`
const { SFNClient, StartExecutionCommand } = require("@aws-sdk/client-sfn");
const sfn = new SFNClient({ region: process.env.AWS_REGION });
exports.handler = async (event) => {
  let body;
  try { body = typeof event.body === "string" ? JSON.parse(event.body) : event.body; } catch { return { statusCode: 400, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "Invalid JSON" }) }; }
  const input = JSON.stringify({ ...body, synthesizeAudio: body.synthesizeAudio ?? true });
  const result = await sfn.send(new StartExecutionCommand({ stateMachineArn: process.env.STATE_MACHINE_ARN, input }));
  // Poll for result (sync execution)
  const { SFNClient: SFN2, DescribeExecutionCommand } = require("@aws-sdk/client-sfn");
  let execution, attempt = 0;
  do {
    await new Promise(r => setTimeout(r, 500));
    execution = await sfn.send(new DescribeExecutionCommand({ executionArn: result.executionArn }));
    attempt++;
  } while (execution.status === "RUNNING" && attempt < 50);
  const output = execution.output ? JSON.parse(execution.output) : {};
  return { statusCode: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(output) };
};
      `),
      handler: 'index.handler',
      environment: {
        ...commonEnv,
        STATE_MACHINE_ARN: stateMachine.stateMachineArn,
      },
    });
    stateMachine.grantStartExecution(orchestratorFn);
    stateMachine.grantRead(orchestratorFn);
    orchestratorFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['states:DescribeExecution'],
      resources: ['*'],
    }));

    // =========================================================================
    // EVENTBRIDGE — Route anomaly → Calming Response
    // =========================================================================

    new events.Rule(this, 'RouteAnomalyRule', {
      eventBus,
      ruleName: 'sahay-route-anomaly',
      eventPattern: {
        source: ['sahay.route-monitor'],
        detailType: ['RouteAnomalyDetected'],
      },
      targets: [new targets.LambdaFunction(calmingFn)],
    });

    // Burnout checker schedule — every 6h for demo, change to 24h for prod
    new events.Rule(this, 'BurnoutSchedule', {
      ruleName: 'sahay-burnout-check',
      schedule: events.Schedule.rate(cdk.Duration.hours(6)),
      targets: [new targets.LambdaFunction(burnoutFn)],
    });

    // Lambda warm-up ping every 5 minutes — prevents cold starts during hackathon demo
    // Sends a dummy event that the handler ignores (returns immediately on missing transcript)
    new events.Rule(this, 'VoiceCompanionWarmup', {
      ruleName: 'sahay-voice-warmup',
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      targets: [new targets.LambdaFunction(voiceCompanionFn, {
        event: events.RuleTargetInput.fromObject({ source: 'warmup' }),
      })],
    });

    // =========================================================================
    // API GATEWAY
    // =========================================================================

    const api = new apigateway.RestApi(this, 'SahayApi', {
      restApiName: 'sahay-api',
      description: 'Sahay Voice Companion API',
      cloudWatchRole: true,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions: {
        stageName: 'prod',
        tracingEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
      },
    });

    const lambdaIntegration = (fn: lambda.Function) =>
      new apigateway.LambdaIntegration(fn, { proxy: true });

    // GET /health
    const health = api.root.addResource('health');
    health.addMethod('GET', lambdaIntegration(healthFn));

    // POST /onboard
    const onboard = api.root.addResource('onboard');
    onboard.addMethod('POST', lambdaIntegration(onboardFn));

    // POST /chat (single-agent — used for Phase 3.1; replaced by /chat/orchestrate in 3.2)
    const chat = api.root.addResource('chat');
    chat.addMethod('POST', lambdaIntegration(chatFn));

    // POST /chat/orchestrate (Step Functions multi-agent — Phase 3.2+)
    const orchestrate = chat.addResource('orchestrate');
    orchestrate.addMethod('POST', lambdaIntegration(orchestratorFn));

    // Route monitoring endpoints
    const route = api.root.addResource('route');
    const routeConfigure = route.addResource('configure');
    routeConfigure.addMethod('POST', lambdaIntegration(routeMonitorFn));
    const routePing = route.addResource('ping');
    routePing.addMethod('POST', lambdaIntegration(routeMonitorFn));
    const routeStatus = route.addResource('status');
    const routeStatusPatient = routeStatus.addResource('{patientId}');
    routeStatusPatient.addMethod('GET', lambdaIntegration(routeMonitorFn));
    const routeSimulate = route.addResource('simulate');
    routeSimulate.addMethod('POST', lambdaIntegration(routeMonitorFn));

    // POST /qr/generate
    const qr = api.root.addResource('qr');
    const qrGenerate = qr.addResource('generate');
    qrGenerate.addMethod('POST', lambdaIntegration(generateQrFn));

    // POST /distress/audio
    const distress = api.root.addResource('distress');
    const distressAudio = distress.addResource('audio');
    distressAudio.addMethod('POST', lambdaIntegration(audioUploadFn));

    // POST /patient/voice  (Groq AI voice companion)
    const patient = api.root.addResource('patient');
    const patientVoice = patient.addResource('voice');
    patientVoice.addMethod('POST', lambdaIntegration(voiceCompanionFn));

    // POST /patient/transcribe  (Groq Whisper STT)
    const patientTranscribe = patient.addResource('transcribe');
    patientTranscribe.addMethod('POST', lambdaIntegration(transcribeFn));

    // POST /patient/alert  (SES email + DynamoDB 30-min TTL dedup)
    const patientAlert = patient.addResource('alert');
    patientAlert.addMethod('POST', lambdaIntegration(alertFn));

    // GET /patient/deepgram-token  (secure Deepgram key proxy)
    const patientDgToken = patient.addResource('deepgram-token');
    patientDgToken.addMethod('GET', lambdaIntegration(deepgramTokenFn));

    // =========================================================================
    // OUTPUTS
    // =========================================================================

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'Sahay API Gateway URL',
      exportName: 'SahayApiUrl',
    });

    new cdk.CfnOutput(this, 'KbDocsBucketName', {
      value: kbDocsBucket.bucketName,
      description: 'S3 bucket for Bedrock Knowledge Base documents',
    });

    new cdk.CfnOutput(this, 'AudioBucketName', {
      value: audioBucket.bucketName,
    });

    new cdk.CfnOutput(this, 'StateMachineArn', {
      value: stateMachine.stateMachineArn,
    });

    new cdk.CfnOutput(this, 'EventBusName', {
      value: eventBus.eventBusName,
    });

    // Tag everything
    cdk.Tags.of(this).add('Project', 'Sahay');
    cdk.Tags.of(this).add('Hackathon', 'FirstCommit-2026');
    cdk.Tags.of(this).add('Track', 'ShipIt');
  }
}
