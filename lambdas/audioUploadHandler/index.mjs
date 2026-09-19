/**
 * audioUploadHandler — receives panic audio from PatientApp, saves to S3, alerts Caregiver.
 * (Phase 4.1 - On-Device Audio Panic Detection)
 *
 * POST /distress/audio
 * Body: {
 *   patientId: string,
 *   audioBase64: string (base64 encoded audio blob)
 * }
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ok, badRequest, serverError } from "../shared/response.mjs";
import { randomUUID } from "crypto";

const s3 = new S3Client({ region: process.env.AWS_REGION });
const sns = new SNSClient({ region: process.env.AWS_REGION });

const AUDIO_BUCKET = process.env.AUDIO_BUCKET;
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;

export const handler = async (event) => {
  console.log("[audioUpload] event received");

  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { patientId, audioBase64 } = body || {};
  if (!patientId || !audioBase64) {
    return badRequest("patientId and audioBase64 are required");
  }

  try {
    // 1. Decode audio
    const audioBuffer = Buffer.from(audioBase64, "base64");
    
    // 2. Save to S3
    const key = `panic-audio/${patientId}/${Date.now()}-${randomUUID()}.webm`;
    await s3.send(
      new PutObjectCommand({
        Bucket: AUDIO_BUCKET,
        Key: key,
        Body: audioBuffer,
        ContentType: "audio/webm",
      })
    );
    console.log(`[audioUpload] Audio saved to S3: ${key}`);

    // 3. Get Presigned URL for caregiver to listen
    const audioUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: AUDIO_BUCKET, Key: key }),
      { expiresIn: 86400 } // 24 hours
    );

    // 4. Send SNS Alert
    await sns.send(
      new PublishCommand({
        TopicArn: SNS_TOPIC_ARN,
        Subject: `🚨 SAHAY: Panic detected for ${patientId}`,
        Message: `
PANIC AUDIO DETECTED
======================
Patient: ${patientId}
Time: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}

The patient's app detected a distress phrase and recorded 10 seconds of audio.
Listen to the recording here (valid for 24 hours):
${audioUrl}

— Sahay AI`.trim(),
      })
    );
    console.log("[audioUpload] SNS alert sent");

    return ok({ message: "Panic audio processed successfully", audioUrl });

  } catch (err) {
    console.error("[audioUpload] Failed to process audio", err);
    return serverError("Failed to process audio");
  }
};
