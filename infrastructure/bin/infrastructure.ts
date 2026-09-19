#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SahayStack } from '../lib/infrastructure-stack';

const app = new cdk.App();

// ============================================================
// CONFIGURATION — update these before deploying
// ============================================================
const AWS_ACCOUNT = process.env.CDK_DEFAULT_ACCOUNT;
const AWS_REGION = process.env.CDK_DEFAULT_REGION || 'ap-south-1';

// Set BEDROCK_KB_ID after creating the Knowledge Base manually in the console
const BEDROCK_KB_ID = process.env.BEDROCK_KB_ID || '';

// Set your demo SNS endpoint here (email or phone for alerts)
const SNS_EMAIL = process.env.SAHAY_SNS_EMAIL || '';
const SNS_SMS = process.env.SAHAY_SNS_PHONE || '';

// Set after first Amplify deploy
const FRONTEND_URL = process.env.SAHAY_FRONTEND_URL || 'https://main.sahay.amplifyapp.com';

// Groq API key for voice companion AI (pass via GROQ_API_KEY env var)
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

new SahayStack(app, 'SahayStack', {
  env: {
    account: AWS_ACCOUNT,
    region: AWS_REGION,
  },
  stackName: 'sahay-stack',
  description: 'Sahay — Voice-First Alzheimer\'s Caregiver Companion (First Commit Hackathon 2026)',
  bedrockKbId: BEDROCK_KB_ID,
  snsEmailEndpoint: SNS_EMAIL,
  snsSmsEndpoint: SNS_SMS,
  frontendUrl: FRONTEND_URL,
  groqApiKey: GROQ_API_KEY,
});
