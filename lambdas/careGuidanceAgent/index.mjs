/**
 * careGuidanceAgent — RAG-grounded behavioral guidance (Branch A — 3.2)
 * Only reached when Triage classifies as ROUTINE.
 * Input comes from Step Functions state (includes triage output).
 */

import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { BedrockAgentRuntimeClient, RetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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
  console.log("[careGuidance] event", JSON.stringify(event));

  const { caregiverId, message, sessionId = randomUUID(), synthesizeAudio = false, requiresHumanReview = false } = event;

  // Load caregiver profile
  let profile;
  try {
    const result = await dynamo.send(new GetItemCommand({
      TableName: PROFILES_TABLE,
      Key: { caregiverId: { S: caregiverId } },
    }));
    profile = result.Item;
  } catch (err) {
    console.error("[careGuidance] Failed to load profile (non-fatal)", err);
  }

  const dementiaStage = profile?.dementiaStage?.S || "moderate";
  const language = profile?.language?.S || "hi";
  const patientName = profile?.patientName?.S || "your patient";

  // RAG retrieval
  let retrievedContext = "";
  if (KB_ID) {
    try {
      const ragResult = await bedrockAgentRuntime.send(new RetrieveCommand({
        knowledgeBaseId: KB_ID,
        retrievalQuery: { text: `${message} caregiver ${caregiverId}` },
        retrievalConfiguration: { vectorSearchConfiguration: { numberOfResults: 3 } },
      }));
      retrievedContext = (ragResult.retrievalResults || [])
        .map((r) => r.content?.text || "")
        .filter(Boolean)
        .join("\n---\n");
    } catch (err) {
      console.error("[careGuidance] RAG failed (non-fatal)", err);
    }
  }

  // Build system prompt
  const stageGuidance = {
    early: `${patientName} is in EARLY stage. Preserve autonomy, offer practical behavioral tips, reassure.`,
    moderate: `${patientName} is in MODERATE stage. Redirect rather than correct, manage behaviors calmly.`,
    severe: `${patientName} is in SEVERE stage. Focus on caregiver wellbeing and physical comfort for patient.`,
  };
  const langInstruction =
    language === "hi" ? "Respond in warm, simple Hindi (formal 'aap'). No medical jargon." :
    language === "bn" ? "Respond in warm, simple Bengali. No medical jargon." :
    "Respond in warm, simple English.";

  const humanReviewNote = requiresHumanReview
    ? "\n[NOTE: This message had ambiguous signals. Be extra attentive and gently ask if everything is safe.]" : "";

  const systemPrompt = `You are Sahay, a compassionate AI companion for Alzheimer's caregivers in India.
${stageGuidance[dementiaStage] || stageGuidance.moderate}
${langInstruction}${humanReviewNote}
Rules: Not a doctor. For any danger, say to call 112 and ARDSI (1800-200-ARDSI). Keep responses to 3-5 sentences.

Patient context:
${retrievedContext || "Use general dementia care guidance."}`;

  // Call Bedrock via Converse API
  let responseText;
  try {
    responseText = await converse({ userMessage: message, systemPrompt, maxTokens: 400 });
    if (!responseText) throw new Error("Empty response");
  } catch (err) {
    console.error("[careGuidance] Bedrock failed — using fallback", err);
    responseText = FALLBACK_RESPONSE[language] || FALLBACK_RESPONSE.en;
  }

  // Distress scoring
  let distressScore = 5;
  try {
    const scoreText = await converse({
      userMessage: `Rate caregiver distress 0-10 (0=calm, 10=crisis). Reply with ONLY a number.\nMessage: "${message}"`,
      maxTokens: 10,
    });
    const parsed = parseInt(scoreText.trim(), 10);
    if (!isNaN(parsed)) distressScore = Math.min(10, Math.max(0, parsed));
  } catch (err) {
    console.error("[careGuidance] Distress scoring failed (non-fatal)", err);
  }

  // Polly synthesis
  let audioUrl = null;
  if (synthesizeAudio) {
    try {
      audioUrl = await synthesizeWithPolly(responseText, language, sessionId);
    } catch (err) {
      console.error("[careGuidance] Polly failed (non-fatal)", err);
    }
  }

  // Persist conversation + distress score
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
    console.error("[careGuidance] Failed to persist session (non-fatal)", err);
  }

  return {
    ...event,
    agentType: "CARE_GUIDANCE",
    response: responseText,
    audioUrl,
    distressScore,
    conversationId,
  };
};

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
