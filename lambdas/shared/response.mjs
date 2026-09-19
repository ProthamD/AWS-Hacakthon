/**
 * Shared HTTP response helpers for Sahay Lambda functions.
 */

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
};

export function ok(body) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    body: JSON.stringify(body),
  };
}

export function created(body) {
  return {
    statusCode: 201,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    body: JSON.stringify(body),
  };
}

export function badRequest(message) {
  return {
    statusCode: 400,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    body: JSON.stringify({ error: message }),
  };
}

export function serverError(message, err) {
  console.error("[ERROR]", message, err);
  return {
    statusCode: 500,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    body: JSON.stringify({ error: message }),
  };
}

/**
 * Safe JSON parse — returns null on failure instead of throwing.
 */
export function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
