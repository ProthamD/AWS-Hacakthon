/**
 * voiceCompanionHandler — Groq-powered AI for the Patient Companion app
 *
 * POST /patient/voice
 * Body: { transcript, patientProfile, sessionHistory? }
 *
 * Returns:
 *  { response: string, isDistress: boolean, distressScore: number (1-10),
 *    shouldAlertCaregiver: boolean, intent: string }
 */

import { ok, badRequest, serverError } from "../shared/response.mjs";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL = "llama-3.3-70b-versatile";

export const handler = async (event) => {
  console.log("[voiceCompanion] event", JSON.stringify(event).slice(0, 500));

  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    return badRequest("Invalid JSON");
  }

  const { transcript, patientProfile = {}, sessionHistory = [] } = body || {};
  if (!transcript || transcript.trim().length < 2) {
    return badRequest("transcript is required");
  }

  if (!GROQ_API_KEY) {
    return serverError("GROQ_API_KEY not configured", new Error("missing key"));
  }

  // Build the system prompt with patient context
  const systemPrompt = buildSystemPrompt(patientProfile);

  // Build message history (last 6 turns max to keep token count low)
  const messages = [
    { role: "system", content: systemPrompt },
    ...sessionHistory.slice(-6),
    { role: "user", content: transcript },
  ];

  let aiResponse, distressScore, isDistress, shouldAlertCaregiver, intent;

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
        temperature: 0.4,
        max_tokens: 300,
        response_format: { type: "json_object" },
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      console.error("[voiceCompanion] Groq error:", err);
      return fallbackResponse(transcript, patientProfile);
    }

    const data = await groqRes.json();
    const raw = data.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    aiResponse = parsed.response || "You are safe. Please stay where you are.";
    distressScore = Math.min(10, Math.max(1, parseInt(parsed.distress_score) || 1));
    isDistress = distressScore >= 5;
    shouldAlertCaregiver = distressScore >= 7;
    intent = parsed.intent || "unknown";

    console.log(`[voiceCompanion] transcript="${transcript}" intent="${intent}" distress=${distressScore}`);

  } catch (err) {
    console.error("[voiceCompanion] Fetch failed:", err);
    return fallbackResponse(transcript, patientProfile);
  }

  return ok({
    response: aiResponse,
    isDistress,
    distressScore,
    shouldAlertCaregiver,
    intent,
    assistantMessage: { role: "assistant", content: aiResponse },
  });
};

function buildSystemPrompt(profile) {
  const name = profile.patientName || "the patient";
  const age = profile.patientAge ? `${profile.patientAge} years old` : null;
  const stage = profile.dementiaStage || "moderate";
  const routine = profile.dailyRoutine || null;
  const relationships = profile.keyRelationships || null;
  const likes = profile.likesAndDislikes || null;
  const contact = profile.emergencyContactName || "their caregiver";
  const contactPhone = profile.emergencyContactPhone || null;
  const address = profile.homeAddress || null;

  return `You are Sahay, a calm and gentle AI voice companion for an Alzheimer's patient.

PATIENT PROFILE:
- Name: ${name}${age ? `, ${age}` : ""}
- Dementia stage: ${stage}
- Emergency contact: ${contact}${contactPhone ? ` (${contactPhone})` : ""}
${address ? `- Safe Destination / Home: ${address}` : ""}
${routine ? `- Daily routine: ${routine}` : ""}
${relationships ? `- Key relationships: ${relationships}` : ""}
${likes ? `- Likes/dislikes: ${likes}` : ""}

YOUR JOB:
1. Listen to what the patient says and respond with warmth, patience and calm.
2. If their name is known, use it naturally. If their name is "the patient" or unknown, do not mention their name (do not say "the patient" or "undefined").
3. If they are confused about who they are, remind them gently if you have their name. If not, say "I don't have your name right now, but you are completely safe."
4. If they are lost or scared, reassure them and tell them to stay put.
5. If they ask about their destination or routine, tell them using the profile above. If no routine is listed, just tell them to stay where they are and wait for their caregiver.
6. NEVER say you are an AI unless directly asked. Act like a caring companion.
7. Keep responses SHORT (2-3 sentences max) — they may have trouble following long text.
8. Speak as if they can hear you — this is voice output, not text.
9. BACKGROUND NOISE RULE: If the transcript appears to be the patient talking to someone else, TV noise, or unrelated chatter AND they are NOT in distress AND they have NOT said "Sahay" AND they have NOT asked a direct question, set intent to "ignore" and response to "". ALWAYS respond if the patient: (a) says "Sahay", (b) asks any question, (c) shows confusion or distress.

RESPONSE FORMAT — you must ALWAYS respond with valid JSON:
{
  "response": "Your spoken response to the patient here (or empty string if intent is ignore)",
  "intent": "one of: name_query | destination_query | lost | scared | routine_query | greeting | distress | ignore | other",
  "distress_score": <integer 1-10, where 1=calm, 5=confused, 7=distressed, 10=emergency>,
  "reasoning": "brief note on why you assigned that score"
}

EXAMPLES (calibration):
- "what is my name" → distress_score: 3, intent: "name_query"
- "i dont know where i am" → distress_score: 7, intent: "lost"
- "i am scared help me" → distress_score: 9, intent: "scared"
- "who are you" → distress_score: 1, intent: "greeting"
- "where am i going" → distress_score: 4, intent: "destination_query"
- "show me the route" → distress_score: 2, intent: "destination_query"
- "sahay can you help me" → distress_score: 3, intent: "greeting"  ← casual request, NOT emergency
- "hey ravi pass the salt" → distress_score: 1, intent: "ignore", response: ""
- "the weather is nice today" → distress_score: 1, intent: "ignore", response: ""
- "i need help i am lost" → distress_score: 8, intent: "lost"
- "please help emergency" → distress_score: 10, intent: "distress"`;

}

function fallbackResponse(transcript, profile) {
  const name = profile?.patientName || "dear";
  const contact = profile?.emergencyContactName || "your caregiver";

  const t = transcript.toLowerCase();
  let response, intent;
  
  if (t.includes("name") || t.includes("who am i")) {
    response = `Your name is ${name}. You are safe and everything is okay.`;
    intent = "name_query";
  } else if (t.includes("lost") || t.includes("where am i")) {
    response = `${name}, please stay exactly where you are. ${contact} is on their way to you.`;
    intent = "lost";
  } else if (t.includes("help") || t.includes("scared")) {
    response = `${name}, you are safe. I am here with you. Take a deep breath. ${contact} has been alerted.`;
    intent = "distress";
  } else if (t.includes("route") || t.includes("destination") || t.includes("where should i go")) {
    response = `I am bringing up the map to your safe destination now.`;
    intent = "destination_query";
  } else {
    response = `${name}, you are safe. I am Sahay, your companion. How can I help you?`;
    intent = "fallback";
  }

  return ok({
    response,
    isDistress: intent === "distress" || intent === "lost",
    distressScore: 5,
    shouldAlertCaregiver: intent === "distress" || intent === "lost",
    intent,
    assistantMessage: { role: "assistant", content: response },
  });
}
