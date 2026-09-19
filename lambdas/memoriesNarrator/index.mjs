/**
 * memoriesNarrator — generates a cohesive story from patient memories.
 *
 * POST /memories/narrate
 * Body: {
 *   patientName: string,
 *   memories: [{ id, caption, date }],
 *   previewOnly?: boolean
 * }
 */

import { ok, badRequest, serverError, safeJsonParse } from "../shared/response.mjs";
import { converse } from "../shared/bedrock.mjs";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return ok({});
  }

  let body = safeJsonParse(event.body);
  if (!body) body = event;

  const { patientName, memories, previewOnly } = body;
  if (!patientName || !memories || !Array.isArray(memories)) {
    return badRequest("Missing patientName or memories array");
  }

  try {
    const memoryContext = memories.map((m, i) => `[ID: ${m.id}] (Date: ${m.date}): ${m.caption}`).join('\n');

    const systemPrompt = `You are Sahay, a warm and gentle AI storyteller for ${patientName}, who has Alzheimer's.
Your job is to take a list of their memory photos (with captions and dates) and weave them into a calming, reassuring personal story.
Speak directly to ${patientName} using "you" and "your".
Use short, simple sentences. Be warm and nostalgic.
If previewOnly is true, generate ONLY a single short 1-2 sentence preview intro.
Otherwise, return a JSON object exactly matching this format, with no markdown formatting:
{
  "intro": "A gentle opening sentence greeting them.",
  "segments": [
    {
      "memoryId": "the exact ID from the prompt",
      "narration": "1-2 warm sentences about this specific memory photo"
    }
  ]
}`;

    const userMessage = `Here are the memories:\n${memoryContext}\n\npreviewOnly is ${previewOnly ? 'true' : 'false'}.`;

    const rawResponse = await converse({
      userMessage,
      systemPrompt,
      maxTokens: 800
    });

    if (previewOnly) {
      return ok({ intro: rawResponse.trim() });
    }

    // Try to parse the JSON response
    let parsedResponse;
    try {
      // Remove any potential markdown blocks
      const cleanResponse = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedResponse = JSON.parse(cleanResponse);
    } catch (e) {
      console.warn("Failed to parse LLM JSON, generating fallback", rawResponse);
      // Fallback
      parsedResponse = {
        intro: `Hello ${patientName}. I have some beautiful memories to share with you.`,
        segments: memories.map(m => ({
          memoryId: m.id,
          narration: `This is a beautiful memory from ${m.date}. ${m.caption}`
        }))
      };
    }

    return ok(parsedResponse);
  } catch (err) {
    return serverError("Failed to generate story", err);
  }
};
