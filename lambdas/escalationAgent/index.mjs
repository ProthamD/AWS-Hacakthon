/**
 * escalationAgent — Emergency escalation (Branch A — 3.2)
 * Only reached when Triage classifies as EMERGENCY, SELF_HARM, or PATIENT_MISSING.
 *
 * Actions:
 *  1. Load caregiver profile to get emergency contact info
 *  2. Send SNS alert to emergency contact with context
 *  3. Return calming "help is being contacted" message to user
 *
 * Idempotency: uses sessionId as deduplication key — retries won't send duplicate SNS.
 */

import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION });
const sns = new SNSClient({ region: process.env.AWS_REGION });
const polly = new PollyClient({ region: process.env.AWS_REGION });
const s3 = new S3Client({ region: process.env.AWS_REGION });

const PROFILES_TABLE = process.env.CAREGIVER_PROFILES_TABLE;
const ESCALATION_LOG_TABLE = process.env.CONVERSATION_LOGS_TABLE;
const AUDIO_BUCKET = process.env.AUDIO_BUCKET;
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;

// Calming messages for different emergency types, in Hindi
const CALMING_MESSAGES = {
  EMERGENCY: {
    hi: "घबराइए नहीं। आपका संदेश मिल गया है। मैं आपके आपातकालीन संपर्क को सूचित कर रहा हूँ। अभी 112 पर कॉल करें यदि जीवन को खतरा है।",
    en: "Please don't panic. Your message has been received. I am alerting your emergency contact right now. Call 112 immediately if there is danger to life.",
  },
  SELF_HARM: {
    hi: "आप अकेले नहीं हैं। यह बहुत कठिन समय है, लेकिन मदद उपलब्ध है। iCall हेल्पलाइन: 9152987821. मैं अभी आपके संपर्क को सूचित कर रहा हूँ।",
    en: "You are not alone. This is an extremely hard time, but help is available. iCall helpline: 9152987821. I am alerting your emergency contact right now.",
  },
  PATIENT_MISSING: {
    hi: "हम समझते हैं यह कितना डरावना है। मैं आपके संपर्क को सूचित कर रहा हूँ। पुलिस को 100 पर कॉल करें और आखिरी ज्ञात स्थान पर जाएं।",
    en: "We understand how frightening this is. I am alerting your contact. Call police at 100 and go to the last known location.",
  },
};

export const handler = async (event) => {
  console.log("[escalation] event", JSON.stringify(event));

  const {
    caregiverId,
    message,
    sessionId = randomUUID(),
    classification,
    confidence,
  } = event;

  // Idempotency check — if we already sent an alert for this session, skip SNS
  const idempotencyKey = `escalation-${sessionId}`;
  let alreadySent = false;
  try {
    const existing = await dynamo.send(
      new GetItemCommand({
        TableName: ESCALATION_LOG_TABLE,
        Key: { conversationId: { S: idempotencyKey } },
      })
    );
    alreadySent = !!existing.Item;
  } catch (err) {
    console.error("[escalation] Idempotency check failed (non-fatal)", err);
  }

  // Load caregiver profile
  let profile;
  try {
    const result = await dynamo.send(
      new GetItemCommand({
        TableName: PROFILES_TABLE,
        Key: { caregiverId: { S: caregiverId } },
      })
    );
    profile = result.Item;
  } catch (err) {
    console.error("[escalation] Failed to load profile (non-fatal)", err);
  }

  const language = profile?.language?.S || "hi";
  const patientName = profile?.patientName?.S || "the patient";
  const emergencyContactName = profile?.emergencyContactName?.S || "Emergency Contact";
  const emergencyContactPhone = profile?.emergencyContactPhone?.S || "";

  // 1. Send SNS alert (unless already sent for this session)
  if (!alreadySent && SNS_TOPIC_ARN) {
    try {
      const alertMessage = buildSNSAlert({
        classification,
        confidence,
        caregiverId,
        patientName,
        emergencyContactName,
        message,
        sessionId,
      });

      await sns.send(
        new PublishCommand({
          TopicArn: SNS_TOPIC_ARN,
          Subject: `🚨 SAHAY ALERT: ${classification} — ${patientName}`,
          Message: alertMessage,
          MessageAttributes: {
            classification: { DataType: "String", StringValue: classification },
            caregiverId: { DataType: "String", StringValue: caregiverId },
          },
        })
      );

      console.log("[escalation] SNS alert sent successfully");
    } catch (err) {
      console.error("[escalation] SNS send failed", err);
      // Non-fatal — still return calming message to user
    }
  } else if (alreadySent) {
    console.log("[escalation] Idempotency: SNS already sent for session", sessionId);
  }

  // 2. Mark escalation as sent (idempotency write)
  if (!alreadySent) {
    try {
      await dynamo.send(
        new PutItemCommand({
          TableName: ESCALATION_LOG_TABLE,
          Item: {
            conversationId: { S: idempotencyKey },
            caregiverId: { S: caregiverId },
            sessionId: { S: sessionId },
            userMessage: { S: message },
            assistantResponse: { S: "ESCALATED" },
            distressScore: { N: "10" },
            classification: { S: classification },
            confidence: { N: String(confidence || 0) },
            timestamp: { S: new Date().toISOString() },
          },
        })
      );
    } catch (err) {
      console.error("[escalation] Failed to write idempotency record (non-fatal)", err);
    }
  }

  // 3. Build calming response
  const calmingMessages = CALMING_MESSAGES[classification] || CALMING_MESSAGES.EMERGENCY;
  const responseText = calmingMessages[language] || calmingMessages.en;

  // 4. Synthesize calming audio
  let audioUrl = null;
  try {
    audioUrl = await synthesizeWithPolly(responseText, language, sessionId, polly, s3, AUDIO_BUCKET);
  } catch (err) {
    console.error("[escalation] Polly failed (non-fatal)", err);
  }

  return {
    ...event,
    agentType: "ESCALATION",
    response: responseText,
    audioUrl,
    escalated: true,
    alertSent: !alreadySent,
  };
};

function buildSNSAlert({ classification, confidence, caregiverId, patientName, emergencyContactName, message, sessionId }) {
  const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  return `
SAHAY EMERGENCY ALERT
=====================
Type: ${classification}
Confidence: ${Math.round((confidence || 0) * 100)}%
Patient: ${patientName}
Caregiver ID: ${caregiverId}
Time (IST): ${timestamp}
Session: ${sessionId}

Caregiver's message:
"${message}"

ACTION REQUIRED:
${classification === "SELF_HARM" ? "⚠️  The caregiver may be in distress. Please contact them immediately." : ""}
${classification === "EMERGENCY" ? "🚨 Physical emergency reported. Contact caregiver immediately." : ""}
${classification === "PATIENT_MISSING" ? "🔍 Patient may be missing. Contact caregiver and check last known location." : ""}

Emergency services: 112 | Police: 100 | ARDSI Helpline: 1800-200-ARDSI
This alert was sent automatically by Sahay AI.
`.trim();
}

async function synthesizeWithPolly(text, language, sessionId, polly, s3, bucket) {
  const voiceMap = { hi: "Aditi", en: "Joanna" };
  const langCode = language === "hi" ? "hi-IN" : "en-US";

  const pollyResp = await polly.send(new SynthesizeSpeechCommand({
    Text: text,
    OutputFormat: "mp3",
    VoiceId: voiceMap[language] || "Joanna",
    LanguageCode: langCode,
  }));

  const chunks = [];
  for await (const chunk of pollyResp.AudioStream) chunks.push(chunk);
  const audioBuffer = Buffer.concat(chunks);

  const key = `audio/escalation-${sessionId}.mp3`;
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: audioBuffer, ContentType: "audio/mpeg" }));

  return await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });
}
