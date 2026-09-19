/**
 * triageAgent — Multi-agent orchestration triage (Branch A — 3.2)
 *
 * Classifies caregiver messages into:
 *   ROUTINE | EMERGENCY | SELF_HARM | PATIENT_MISSING
 *
 * Confidence gate:
 *   >= 0.85 → auto-route to Escalation
 *   0.65-0.84 → route to Escalation but flag for human review
 *   < 0.65 on emergency → route to Care Guidance with soft flag
 */

import { converse } from "../shared/bedrock.mjs";

const TRIAGE_SYSTEM_PROMPT = `You are a triage classifier for a caregiver support AI system.
Your ONLY job is to classify caregiver messages into one of four categories.

Categories:
- ROUTINE: Normal caregiving question, behavioral challenge, advice needed, emotional support (no immediate danger)
- EMERGENCY: Physical danger, fall, chest pain, patient unresponsive, patient reported missing, fire/accident
- SELF_HARM: Caregiver expressing thoughts of self-harm, suicide, or harming the patient
- PATIENT_MISSING: Patient has wandered away and cannot be found

You MUST respond ONLY with a valid JSON object in this exact format:
{"classification":"ROUTINE","confidence":0.95,"reasoning":"Brief 1-sentence explanation"}

Be conservative — when in doubt about danger, classify as EMERGENCY.
The cost of missing a real emergency is far higher than a false positive.`;

export const handler = async (event) => {
  console.log("[triage] event", JSON.stringify(event));

  const { caregiverId, message, sessionId } = event;
  if (!caregiverId || !message) throw new Error("caregiverId and message are required for triage");

  let classification = "ROUTINE";
  let confidence = 0.9;
  let reasoning = "Classified by fallback rule";

  try {
    const rawText = await converse({
      userMessage: `Classify this caregiver message: "${message}"`,
      systemPrompt: TRIAGE_SYSTEM_PROMPT,
      maxTokens: 150,
    });

    // Extract JSON from response (model sometimes wraps it in markdown)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      classification = parsed.classification || "ROUTINE";
      confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.9;
      reasoning = parsed.reasoning || "";
    }
  } catch (err) {
    console.error("[triage] Bedrock triage failed — falling back to keyword scan", err);
    // Fallback: keyword-based emergency detection
    const lower = message.toLowerCase();
    const emergencyKeywords = ["fell","fall","chest pain","not breathing","unconscious","missing","wandered","lost","help","emergency","can't find"];
    const selfHarmKeywords = ["end my life","suicide","kill myself","can't go on","harm myself","hurt the patient"];

    if (selfHarmKeywords.some((k) => lower.includes(k))) {
      classification = "SELF_HARM"; confidence = 0.9; reasoning = "Keyword: self-harm signal";
    } else if (emergencyKeywords.some((k) => lower.includes(k))) {
      classification = "EMERGENCY"; confidence = 0.75; reasoning = "Keyword: emergency keyword found";
    }
  }

  const isEscalation = ["EMERGENCY", "SELF_HARM", "PATIENT_MISSING"].includes(classification);
  const autoEscalate = isEscalation && confidence >= 0.65;

  console.log(`[triage] ${classification} (confidence: ${confidence}) — autoEscalate: ${autoEscalate}`);

  return {
    ...event,
    classification,
    confidence,
    reasoning,
    autoEscalate,
    requiresHumanReview: isEscalation && confidence < 0.85,
  };
};
