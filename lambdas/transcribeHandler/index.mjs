/**
 * transcribeHandler — Groq Whisper speech-to-text proxy
 *
 * POST /patient/transcribe
 * Body: { audioBase64: string, mimeType?: string }
 * Returns: { transcript: string, isEmpty: boolean }
 */

import { ok, badRequest, serverError } from "../shared/response.mjs";

const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_API_KEY = process.env.GROQ_API_KEY;

export const handler = async (event) => {
  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    return badRequest("Invalid JSON");
  }

  const { audioBase64, mimeType = "audio/webm" } = body || {};
  if (!audioBase64) return badRequest("audioBase64 is required");

  if (!GROQ_API_KEY) return serverError("GROQ_API_KEY not configured", new Error("missing key"));

  try {
    // Convert base64 to binary
    const audioBuffer = Buffer.from(audioBase64, "base64");

    // Groq Whisper expects multipart/form-data
    const boundary = "----SahayBoundary" + Date.now();
    const ext = mimeType.includes("webm") ? "webm" : mimeType.includes("mp4") ? "mp4" : "webm";

    const bodyParts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
      audioBuffer,
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3-turbo\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nen\r\n`,
      // Prompt hint improves accuracy for elderly/emotional speech patterns
      `--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\nElderly person with dementia speaking. Common phrases: I am lost, where am I, who am I, my name is, I need help, I am scared, show me the route, Sahay, caregiver, home.\r\n`,
      `--${boundary}--\r\n`,
    ];

    // Assemble multipart body
    const parts = bodyParts.map((p) => typeof p === "string" ? Buffer.from(p, "utf-8") : p);
    const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
    const multipartBody = Buffer.concat(parts, totalLength);

    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": multipartBody.length.toString(),
      },
      body: multipartBody,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[transcribeHandler] Whisper error:", res.status, errText);
      return ok({ transcript: "", isEmpty: true });
    }

    const data = await res.json();
    const transcript = (data.text || "").trim();
    const isEmpty = transcript.length < 2;

    console.log(`[transcribeHandler] transcript="${transcript}" isEmpty=${isEmpty}`);
    return ok({ transcript, isEmpty });

  } catch (err) {
    console.error("[transcribeHandler] Error:", err);
    return ok({ transcript: "", isEmpty: true }); // Soft fail — don't crash the patient app
  }
};
