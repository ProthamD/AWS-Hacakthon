/**
 * calmingResponseAgent — Patient calming flow (Branch B — 3.4b — MERGE POINT)
 * Triggered by EventBridge RouteAnomalyDetected event.
 *
 * Actions:
 *  1. Load patient context from DynamoDB + RAG Knowledge Base
 *  2. Generate warm, personalized calming script via Bedrock (Nova Lite)
 *  3. Synthesize audio via Polly
 *  4. Store audio in S3 (presigned URL)
 *  5. Send caregiver SNS alert with location info
 *  6. Return payload for patient-facing calming screen
 */

import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { BedrockAgentRuntimeClient, RetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { converse } from "../shared/bedrock.mjs";
import { randomUUID } from "crypto";

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION });
const bedrockAgentRuntime = new BedrockAgentRuntimeClient({ region: process.env.AWS_REGION });
const polly = new PollyClient({ region: process.env.AWS_REGION });
const s3 = new S3Client({ region: process.env.AWS_REGION });
const sns = new SNSClient({ region: process.env.AWS_REGION });

const PROFILES_TABLE = process.env.CAREGIVER_PROFILES_TABLE;
const ROUTE_CONFIGS_TABLE = process.env.ROUTE_CONFIGS_TABLE;
const KB_ID = process.env.BEDROCK_KB_ID;
const AUDIO_BUCKET = process.env.AUDIO_BUCKET;
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;
const CALMING_TABLE = process.env.CONVERSATION_LOGS_TABLE;

const FALLBACK_CALMING = {
  hi: "नमस्ते। आप सुरक्षित हैं। यहीं रुकिए। आपकी मदद आ रही है।",
  en: "Hello. You are safe. Please stay where you are. Help is coming.",
};

export const handler = async (event) => {
  console.log("[calmingResponse] triggered by EventBridge:", JSON.stringify(event));

  const detail = event.detail || event;
  const { patientId, caregiverId, currentLat, currentLng, anomalies = [], simulated = false } = detail;

  if (!patientId || !caregiverId) {
    console.error("[calmingResponse] Missing patientId or caregiverId");
    return { error: "Missing required fields" };
  }

  // Idempotency — don't fire twice within 5 minutes for same patient
  const idempotencyKey = `calming-${patientId}-${Math.floor(Date.now() / 300000)}`;

  // Load caregiver profile
  let profile;
  try {
    const result = await dynamo.send(new GetItemCommand({
      TableName: PROFILES_TABLE,
      Key: { caregiverId: { S: caregiverId } },
    }));
    profile = result.Item;
  } catch (err) {
    console.error("[calmingResponse] Profile load failed (non-fatal)", err);
  }

  const patientName = profile?.patientName?.S || "the patient";
  const language = profile?.language?.S || "hi";
  const dementiaStage = profile?.dementiaStage?.S || "moderate";
  const emergencyContactName = profile?.emergencyContactName?.S || "your family member";

  // Load route config
  let routeConfig;
  try {
    const result = await dynamo.send(new GetItemCommand({
      TableName: ROUTE_CONFIGS_TABLE,
      Key: { patientId: { S: patientId } },
    }));
    routeConfig = result.Item;
  } catch (err) {
    console.error("[calmingResponse] Route config load failed (non-fatal)", err);
  }

  const routeDescription = routeConfig?.routeDescription?.S || "their usual destination";

  // RAG retrieval for patient-specific context
  let patientContext = "";
  if (KB_ID) {
    try {
      const ragResult = await bedrockAgentRuntime.send(new RetrieveCommand({
        knowledgeBaseId: KB_ID,
        retrievalQuery: { text: `patient ${patientName} ${caregiverId} calming reassurance` },
        retrievalConfiguration: { vectorSearchConfiguration: { numberOfResults: 2 } },
      }));
      patientContext = (ragResult.retrievalResults || [])
        .map((r) => r.content?.text || "")
        .filter(Boolean)
        .join("\n");
    } catch (err) {
      console.error("[calmingResponse] RAG failed (non-fatal)", err);
    }
  }

  // Generate calming script with Bedrock (Nova Lite via Converse API)
  const langInstruction = language === "hi"
    ? "Write in simple, warm Hindi. Use the patient's name warmly."
    : "Write in simple, warm English.";

  const systemPrompt = `You are generating a calming message to be read aloud to an Alzheimer's patient who appears lost or disoriented.

Patient name: ${patientName}
Dementia stage: ${dementiaStage}
They were heading to: ${routeDescription}
Emergency contact coming: ${emergencyContactName}

${langInstruction}

Requirements:
- Keep it under 4 sentences — the patient cannot follow long speech
- Use the patient's name frequently to orient them
- Tell them to STAY WHERE THEY ARE
- Reassure them that ${emergencyContactName} is on the way
- Do NOT mention dementia or that they are "confused" — just reassure
- Tone: warm, slow, gentle, like speaking to a loved one

Patient personal context:
${patientContext || "Use general gentle reassurance."}`;

  let calmingText;
  try {
    calmingText = await converse({
      userMessage: "Generate the calming message now.",
      systemPrompt,
      maxTokens: 150,
    });
    if (!calmingText) throw new Error("Empty response");
  } catch (err) {
    console.error("[calmingResponse] Bedrock failed — using fallback", err);
    calmingText = FALLBACK_CALMING[language] || FALLBACK_CALMING.en;
  }

  // Synthesize with Polly
  let audioUrl = null;
  const audioKey = `audio/calming-${patientId}-${Date.now()}.mp3`;
  try {
    const voiceMap = { hi: "Aditi", en: "Joanna" };
    const langCode = language === "hi" ? "hi-IN" : "en-US";

    const pollyResp = await polly.send(new SynthesizeSpeechCommand({
      Text: calmingText,
      OutputFormat: "mp3",
      VoiceId: voiceMap[language] || "Joanna",
      LanguageCode: langCode,
    }));

    const chunks = [];
    for await (const chunk of pollyResp.AudioStream) chunks.push(chunk);
    await s3.send(new PutObjectCommand({
      Bucket: AUDIO_BUCKET, Key: audioKey,
      Body: Buffer.concat(chunks), ContentType: "audio/mpeg",
    }));
    audioUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: AUDIO_BUCKET, Key: audioKey }), { expiresIn: 7200 });
    console.log("[calmingResponse] Polly audio ready");
  } catch (err) {
    console.error("[calmingResponse] Polly synthesis failed (non-fatal)", err);
  }

  // Send caregiver SNS alert
  try {
    const mapsLink = currentLat && currentLng
      ? `https://maps.google.com/?q=${currentLat},${currentLng}` : "Location unavailable";

    await sns.send(new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Subject: `🔍 SAHAY: ${patientName} may be disoriented`,
      Message: `
PATIENT LOCATION ALERT
======================
Patient: ${patientName}
Anomaly: ${anomalies.map((a) => a.type).join(", ")}
Details: ${anomalies.map((a) => a.detail).join("; ")}
${currentLat ? `Location: ${mapsLink}` : "Location: Not available"}
Time: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
Simulated: ${simulated}

A calming voice message has been automatically played to ${patientName}.
Please check on them immediately.

— Sahay AI`.trim(),
    }));
    console.log("[calmingResponse] Caregiver SNS alert sent");
  } catch (err) {
    console.error("[calmingResponse] SNS alert failed (non-fatal)", err);
  }

  // Log calming event
  try {
    await dynamo.send(new PutItemCommand({
      TableName: CALMING_TABLE,
      Item: {
        conversationId: { S: idempotencyKey },
        caregiverId: { S: caregiverId },
        sessionId: { S: `calming-${patientId}` },
        userMessage: { S: JSON.stringify(anomalies) },
        assistantResponse: { S: calmingText },
        distressScore: { N: "9" },
        timestamp: { S: new Date().toISOString() },
      },
    }));
  } catch (err) {
    console.error("[calmingResponse] Failed to log calming event (non-fatal)", err);
  }

  return { patientId, calmingText, audioUrl, anomalies };
};
