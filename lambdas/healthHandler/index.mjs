/**
 * healthHandler — simple health check endpoint.
 * GET /health → 200 { status: "ok", version, region }
 */

import { ok } from "../shared/response.mjs";

export const handler = async (event) => {
  console.log("[health] ping", JSON.stringify(event));
  return ok({
    status: "ok",
    service: "sahay-api",
    version: "0.1.0",
    region: process.env.AWS_REGION,
    timestamp: new Date().toISOString(),
  });
};
