/**
 * voiceCompanionHandler — AI voice companion for Alzheimer's patients
 *
 * POST /patient/voice
 * Body: { transcript, patientProfile, sessionHistory? }
 *
 * Pipeline:
 *  1. Groq LLaMA — understands patient speech, decides intent + spoken reply
 *  2. AWS Polly  — converts reply to natural Indian English audio (Aditi voice)
 *  3. Returns both text response AND base64 audio for the frontend to play
 */

import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { ok, badRequest, serverError } from "../shared/response.mjs";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = process.env.GROQ_API_KEY;
// Available models on this API key: qwen/qwen3.8-27b (best JSON compliance)
const MODEL = "qwen/qwen3.8-27b";

const polly = new PollyClient({ region: process.env.AWS_REGION || "ap-south-1" });

export const handler = async (event) => {
  console.log("[voiceCompanion] event", JSON.stringify(event).slice(0, 500));

  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    return badRequest("Invalid JSON");
  }

  const { transcript, patientProfile = {}, sessionHistory = [], currentLocation = null } = body || {};
  if (!transcript || transcript.trim().length < 2) {
    return badRequest("transcript is required");
  }
  if (!GROQ_API_KEY) {
    return serverError("GROQ_API_KEY not configured", new Error("missing key"));
  }

  const systemPrompt = buildSystemPrompt(patientProfile);
  const messages = [
    { role: "system", content: systemPrompt },
    ...sessionHistory.slice(-6),
    { role: "user", content: transcript },
  ];

  let aiResponse = "", distressScore = 1, isDistress = false,
      shouldAlertCaregiver = false, intent = "other";

  // Groq with 8s timeout — prevents P99 tail hangs on slow responses
  const groqController = new AbortController();
  const groqTimeout = setTimeout(() => groqController.abort(), 8_000);

  try {
    const groqRes = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: groqController.signal,
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.35,
        max_tokens: 280,         // reduced from 300 — tighter = faster
        // Note: qwen/qwen3.8-27b follows JSON instructions without response_format mode
      }),
    });
    clearTimeout(groqTimeout);

    if (!groqRes.ok) {
      clearTimeout(groqTimeout);
      if (groqRes.status === 429) {
        // Rate-limited — don't waste time parsing body, go straight to fallback
        console.warn("[voiceCompanion] Groq 429 rate-limited — using offline fallback");
        return fallbackResponse(transcript, patientProfile);
      }
      if (groqRes.status >= 500) {
        console.error("[voiceCompanion] Groq server error:", groqRes.status);
        return fallbackResponse(transcript, patientProfile);
      }
      const err = await groqRes.text();
      console.error("[voiceCompanion] Groq error:", err);
      return fallbackResponse(transcript, patientProfile);
    }

    const data = await groqRes.json();
    const rawContent = data.choices?.[0]?.message?.content || "{}";

    // Strip markdown fences if somehow present despite JSON mode
    let jsonStr = rawContent.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.warn("[voiceCompanion] JSON parse failed:", rawContent.slice(0, 200));
      parsed = {};
    }

    aiResponse    = parsed.response    || "";
    distressScore = Math.min(10, Math.max(1, parseInt(parsed.distress_score) || 1));
    isDistress    = distressScore >= 5;
    shouldAlertCaregiver = distressScore >= 7;
    intent        = parsed.intent || "other";

    // ── Post-processing intent + score correction ────────────────────────────
    // Groq's single-pass JSON generation misclassifies specific phrase patterns.
    // We correct both intent label AND distress scores when needed.
    const tLow = transcript.toLowerCase();

    // Emergency override — always fires regardless of what Groq said
    const EMERGENCY = ['fell down','cannot get up',"can't get up",'chest hurt','chest pain',
                       'cannot breathe',"can't breathe",'i am dying','i\'m dying','call someone',
                       'call my son','call my daughter','i need emergency'];
    if (EMERGENCY.some(w => tLow.includes(w))) {
      intent = "distress";
      distressScore = 9;
      isDistress = true;
      shouldAlertCaregiver = true;
    } else if (intent === "other" || intent === "ignore") {
      // Navigation / location
      const NAV = ['route','direction','navigate','map','get home','which way',
                   'where to go','where do i','where should i','tell me where','give me my',
                   'how do i get','show me the way','where am i going','where do i need',
                   'where is my destination','my destination','should i go',
                   'where should','where can i go'];
      // Ignore — clearly talking to someone else
      const IGNORE = ['pass the salt','pass me the','give me the','can you give','have you seen',
                      'did you hear','let me tell','good morning everyone'];
      if (NAV.some(w => tLow.includes(w))) {
        intent = "destination_query";
      } else if (IGNORE.some(w => tLow.includes(w))) {
        intent = "ignore";
        distressScore = 1; isDistress = false; shouldAlertCaregiver = false;
      } else if (['who are you','what are you','hello','hi sahay','hey sahay','are you a robot','are you real'].some(w => tLow.includes(w))) {
        intent = "greeting";
        distressScore = 1; isDistress = false; shouldAlertCaregiver = false;
      } else if (['i am lost',"i'm lost",'where am i'].some(w => tLow.includes(w))) {
        intent = "lost";
      } else if (['my name','who am i','what am i called'].some(w => tLow.includes(w))) {
        intent = "name_query";
      } else if (['scared','afraid','frightened','help me','i need help'].some(w => tLow.includes(w))) {
        intent = "scared";
      }
    }

    // Fix under-scored distress — Groq sometimes returns score=5 for clearly scared/lost
    if (intent === "scared"  && distressScore < 7)  distressScore = 7;
    if (intent === "lost"    && distressScore < 7)  distressScore = 7;
    if (intent === "distress" && distressScore < 9) distressScore = 9;
    if (intent === "greeting" && distressScore > 2) distressScore = 1;
    if (intent === "ignore"   && distressScore > 1) distressScore = 1;
    // Re-derive flags from corrected score
    isDistress           = distressScore >= 5;
    shouldAlertCaregiver = distressScore >= 7;

    // If Groq returned empty response but we identified the intent, fill in appropriate text
    if (!aiResponse && intent !== "other" && intent !== "ignore") {
      const name    = patientProfile.patientName || "";
      const nameStr = name ? `${name}, ` : "";
      const contact = patientProfile.emergencyContactName || "your caregiver";
      const address = patientProfile.homeAddress || "your safe destination";
      if (intent === "greeting")          aiResponse = name ? `I am Sahay, your voice companion. I am always here to help you, ${name}.` : "I am Sahay, your voice companion. I am always here to help you.";
      else if (intent === "name_query")   aiResponse = name ? `Your name is ${name}. You are safe and I am right here with you.` : "I am Sahay, your companion. You are completely safe.";
      else if (intent === "destination_query") aiResponse = `${nameStr}I am pulling up your route to ${address} right now. Please stay where you are.`;
      else if (intent === "lost")         aiResponse = `${nameStr}please stay exactly where you are. ${contact} is on their way to you.`;
      else if (intent === "scared")       aiResponse = `${nameStr}you are safe. Take a deep breath. I am right here with you.`;
      else if (intent === "distress")     aiResponse = `${nameStr}I am alerting ${contact} right now. Please stay where you are. Help is coming.`;
    }

    console.log(`[voiceCompanion] transcript="${transcript}" intent="${intent}" distress=${distressScore} hasResponse=${!!aiResponse}`);

  } catch (err) {
    clearTimeout(groqTimeout);
    if (err.name === 'AbortError') {
      console.warn("[voiceCompanion] Groq timed out after 8s — using fallback");
    } else {
      console.error("[voiceCompanion] Fetch failed:", err);
    }
    return await fallbackResponse(transcript, patientProfile);
  }

  // Trim spoken response — strip markdown artifacts before sending to Polly
  aiResponse = aiResponse.trim().replace(/^["']+|["']+$/g, '').slice(0, 500);

  if (!aiResponse) {
    return await fallbackResponse(transcript, patientProfile);
  }

  // ── Run Polly + map resolution in PARALLEL (both are independent of each other) ──
  const needsMap = ['destination_query','lost'].includes(intent);
  const [audioBase64, mapRoute] = await Promise.all([
    // Polly TTS synthesis
    (async () => {
      try {
        const pollyRes = await polly.send(new SynthesizeSpeechCommand({
          Text: aiResponse,
          OutputFormat: "mp3",
          VoiceId: "Aditi",
          Engine: "standard",
          LanguageCode: "en-IN",
        }));
        if (pollyRes.AudioStream) {
          const chunks = [];
          for await (const chunk of pollyRes.AudioStream) chunks.push(chunk);
          return Buffer.concat(chunks).toString("base64");
        }
        return null;
      } catch (pollyErr) {
        console.warn("[voiceCompanion] Polly failed (non-fatal):", pollyErr.message);
        return null;
      }
    })(),
    // Map destination resolution (CPU-only, no I/O, but done in parallel)
    Promise.resolve(needsMap ? resolveMapDestination(patientProfile, currentLocation, transcript, intent) : null),
  ]);

  return ok({
    response: aiResponse,
    audioBase64,
    audioMimeType: "audio/mpeg",
    isDistress,
    distressScore,
    shouldAlertCaregiver,
    intent,
    mapRoute,          // { address, label, reason, mapsUrl } — use this for the map
    assistantMessage: { role: "assistant", content: aiResponse },
  });
};


/**
 * Resolve which map destination to show.
 *
 * Rules:
 *  1. HIGH PRIORITY scheduledDestination → always route there
 *  2. "lost" intent OR explicit home phrase → home (or closer if coords available)
 *  3. Destination query without "home" phrasing AND scheduledDestination set → destination
 *  4. Both exist but no coords → scheduledDestination preferred for dest queries, Home for lost/home queries
 *  5. Only one option → use it
 *  6. Nothing → GPS-only
 */
function resolveMapDestination(profile, currentLocation, transcript = '', intent = 'destination_query') {
  const home        = profile.homeAddress          || null;
  const destination = profile.scheduledDestination || null;
  const priority    = profile.destinationPriority  || 'normal';
  const destLat     = parseFloat(profile.destinationLat) || null;
  const destLng     = parseFloat(profile.destinationLng) || null;
  const homeLat     = parseFloat(profile.homeLat) || null;
  const homeLng     = parseFloat(profile.homeLng) || null;

  const originStr = currentLocation
    ? `${currentLocation.lat},${currentLocation.lng}`
    : null;

  function mapsUrl(destAddress) {
    if (!originStr) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destAddress)}`;
    return `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${encodeURIComponent(destAddress)}&travelmode=walking`;
  }

  // Detect if the patient explicitly asked about HOME vs DESTINATION
  const t = transcript.toLowerCase();
  const isHomeQuery = ['get home','go home','route home','way home','take me home',
                       'back home','return home','home please','home address'].some(w => t.includes(w));
  const isDestQuery = ['destination','where should i go','where do i need','where do i go',
                       'where am i going','where am i supposed','what is my schedule',
                       'where is my appointment'].some(w => t.includes(w));
  const isLostIntent = intent === 'lost';

  // 1. HIGH PRIORITY: always route to destination
  if (priority === 'high' && destination) {
    return { address: destination, label: 'Your scheduled destination', reason: 'high_priority', mapsUrl: mapsUrl(destination) };
  }

  // 2. Explicit HOME query → always home
  if (isHomeQuery && home) {
    return { address: home, label: 'Home', reason: 'home_query', mapsUrl: mapsUrl(home) };
  }

  // 3. Explicit DESTINATION query → scheduledDestination if set
  if (isDestQuery && destination) {
    return { address: destination, label: 'Your scheduled destination', reason: 'destination_query', mapsUrl: mapsUrl(destination) };
  }

  // 4. Both exist + GPS coordinates for both → Haversine pick the closer one
  if (home && destination && currentLocation && destLat && destLng && homeLat && homeLng) {
    const distToHome = haversineKm(currentLocation.lat, currentLocation.lng, homeLat, homeLng);
    const distToDest = haversineKm(currentLocation.lat, currentLocation.lng, destLat, destLng);
    console.log(`[mapRoute] distToHome=${distToHome.toFixed(2)}km distToDest=${distToDest.toFixed(2)}km`);
    if (distToDest < distToHome) {
      return { address: destination, label: 'Your scheduled destination', reason: `closer (${distToDest.toFixed(1)}km vs home ${distToHome.toFixed(1)}km)`, mapsUrl: mapsUrl(destination) };
    }
    return { address: home, label: 'Home', reason: `closer (${distToHome.toFixed(1)}km vs dest ${distToDest.toFixed(1)}km)`, mapsUrl: mapsUrl(home) };
  }

  // 5. Both exist but no coords — use semantic intent to pick
  //    Lost/confused → home is safer. Destination query → show scheduled destination.
  if (home && destination) {
    if (isLostIntent) {
      return { address: home, label: 'Home', reason: 'lost_route_home', mapsUrl: mapsUrl(home) };
    }
    // General destination query with no explicit home/dest phrasing → prefer scheduledDestination
    return { address: destination, label: 'Your scheduled destination', reason: 'preferred_destination', mapsUrl: mapsUrl(destination) };
  }

  // 6. Only scheduledDestination
  if (destination) {
    return { address: destination, label: 'Your scheduled destination', reason: 'only_destination_set', mapsUrl: mapsUrl(destination) };
  }

  // 7. Only home
  if (home) {
    return { address: home, label: 'Home', reason: 'only_home_set', mapsUrl: mapsUrl(home) };
  }

  // 8. Nothing configured
  return null;
}

function buildSystemPrompt(profile) {
  const name    = profile.patientName    || null;
  const age     = profile.patientAge    ? `${profile.patientAge} years old` : null;
  const stage   = profile.dementiaStage || "moderate";
  const routine = profile.dailyRoutine  || null;
  const rels    = profile.keyRelationships || null;
  const likes   = profile.likesAndDislikes || null;
  const contact = profile.emergencyContactName  || "their caregiver";
  const phone   = profile.emergencyContactPhone || null;
  const address = profile.homeAddress   || null;

  return `You are Sahay, a compassionate AI voice companion for an Alzheimer's patient.

PATIENT PROFILE:
${name    ? `- Name: ${name}${age ? `, ${age}` : ""}` : "- Name: unknown (do NOT say 'the patient' or 'undefined')"}
- Dementia stage: ${stage}
- Emergency contact: ${contact}${phone ? ` (${phone})` : ""}
${address ? `- Home / safe destination: ${address}` : "- Home address: not set"}
${routine ? `- Daily routine: ${routine}` : ""}
${rels    ? `- Key people: ${rels}`       : ""}
${likes   ? `- Likes/dislikes: ${likes}`  : ""}

RESPONSE STYLE:
- Speak warmly, slowly, simply — like a caring family member.
- Use the patient's name naturally (if known).
- Maximum 2 short sentences. They struggle with long text.
- This is SPOKEN audio — no lists, no markdown, no formatting.
- Never say you are an AI unless directly asked.

INTENT RULES — pick exactly one intent for every message:
- "name_query"        → patient asks who they are, their name, their identity
- "destination_query" → patient asks where to go, for directions, their location, route, how to get somewhere, navigation, map, "where do I need to go", "tell me where to go", "give me my location", "what is my location"
- "lost"              → patient says they are lost, doesn't know where they are
- "scared"            → patient expresses fear, panic, anxiety
- "distress"          → emergency: fell, chest pain, can't move
- "routine_query"     → patient asks what they should be doing today
- "greeting"          → hello, hi, who are you, what are you
- "ignore"            → clearly background noise or patient talking to someone else (not Sahay) and NOT in distress
- "other"             → general conversation not fitting the above

CRITICAL: For ANY question about WHERE to go, navigation, location, route, directions, how to get home — use "destination_query". NEVER use "other" for navigation questions.
CRITICAL: "who are you", "what are you", "are you a robot" → ALWAYS "greeting", never "other".
CRITICAL: "hello", "hi", "hello sahay", "hey sahay", any greeting → ALWAYS "greeting".
CRITICAL: "can you tell me where I need to go", "tell me where to go", "where do I need to go" → ALWAYS "destination_query".

If intent is "ignore": respond with empty string "".
If intent is "destination_query" and home address is set: tell them you are showing them the route to ${address || "their safe destination"}.
If intent is "lost": tell them to stay where they are and that ${contact} is coming.

RESPOND with a single raw JSON object (no markdown, no backticks):
{"response": "spoken reply here", "intent": "one intent from above", "distress_score": <1-10>, "reasoning": "one line"}

Distress scale: 1=calm, 3=slightly confused, 5=confused, 7=distressed, 9=frightened, 10=emergency

CALIBRATION EXAMPLES (study these carefully):
- "what is my name"                    → intent: "name_query",        distress: 3
- "who am I"                           → intent: "name_query",        distress: 4
- "I am lost"                          → intent: "lost",              distress: 7
- "where am I"                         → intent: "lost",              distress: 7
- "I don't know where I am"            → intent: "lost",              distress: 7
- "I am scared help me"                → intent: "scared",            distress: 9
- "I am afraid"                        → intent: "scared",            distress: 8
- "who are you"                        → intent: "greeting",          distress: 1
- "what are you"                       → intent: "greeting",          distress: 1
- "hello sahay"                        → intent: "greeting",          distress: 1
- "hi"                                 → intent: "greeting",          distress: 1
- "where am I going"                   → intent: "destination_query", distress: 4
- "show me the route home"             → intent: "destination_query", distress: 2
- "can you tell me where I need to go" → intent: "destination_query", distress: 3
- "tell me where to go"                → intent: "destination_query", distress: 3
- "where do I need to go"              → intent: "destination_query", distress: 3
- "give me my location"                → intent: "destination_query", distress: 4
- "what is my location"                → intent: "destination_query", distress: 3
- "how do I get home"                  → intent: "destination_query", distress: 5
- "which way should I go"              → intent: "destination_query", distress: 4
- "hey ravi pass the salt"             → intent: "ignore",            distress: 1, response: ""
- "the weather is nice today"          → intent: "ignore",            distress: 1, response: ""
- "I need help emergency"              → intent: "distress",          distress: 10`;
}

async function fallbackResponse(transcript, profile) {
  const name    = profile?.patientName || null;
  const nameStr = name ? `${name}, ` : "";
  const contact = profile?.emergencyContactName || "your caregiver";
  const address = profile?.homeAddress || "your safe destination";
  const t       = transcript.toLowerCase();

  let response, intent, score, isDistress, shouldAlert;

  // 1. Emergency — highest priority
  const EMERGENCY = ['fell down','cannot get up',"can't get up",'chest hurt','chest pain',
                     'cannot breathe',"can't breathe",'i am dying','call someone',
                     'call my son','call my daughter','i need emergency'];
  // 2. Greetings
  const GREET = ['hello sahay','hey sahay','hi sahay','hello','who are you','what are you','are you a robot'];
  // 3. Ignore — talking to someone else
  const IGNORE = ['pass the salt','pass me','give me the','have you seen','did you hear','let me tell'];

  if (EMERGENCY.some(p => t.includes(p))) {
    response = `${nameStr}I am alerting ${contact} right now. Please stay where you are. Help is on the way.`;
    intent = "distress"; score = 9; isDistress = true; shouldAlert = true;

  } else if (GREET.some(p => t.includes(p))) {
    response = name
      ? `I am Sahay, your voice companion. I am always here to help you, ${name}.`
      : `I am Sahay, your voice companion. I am always here to help you.`;
    intent = "greeting"; score = 1; isDistress = false; shouldAlert = false;

  } else if (IGNORE.some(p => t.includes(p))) {
    response = ""; intent = "ignore"; score = 1; isDistress = false; shouldAlert = false;

  } else if (t.includes("name") || t.includes("who am i")) {
    response = name
      ? `Your name is ${name}. You are safe and I am right here with you.`
      : `You are completely safe. I am Sahay, your companion.`;
    intent = "name_query"; score = 3; isDistress = false; shouldAlert = false;

  } else if (t.includes("lost") || t.includes("where am i")) {
    response = `${nameStr}please stay exactly where you are. ${contact} is on their way to you.`;
    intent = "lost"; score = 7; isDistress = true; shouldAlert = true;

  } else if (t.includes("scared") || t.includes("afraid") || t.includes("frightened") || t.includes("not safe")) {
    response = `${nameStr}you are safe. Take a deep breath. I am right here with you.`;
    intent = "scared"; score = 8; isDistress = true; shouldAlert = false;

  } else if (t.includes("help")) {
    response = `${nameStr}you are safe. I am here. Take a deep breath and tell me what you need.`;
    intent = "scared"; score = 7; isDistress = true; shouldAlert = false;

  } else if (["route","direction","where do i","where to","navigate","map","get home","which way"].some(w => t.includes(w))) {
    response = `${nameStr}I am showing you the route to ${address} right now.`;
    intent = "destination_query"; score = 3; isDistress = false; shouldAlert = false;

  } else {
    response = `${nameStr}you are safe. I am Sahay, your companion. How can I help you?`;
    intent = "other"; score = 2; isDistress = false; shouldAlert = false;
  }

  // Try Polly TTS even in fallback — give patient an audio response
  let audioBase64 = null;
  if (response) {
    try {
      const pollyRes = await polly.send(new SynthesizeSpeechCommand({
        Text: response, OutputFormat: "mp3",
        VoiceId: "Aditi", Engine: "standard", LanguageCode: "en-IN",
      }));
      if (pollyRes.AudioStream) {
        const chunks = [];
        for await (const chunk of pollyRes.AudioStream) chunks.push(chunk);
        audioBase64 = Buffer.concat(chunks).toString("base64");
      }
    } catch (pollyErr) {
      console.warn("[fallback] Polly failed:", pollyErr.message);
    }
  }

  return ok({
    response, audioBase64, audioMimeType: "audio/mpeg",
    isDistress, distressScore: score, shouldAlertCaregiver: shouldAlert, intent,
    assistantMessage: { role: "assistant", content: response },
  });
}
