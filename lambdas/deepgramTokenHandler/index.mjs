/**
 * deepgramTokenHandler - Secure Deepgram API key proxy
 *
 * GET /patient/deepgram-token
 *
 * Returns the Deepgram API key from Lambda env vars (never exposed in frontend bundle).
 * Rate-limited implicitly by API Gateway throttling.
 *
 * Security improvement: DEEPGRAM_KEY lives only in Lambda env (IAM-protected).
 * The key is still transmitted over HTTPS to the browser, but is NOT baked into the JS bundle.
 * This prevents static analysis scraping of the key from build artifacts.
 *
 * For production: replace with Deepgram temporary token API for true short-lived tokens.
 */

import { ok, badRequest } from "../shared/response.mjs";

const DEEPGRAM_KEY = process.env.DEEPGRAM_API_KEY || "";

export const handler = async (event) => {
  console.log("[deepgramToken] request from", event.requestContext?.identity?.sourceIp || "unknown");

  if (!DEEPGRAM_KEY) {
    console.error("[deepgramToken] DEEPGRAM_API_KEY env var not set");
    return {
      statusCode: 503,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({ error: "Speech service temporarily unavailable" }),
    };
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      // Never cache this response - each page load should re-fetch
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    },
    body: JSON.stringify({ key: DEEPGRAM_KEY }),
  };
};
