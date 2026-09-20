/**
 * chatHandler — Groq-powered caregiver chat endpoint
 *
 * POST /chat
 * Body: { caregiverId, message, sessionId?, language? }
 *
 * Uses Groq llama-3.3-70b-versatile (same as voiceCompanionHandler).
 * Supports Hindi, Bengali, English.
 * Returns: { response, distressScore, wellbeingScore, sessionId, intent }
 */

import { ok, badRequest, serverError } from "../shared/response.mjs";
import { randomUUID } from "crypto";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL        = "qwen/qwen3.8-27b";

export const handler = async (event) => {
  console.log("[chat] event", JSON.stringify(event).slice(0, 500));

  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const {
    caregiverId,
    message,
    sessionId    = randomUUID(),
    language     = "en",
    sessionHistory = [],
    patientProfile = {},
  } = body || {};

  if (!message) return badRequest("message is required");
  if (!GROQ_API_KEY) return serverError("GROQ_API_KEY not configured", new Error("missing key"));

  const systemPrompt = buildCaregiverPrompt(patientProfile, language);

  const messages = [
    { role: "system", content: systemPrompt },
    ...sessionHistory.slice(-10),
    { role: "user", content: message },
  ];

  try {
    const groqRes = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.5,
        max_tokens: 500,
        response_format: { type: "json_object" },
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error("[chat] Groq error:", groqRes.status, errText);
      return ok(fallbackChat(message, language));
    }

    const data    = await groqRes.json();
    const content = data.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Strip markdown fences if somehow present
      const clean = content.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1").trim();
      try { parsed = JSON.parse(clean); } catch { parsed = {}; }
    }

    const response       = parsed.response       || parsed.reply || parsed.message || content;
    const distressScore  = Math.min(10, Math.max(1, parseInt(parsed.distress_score  || parsed.distressScore)  || 3));
    const wellbeingScore = Math.min(10, Math.max(1, parseInt(parsed.wellbeing_score || parsed.wellbeingScore) || 7));
    const intent         = parsed.intent || "general";

    console.log(`[chat] message="${message.slice(0,60)}" intent="${intent}" distress=${distressScore}`);

    return ok({
      response,
      distressScore,
      wellbeingScore,
      intent,
      sessionId,
      assistantMessage: { role: "assistant", content: response },
    });

  } catch (err) {
    console.error("[chat] Fetch error:", err);
    return ok(fallbackChat(message, language));
  }
};

function buildCaregiverPrompt(profile, language) {
  const patientName    = profile.patientName    || "the patient";
  const stage          = profile.dementiaStage  || "moderate";
  const routine        = profile.dailyRoutine   || null;
  const relationships  = profile.keyRelationships || null;
  const likes          = profile.likesAndDislikes || null;
  const contact        = profile.emergencyContactName || null;

  const langInstr = language === "hi"
    ? "Respond in Hindi (Devanagari script). Mix English words if helpful for clarity."
    : language === "bn"
    ? "Respond in Bengali (বাংলা script)."
    : "Respond in English.";

  return `You are Sahay, a compassionate AI care assistant for family caregivers of Alzheimer's patients.

PATIENT BEING CARED FOR:
- Name: ${patientName}
- Dementia stage: ${stage}
${routine        ? `- Daily routine: ${routine}`                : ""}
${relationships  ? `- Key relationships: ${relationships}`      : ""}
${likes          ? `- Likes/dislikes: ${likes}`                 : ""}
${contact        ? `- Emergency contact: ${contact}`            : ""}

LANGUAGE INSTRUCTION: ${langInstr}

YOUR ROLE:
1. Support the CAREGIVER (not the patient) — they are stressed, tired, and need practical help.
2. Provide evidence-based Alzheimer's caregiving tips and emotional support.
3. Help them understand dementia symptoms and manage difficult behaviours.
4. Suggest coping strategies, self-care, and when to seek professional help.
5. Be warm, non-judgmental, and compassionate. Caregiving is exhausting.
6. Detect caregiver distress (burnout, depression, hopelessness) and respond with extra care.
7. If there is a patient emergency, recommend calling 112 or the caregiver's local emergency number.

RESPONSE FORMAT — Return ONLY a raw JSON object:
{"response": "Your reply to the caregiver here", "intent": "emotional_support | caregiving_advice | emergency | information | other", "distress_score": <1-10 caregiver distress>, "wellbeing_score": <1-10 caregiver wellbeing>}

CALIBRATION:
- distress_score 1-3: caregiver seems calm, just asking questions
- distress_score 4-6: caregiver frustrated or tired
- distress_score 7-9: caregiver overwhelmed or burnt out
- distress_score 10: caregiver in crisis`;
}

function fallbackChat(message, language) {
  const responses = {
    hi: "मैं आपकी बात समझता हूँ। देखभाल करना बहुत कठिन है, लेकिन आप अकेले नहीं हैं। क्या आप मुझे और बता सकते हैं?",
    bn: "আমি বুঝতে পারছি। পরিচর্যা করা কঠিন, কিন্তু আপনি একা নন। আরো বলুন।",
    en: "I understand how challenging caregiving can be. You are not alone in this. Can you tell me more about what's happening?",
  };
  return {
    response: responses[language] || responses.en,
    distressScore: 5,
    wellbeingScore: 5,
    intent: "emotional_support",
    sessionId: randomUUID(),
    assistantMessage: { role: "assistant", content: responses[language] || responses.en },
  };
}
