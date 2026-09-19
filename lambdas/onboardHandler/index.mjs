/**
 * onboardHandler — caregiver onboarding.
 *
 * POST /onboard
 * Body: {
 *   caregiverId: string,          // Cognito sub / UUID
 *   patientName: string,
 *   patientAge: number,
 *   dementiaStage: "early"|"moderate"|"severe",
 *   keyRelationships: string,     // e.g. "daughter of Savitri, son Ravi is abroad"
 *   dailyRoutine: string,         // e.g. "wakes at 6am, walks at 7am, tea at 8am"
 *   likesAndDislikes: string,
 *   emergencyContactName: string,
 *   emergencyContactPhone: string,
 *   language: "hi"|"bn"           // Hindi or Bengali
 * }
 *
 * Flow:
 *  1. Validate input
 *  2. Store profile in DynamoDB CaregiverProfiles
 *  3. Build a rich-text embedding document from the profile
 *  4. Upsert into Bedrock Knowledge Base (using Bedrock Sync API)
 *     — If KB sync is async, store the doc in S3 for KB ingestion
 */

import {
  DynamoDBClient,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { ok, badRequest, serverError } from "../shared/response.mjs";

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION });
const s3 = new S3Client({ region: process.env.AWS_REGION });

const PROFILES_TABLE = process.env.CAREGIVER_PROFILES_TABLE;
const KB_BUCKET = process.env.KB_DOCS_BUCKET;

export const handler = async (event) => {
  console.log("[onboard] event", JSON.stringify(event));

  // Parse body
  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const {
    caregiverId,
    patientName,
    patientAge,
    dementiaStage,
    keyRelationships,
    dailyRoutine,
    likesAndDislikes,
    emergencyContactName,
    emergencyContactPhone,
    language = "hi",
  } = body || {};

  // Validate required fields
  if (!caregiverId || !patientName || !dementiaStage) {
    return badRequest("caregiverId, patientName, and dementiaStage are required");
  }
  if (!["early", "moderate", "severe"].includes(dementiaStage)) {
    return badRequest("dementiaStage must be early | moderate | severe");
  }

  const now = new Date().toISOString();

  // 1. Store profile in DynamoDB
  try {
    await dynamo.send(
      new PutItemCommand({
        TableName: PROFILES_TABLE,
        Item: {
          caregiverId: { S: caregiverId },
          patientName: { S: patientName },
          patientAge: { N: String(patientAge || 0) },
          dementiaStage: { S: dementiaStage },
          keyRelationships: { S: keyRelationships || "" },
          dailyRoutine: { S: dailyRoutine || "" },
          likesAndDislikes: { S: likesAndDislikes || "" },
          emergencyContactName: { S: emergencyContactName || "" },
          emergencyContactPhone: { S: emergencyContactPhone || "" },
          language: { S: language },
          createdAt: { S: now },
          updatedAt: { S: now },
        },
      })
    );
    console.log("[onboard] profile stored in DynamoDB");
  } catch (err) {
    return serverError("Failed to store caregiver profile", err);
  }

  // 2. Build rich embedding document for RAG
  const embeddingDoc = buildEmbeddingDoc({
    caregiverId,
    patientName,
    patientAge,
    dementiaStage,
    keyRelationships,
    dailyRoutine,
    likesAndDislikes,
    emergencyContactName,
  });

  // 3. Upload embedding doc to S3 (KB data source bucket — KB will sync from here)
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: KB_BUCKET,
        Key: `profiles/${caregiverId}.txt`,
        Body: embeddingDoc,
        ContentType: "text/plain",
        Metadata: {
          caregiverId,
          dementiaStage,
          language,
        },
      })
    );
    console.log("[onboard] embedding doc uploaded to S3 for KB ingestion");
  } catch (err) {
    // Non-fatal — profile is in DynamoDB; KB sync can be retried
    console.error("[onboard] S3 upload failed (non-fatal)", err);
  }

  return ok({
    message: "Caregiver profile saved successfully",
    caregiverId,
    patientName,
    dementiaStage,
  });
};

/**
 * Build a rich plain-text document from caregiver profile for Bedrock KB ingestion.
 * This is what the RAG retrieval step will search against.
 */
function buildEmbeddingDoc(profile) {
  return `
CAREGIVER PROFILE — ${profile.caregiverId}
==========================================
Patient Name: ${profile.patientName}
Patient Age: ${profile.patientAge || "Unknown"}
Dementia Stage: ${profile.dementiaStage}

Key Relationships:
${profile.keyRelationships || "Not provided"}

Daily Routine:
${profile.dailyRoutine || "Not provided"}

Likes and Dislikes:
${profile.likesAndDislikes || "Not provided"}

Emergency Contact: ${profile.emergencyContactName || "Not set"}

Care Guidance Notes:
- Stage: ${profile.dementiaStage}
- ${profile.dementiaStage === "early" ? "Emphasize patient autonomy. Patient can participate in decisions. Encourage familiar routines." : ""}
- ${profile.dementiaStage === "moderate" ? "Balance patient dignity with safety. Redirect rather than correct. Keep responses calm and simple." : ""}
- ${profile.dementiaStage === "severe" ? "Focus on caregiver self-care. Patient needs full assistance. Simple sensory comfort matters most." : ""}
`.trim();
}
