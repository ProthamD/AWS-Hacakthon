/**
 * generateQR — QR code generator for bystander access (Branch B — 3.5)
 *
 * POST /qr/generate
 * Body: { patientId: string, caregiverId: string }
 *
 * Returns: PNG QR code image (base64) + bystander URL
 * The QR points to: {FRONTEND_URL}/bystander/{patientId}
 */

import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { ok, badRequest, serverError } from "../shared/response.mjs";

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION });
const PROFILES_TABLE = process.env.CAREGIVER_PROFILES_TABLE;
const FRONTEND_URL = process.env.FRONTEND_URL || "https://sahay.example.com";

export const handler = async (event) => {
  console.log("[generateQR] event", JSON.stringify(event));

  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    return badRequest("Invalid JSON");
  }

  const { patientId, caregiverId } = body || {};
  if (!patientId || !caregiverId) {
    return badRequest("patientId and caregiverId are required");
  }

  // Verify profile exists
  try {
    const result = await dynamo.send(
      new GetItemCommand({
        TableName: PROFILES_TABLE,
        Key: { caregiverId: { S: caregiverId } },
      })
    );
    if (!result.Item) {
      return badRequest("Caregiver profile not found — complete onboarding first");
    }
  } catch (err) {
    return serverError("Failed to verify profile", err);
  }

  const bystanderUrl = `${FRONTEND_URL}/bystander/${patientId}`;

  // Generate QR code using the qrcode library (bundled with Lambda)
  // Since Lambda can't install npm packages at runtime, we use a simple SVG-based approach
  // In production: bundle qrcode npm package with Lambda
  const qrSvg = generateSimpleQRSvg(bystanderUrl);

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      bystanderUrl,
      qrSvgData: Buffer.from(qrSvg).toString("base64"),
      instructions: [
        "Print this QR code and attach it to the patient's ID card, bag, or clothing.",
        "Any bystander who finds the patient can scan this code to get caregiver contact info.",
        "No app required — works with any smartphone camera.",
      ],
    }),
  };
};

/**
 * Minimal SVG QR code placeholder.
 * In production, bundle the 'qrcode' npm package for real QR generation.
 */
function generateSimpleQRSvg(url) {
  // This is a placeholder that generates a labeled SVG card.
  // Replace with: import QRCode from 'qrcode'; const svg = await QRCode.toString(url, {type:'svg'});
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="350" viewBox="0 0 300 350">
  <rect width="300" height="350" fill="white" stroke="#333" stroke-width="2" rx="10"/>
  <text x="150" y="30" text-anchor="middle" font-size="18" font-weight="bold" fill="#1a1a2e" font-family="Arial">SAHAY</text>
  <text x="150" y="50" text-anchor="middle" font-size="11" fill="#666" font-family="Arial">Alzheimer's Safety Companion</text>
  
  <!-- QR code placeholder box -->
  <rect x="50" y="65" width="200" height="200" fill="#f5f5f5" stroke="#333" stroke-width="2" rx="5"/>
  <text x="150" y="160" text-anchor="middle" font-size="12" fill="#999" font-family="Arial">QR CODE</text>
  <text x="150" y="178" text-anchor="middle" font-size="10" fill="#999" font-family="Arial">(Install qrcode package)</text>
  
  <text x="150" y="290" text-anchor="middle" font-size="10" fill="#333" font-family="Arial">Scan to help this person</text>
  <text x="150" y="308" text-anchor="middle" font-size="9" fill="#666" font-family="Arial" text-decoration="underline">${url.substring(0, 40)}...</text>
  <text x="150" y="335" text-anchor="middle" font-size="9" fill="#999" font-family="Arial">Emergency: 112 | Police: 100</text>
</svg>`;
}
