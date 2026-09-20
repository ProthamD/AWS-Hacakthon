/**
 * alertHandler - Caregiver email alert via AWS SES with 30-min TTL dedup
 *
 * POST /patient/alert
 * Body: { caregiverId, caregiverEmail, patientName, message, alertType, distressScore }
 *
 * CAP design:
 *  - Consistency: DynamoDB conditional write prevents duplicate emails
 *  - Availability: fail-open if DynamoDB check fails (patient safety > dedup)
 *  - TTL: 30 minutes per caregiverId (ALERT_TTL_MINUTES env var)
 */

import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { ok, badRequest } from "../shared/response.mjs";

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || "ap-south-1" });
const ses    = new SESClient({ region: process.env.AWS_REGION || "ap-south-1" });

const ALERT_TABLE    = process.env.CONVERSATION_LOGS_TABLE;
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL || "protham.dey@gmail.com";
const ALERT_TTL_MIN  = parseInt(process.env.ALERT_TTL_MINUTES || "30", 10);

export const handler = async (event) => {
  console.log("[alert] event", JSON.stringify(event).slice(0, 500));

  let body;
  try { body = typeof event.body === "string" ? JSON.parse(event.body) : event.body; }
  catch { return badRequest("Invalid JSON"); }

  const {
    caregiverId, caregiverEmail,
    patientName = "the patient",
    message = "",
    alertType = "DISTRESS",
    distressScore = 7,
  } = body || {};

  if (!caregiverId)    return badRequest("caregiverId is required");
  if (!caregiverEmail) return badRequest("caregiverEmail is required");

  const nowSecs  = Math.floor(Date.now() / 1000);
  const expiryAt = nowSecs + ALERT_TTL_MIN * 60;
  const alertKey = `alert-${caregiverId}`;

  // 1. Check for recent alert (strongly consistent read)
  let shouldSuppress = false, secondsUntilNext = 0;
  try {
    const existing = await dynamo.send(new GetItemCommand({
      TableName: ALERT_TABLE,
      Key: { conversationId: { S: alertKey } },
      ConsistentRead: true,
    }));
    if (existing.Item) {
      const recordTtl = parseInt(existing.Item.ttl?.N || "0", 10);
      if (recordTtl > nowSecs) {
        shouldSuppress = true;
        secondsUntilNext = recordTtl - nowSecs;
        console.log(`[alert] Suppressed - next in ${secondsUntilNext}s for ${caregiverId}`);
      }
    }
  } catch (err) {
    // Fail-open: if DynamoDB check fails, send email anyway (patient safety first)
    console.error("[alert] DynamoDB read failed (fail-open):", err.message);
  }

  if (shouldSuppress) {
    return ok({
      sent: false, suppressed: true,
      reason: `Caregiver was already alerted. Next alert available in ${Math.ceil(secondsUntilNext / 60)} min.`,
      nextAlertInSeconds: secondsUntilNext,
    });
  }

  // 2. Send email via SES
  const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  let emailSent = false;
  try {
    await ses.send(new SendEmailCommand({
      Source: SES_FROM_EMAIL,
      Destination: { ToAddresses: [caregiverEmail] },
      Message: {
        Subject: { Data: buildSubject(alertType, patientName), Charset: "UTF-8" },
        Body: {
          Html: { Data: buildHtmlEmail({ patientName, message, alertType, distressScore, timestamp }), Charset: "UTF-8" },
          Text: { Data: buildTextEmail({ patientName, message, alertType, distressScore, timestamp }), Charset: "UTF-8" },
        },
      },
    }));
    emailSent = true;
    console.log(`[alert] Email sent to ${caregiverEmail} for ${patientName}`);
  } catch (err) {
    console.error("[alert] SES send failed:", err.message, err.code);
  }

  // 3. Write TTL record (conditional: only if not already set by concurrent invocation)
  try {
    await dynamo.send(new PutItemCommand({
      TableName: ALERT_TABLE,
      Item: {
        conversationId:    { S: alertKey },
        caregiverId:       { S: caregiverId },
        caregiverEmail:    { S: caregiverEmail },
        patientName:       { S: patientName },
        alertType:         { S: alertType },
        distressScore:     { N: String(distressScore) },
        userMessage:       { S: message.slice(0, 1000) },
        assistantResponse: { S: emailSent ? "EMAIL_SENT" : "EMAIL_FAILED" },
        timestamp:         { S: new Date().toISOString() },
        ttl:               { N: String(expiryAt) },
        expiresAt:         { S: new Date(expiryAt * 1000).toISOString() },
      },
      ConditionExpression: "attribute_not_exists(conversationId) OR #ttl <= :now",
      ExpressionAttributeNames: { "#ttl": "ttl" },
      ExpressionAttributeValues: { ":now": { N: String(nowSecs) } },
    }));
  } catch (err) {
    if (err.name !== "ConditionalCheckFailedException") {
      console.error("[alert] DynamoDB write failed (non-fatal):", err.message);
    }
  }

  return ok({
    sent: emailSent, suppressed: false,
    caregiverEmail,
    nextAlertInSeconds: ALERT_TTL_MIN * 60,
    message: emailSent
      ? `Alert sent. Next alert available in ${ALERT_TTL_MIN} minutes.`
      : `Email delivery failed. Please call the caregiver directly.`,
  });
};

function buildSubject(alertType, patientName) {
  const e = alertType === "PANIC" ? "🆘" : alertType === "EMERGENCY" ? "🚨" : "⚠️";
  return `${e} SAHAY ALERT: ${patientName} needs your attention`;
}

function buildHtmlEmail({ patientName, message, alertType, distressScore, timestamp }) {
  const uc = distressScore >= 9 ? "#dc2626" : distressScore >= 7 ? "#f97316" : "#ca8a04";
  const ul = distressScore >= 9 ? "URGENT" : distressScore >= 7 ? "HIGH" : "MODERATE";
  const ai = alertType === "PANIC" ? "🆘" : alertType === "EMERGENCY" ? "🚨" : "⚠️";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sahay Alert</title></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#0f0f1a;color:#fff;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f1a;padding:32px 16px;">
<tr><td align="center"><table width="100%" style="max-width:560px;background:#1a1a2e;border-radius:16px;border:1px solid rgba(255,255,255,0.1);overflow:hidden;">
<tr><td style="background:${uc};padding:20px 28px;text-align:center;">
  <div style="font-size:36px;margin-bottom:8px;">${ai}</div>
  <div style="font-size:22px;font-weight:700;color:#fff;">SAHAY · सहाय</div>
  <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;letter-spacing:0.08em;text-transform:uppercase;">${ul} — Patient Needs Attention</div>
</td></tr>
<tr><td style="padding:28px;">
  <p style="margin:0 0 16px;font-size:16px;color:rgba(255,255,255,0.9);">Hi, <strong>${patientName}</strong> needs your attention right now.</p>
  <div style="background:rgba(220,38,38,0.12);border:1px solid ${uc};border-radius:10px;padding:16px;margin-bottom:20px;">
    <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.5);margin-bottom:6px;font-weight:600;">Distress Level</div>
    <div style="font-size:28px;font-weight:700;color:${uc};">${distressScore} / 10</div>
    <div style="margin-top:8px;background:rgba(255,255,255,0.08);border-radius:99px;height:6px;overflow:hidden;">
      <div style="width:${distressScore * 10}%;height:100%;background:${uc};border-radius:99px;"></div>
    </div>
  </div>
  ${message ? `<div style="margin-bottom:20px;"><div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:8px;font-weight:600;">What ${patientName} said</div><div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;font-size:15px;color:rgba(255,255,255,0.85);font-style:italic;">"${message}"</div></div>` : ""}
  <div style="background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.25);border-radius:10px;padding:16px;margin-bottom:20px;">
    <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(74,222,128,0.8);margin-bottom:10px;font-weight:700;">Recommended Action</div>
    <ul style="margin:0;padding-left:18px;color:rgba(255,255,255,0.8);font-size:14px;line-height:1.8;">
      <li>Call or video call <strong>${patientName}</strong> immediately</li>
      <li>Check their location if possible</li>
      ${distressScore >= 9 ? "<li>Consider calling <strong>112</strong> (Emergency Services)</li>" : ""}
      <li>ARDSI Helpline: <strong>1800-200-ARDSI</strong></li>
    </ul>
  </div>
  <div style="font-size:12px;color:rgba(255,255,255,0.3);border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;line-height:1.8;">
    <div>⏰ Time (IST): ${timestamp}</div>
    <div>🔖 Alert type: ${alertType}</div>
    <div>🤖 Detected automatically by Sahay AI</div>
  </div>
</td></tr>
<tr><td style="background:rgba(0,0,0,0.3);padding:16px 28px;text-align:center;font-size:11px;color:rgba(255,255,255,0.25);border-top:1px solid rgba(255,255,255,0.06);">
  Sahay · AI Alzheimer's Care Companion<br>Emergency: 112 | Police: 100 | ARDSI: 1800-200-ARDSI<br>
  <em>You will not receive another alert for ${ALERT_TTL_MIN} minutes.</em>
</td></tr>
</table></td></tr></table></body></html>`;
}

function buildTextEmail({ patientName, message, alertType, distressScore, timestamp }) {
  return `SAHAY ALERT — ${patientName} needs your attention\n` +
    `=================================================\n` +
    `Alert Type : ${alertType}\nDistress   : ${distressScore}/10\nTime (IST) : ${timestamp}\n\n` +
    (message ? `What they said: "${message}"\n\n` : "") +
    `RECOMMENDED ACTION:\n- Call ${patientName} immediately\n- Check their location\n` +
    (distressScore >= 9 ? "- Consider calling 112 (Emergency Services)\n" : "") +
    `\nEmergency: 112 | Police: 100 | ARDSI: 1800-200-ARDSI\n` +
    `You will not receive another alert for ${ALERT_TTL_MIN} minutes.`;
}
