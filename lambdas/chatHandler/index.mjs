/**
 * chatHandler — main caregiver chat endpoint (Branch A — 3.1).
 *
 * POST /chat
 * Body: {
 *   caregiverId: string,
 *   message: string,
 *   sessionId?: string,
 *   synthesizeAudio?: boolean
 * }
 *
 * Flow:
 *  1. Load caregiver profile from DynamoDB
 *  2. Query Bedrock Knowledge Base (RAG) for patient context
 *  3. Build care-stage-adaptive system prompt
 *  4. Call Bedrock via Converse API (amazon.nova-lite-v1:0)
 *  5. Optionally synthesize audio via Polly
 *  6. Write conversation + distress score to DynamoDB
 */

import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { BedrockAgentRuntimeClient, RetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ok, badRequest } from "../shared/response.mjs";
import { converse } from "../shared/bedrock.mjs";
import { randomUUID } from "crypto";

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION });
const bedrockAgentRuntime = new BedrockAgentRuntimeClient({ region: process.env.AWS_REGION });
const polly = new PollyClient({ region: process.env.AWS_REGION });
const s3 = new S3Client({ region: process.env.AWS_REGION });

const PROFILES_TABLE = process.env.CAREGIVER_PROFILES_TABLE;
const CONVERSATIONS_TABLE = process.env.CONVERSATION_LOGS_TABLE;
const DISTRESS_TABLE = process.env.DISTRESS_SCORES_TABLE;
const KB_ID = process.env.BEDROCK_KB_ID;
const AUDIO_BUCKET = process.env.AUDIO_BUCKET;

const FALLBACK_RESPONSE = {
  hi: "मुझे खेद है, मैं अभी आपकी सहायता नहीं कर पा रहा हूँ। कृपया ARDSI हेल्पलाइन 1800-200-ARDSI पर कॉल करें।",
  bn: "আমি এখন সাহায্য করতে পারছি না। অনুগ্রহ করে ARDSI হেল্পলাইনে যোগাযোগ করুন।",
  en: "I'm unable to help right now. Please call the ARDSI helpline at 1800-200-ARDSI.",
};

export const handler = async (event) => {
  console.log("[chat] event", JSON.stringify(event));

  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { caregiverId, message, sessionId = randomUUID(), synthesizeAudio = false } = body || {};
  if (!caregiverId || !message) return badRequest("caregiverId and message are required");

  // 1. Load caregiver profile
  let profile;
  try {
    const result = await dynamo.send(new GetItemCommand({
      TableName: PROFILES_TABLE,
      Key: { caregiverId: { S: caregiverId } },
    }));
    profile = result.Item;
  } catch (err) {
    console.error("[chat] Failed to load profile (non-fatal)", err);
  }

  const dementiaStage = profile?.dementiaStage?.S || "moderate";
  const language = profile?.language?.S || "hi";
  const patientName = profile?.patientName?.S || "your patient";

  // 2. RAG retrieval
  let retrievedContext = "";
  if (KB_ID) {
    try {
      const ragResult = await bedrockAgentRuntime.send(new RetrieveCommand({
        knowledgeBaseId: KB_ID,
        retrievalQuery: { text: `${message} — caregiver ${caregiverId}` },
        retrievalConfiguration: { vectorSearchConfiguration: { numberOfResults: 3 } },
      }));
      retrievedContext = (ragResult.retrievalResults || [])
        .map((r) => r.content?.text || "")
        .filter(Boolean)
        .join("\n---\n");
      console.log("[chat] RAG retrieved", retrievedContext.length, "chars");
    } catch (err) {
      console.error("[chat] RAG failed (non-fatal)", err);
    }
  }

  // 3. Build system prompt
  const systemPrompt = buildSystemPrompt(dementiaStage, patientName, language, retrievedContext);

  // 4. Call Bedrock (Nova Lite via Converse API)
  let responseText;
  try {
    responseText = await converse({ userMessage: message, systemPrompt, maxTokens: 400 });
    if (!responseText) throw new Error("Empty response");
  } catch (err) {
    console.error("[chat] Bedrock failed — using fallback", err);
    responseText = FALLBACK_RESPONSE[language] || FALLBACK_RESPONSE.en;
  }

  // 5. Distress score
  let distressScore = 5;
  try {
    const scoreText = await converse({
      userMessage: `Rate the emotional distress of this caregiver message 0-10 (0=calm, 10=crisis/self-harm). Reply with ONLY a single integer.\n\nMessage: "${message}"`,
      maxTokens: 10,
    });
    const parsed = parseInt(scoreText.trim(), 10);
    if (!isNaN(parsed)) distressScore = Math.min(10, Math.max(0, parsed));
  } catch (err) {
    console.error("[chat] Distress scoring failed (non-fatal)", err);
  }

  // 6. Polly audio (optional)
  let audioUrl = null;
  if (synthesizeAudio) {
    try {
      audioUrl = await synthesizeWithPolly(responseText, language, sessionId);
    } catch (err) {
      console.error("[chat] Polly failed (non-fatal)", err);
    }
  }

  // 7. Persist conversation + distress score
  const now = new Date().toISOString();
  const conversationId = randomUUID();
  try {
    await Promise.all([
      dynamo.send(new PutItemCommand({
        TableName: CONVERSATIONS_TABLE,
        Item: {
          conversationId: { S: conversationId },
          caregiverId: { S: caregiverId },
          sessionId: { S: sessionId },
          userMessage: { S: message },
          assistantResponse: { S: responseText },
          distressScore: { N: String(distressScore) },
          timestamp: { S: now },
        },
      })),
      dynamo.send(new PutItemCommand({
        TableName: DISTRESS_TABLE,
        Item: {
          scoreId: { S: conversationId },
          caregiverId: { S: caregiverId },
          score: { N: String(distressScore) },
          timestamp: { S: now },
          sessionSummary: { S: message.substring(0, 200) },
        },
      })),
    ]);
  } catch (err) {
    console.error("[chat] Failed to persist session (non-fatal)", err);
  }

  return ok({ sessionId, response: responseText, audioUrl, distressScore });
};

function buildSystemPrompt(stage, patientName, language, context) {
  const stageGuidance = {
    early: `The patient (${patientName}) is in EARLY stage dementia. Preserve their autonomy and dignity. Offer specific, practical behavioral tips. Reassure the caregiver that some confusion is expected and manageable.`,
    moderate: `The patient (${patientName}) is in MODERATE stage dementia. Redirect rather than correct. Keep instructions simple. Help the caregiver manage difficult behaviors (wandering, aggression, repetition) with calm, evidence-based techniques.`,
    severe: `The patient (${patientName}) is in SEVERE stage dementia. The caregiver's own wellbeing is equally important now. Offer comfort and validation. Focus on physical comfort for the patient. Encourage respite care.`,
  };

  const langInstruction =
    language === "hi" ? "Respond in simple, warm Hindi. Use formal 'aap'. Avoid medical jargon." :
    language === "bn" ? "Respond in simple, warm Bengali. Use formal 'apni'. Avoid medical jargon." :
    "Respond in simple, warm English. Avoid medical jargon.";

  return `You are Sahay, a compassionate AI companion for family caregivers of Alzheimer's patients in India.

${stageGuidance[stage] || stageGuidance.moderate}

${langInstruction}

IMPORTANT RULES:
- You are NOT a doctor. Never diagnose or make medical claims.
- If there is ANY mention of physical danger, fall, chest pain, patient missing, or caregiver expressing self-harm, say: "This sounds like an emergency. Please call 112 now. I am alerting your emergency contact."
- Always provide escalation: ARDSI helpline 1800-200-ARDSI and iCall 9152987821.
- Keep responses to 3-5 sentences — the caregiver may be in a stressful moment.
- Ground your response in the specific patient details below when available.

PATIENT CONTEXT (retrieved from caregiver profile):
${context || "No specific context available — use general dementia care guidance."}`;
}

async function synthesizeWithPolly(text, language, sessionId) {
  const voiceMap = { hi: "Aditi", bn: "Aditi", en: "Joanna" };
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

  const key = `audio/${sessionId}/${Date.now()}.mp3`;
  await s3.send(new PutObjectCommand({ Bucket: AUDIO_BUCKET, Key: key, Body: audioBuffer, ContentType: "audio/mpeg" }));
  return await getSignedUrl(s3, new GetObjectCommand({ Bucket: AUDIO_BUCKET, Key: key }), { expiresIn: 3600 });
}
