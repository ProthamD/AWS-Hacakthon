/**
 * burnoutChecker — Burnout trajectory tracking (Branch A — 3.3)
 * Triggered by EventBridge on a schedule (every 6h for demo, daily in prod).
 *
 * Algorithm:
 *  - For each caregiver with recent activity: fetch last 5 distress scores
 *  - Only fire a nudge if ALL of these are true:
 *    1. At least 3 sessions in the window
 *    2. Rolling average of last 3 sessions > 6.5/10
 *    3. Trend is declining (each of the last 3 sessions >= the one before)
 *  - Single bad session alone does NOT trigger
 *  - Track nudge timestamps — don't spam (max once per 48h)
 */

import {
  DynamoDBClient,
  ScanCommand,
  QueryCommand,
  PutItemCommand,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION });
const sns = new SNSClient({ region: process.env.AWS_REGION });

const DISTRESS_TABLE = process.env.DISTRESS_SCORES_TABLE;
const PROFILES_TABLE = process.env.CAREGIVER_PROFILES_TABLE;
const NUDGE_LOG_TABLE = process.env.CONVERSATION_LOGS_TABLE;
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;

const THRESHOLD_SCORE = 6.5;
const MIN_SESSIONS = 3;
const NUDGE_COOLDOWN_HOURS = 48;
const WINDOW_DAYS = 7;

const WELLBEING_NUDGE = {
  hi: `नमस्ते। हमने देखा है कि आप हाल ही में बहुत थका हुआ महसूस कर रहे हैं। 
देखभाल करना एक कठिन काम है और आपकी भावनाएं बिल्कुल स्वाभाविक हैं।

याद रखें कि आप भी महत्वपूर्ण हैं।

सहायता के लिए:
• ARDSI हेल्पलाइन: 1800-200-ARDSI
• iCall परामर्श: 9152987821
• अपने डॉक्टर से बात करें
• किसी परिवार के सदस्य से थोड़ा ब्रेक मांगें

आप अकेले नहीं हैं। — Sahay`,
  en: `Hello. We've noticed you've been feeling quite exhausted recently.
Caregiving is incredibly hard work, and everything you feel is completely valid.

Remember that you matter too.

For support:
• ARDSI Helpline: 1800-200-ARDSI  
• iCall Counselling: 9152987821
• Talk to your doctor
• Ask a family member for a respite break

You are not alone. — Sahay`,
};

export const handler = async (event) => {
  console.log("[burnoutChecker] triggered", JSON.stringify(event));

  // Get all unique caregivers with activity in the last WINDOW_DAYS days
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);
  const windowStartISO = windowStart.toISOString();

  let caregiverIds;
  try {
    // Scan recent distress scores to find active caregivers
    // In production with large datasets, replace with a GSI query or pre-built index
    const scanResult = await dynamo.send(
      new ScanCommand({
        TableName: DISTRESS_TABLE,
        FilterExpression: "#ts >= :windowStart",
        ExpressionAttributeNames: { "#ts": "timestamp" },
        ExpressionAttributeValues: { ":windowStart": { S: windowStartISO } },
        ProjectionExpression: "caregiverId",
      })
    );
    caregiverIds = [...new Set((scanResult.Items || []).map((i) => i.caregiverId?.S).filter(Boolean))];
    console.log(`[burnoutChecker] Found ${caregiverIds.length} active caregivers`);
  } catch (err) {
    console.error("[burnoutChecker] Failed to scan distress scores", err);
    return { processed: 0, error: String(err) };
  }

  let nudgesTriggered = 0;

  for (const caregiverId of caregiverIds) {
    try {
      await processCaregiver(caregiverId, windowStartISO);
      nudgesTriggered++;
    } catch (err) {
      console.error(`[burnoutChecker] Failed to process caregiver ${caregiverId}`, err);
    }
  }

  return { processed: caregiverIds.length, nudgesTriggered };
};

async function processCaregiver(caregiverId, windowStartISO) {
  // Fetch recent distress scores for this caregiver
  const scoresResult = await dynamo.send(
    new ScanCommand({
      TableName: DISTRESS_TABLE,
      FilterExpression: "caregiverId = :cid AND #ts >= :windowStart",
      ExpressionAttributeNames: { "#ts": "timestamp" },
      ExpressionAttributeValues: {
        ":cid": { S: caregiverId },
        ":windowStart": { S: windowStartISO },
      },
    })
  );

  const scores = (scoresResult.Items || [])
    .map((item) => ({
      score: parseFloat(item.score?.N || "5"),
      timestamp: item.timestamp?.S || "",
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp)); // oldest first

  console.log(`[burnoutChecker] ${caregiverId}: ${scores.length} sessions in window`);

  if (scores.length < MIN_SESSIONS) {
    console.log(`[burnoutChecker] ${caregiverId}: Not enough sessions (${scores.length} < ${MIN_SESSIONS})`);
    return;
  }

  // Check last MIN_SESSIONS sessions
  const recent = scores.slice(-MIN_SESSIONS);
  const average = recent.reduce((sum, s) => sum + s.score, 0) / recent.length;
  const allAboveThreshold = recent.every((s) => s.score > THRESHOLD_SCORE);
  const trendDeclining = recent.every((s, i) => i === 0 || s.score >= recent[i - 1].score);

  console.log(`[burnoutChecker] ${caregiverId}: avg=${average.toFixed(1)} allAbove=${allAboveThreshold} declining=${trendDeclining}`);

  if (!(average > THRESHOLD_SCORE && allAboveThreshold && trendDeclining)) {
    console.log(`[burnoutChecker] ${caregiverId}: Burnout criteria not met — no nudge`);
    return;
  }

  // Check nudge cooldown
  const nudgeKey = `nudge-${caregiverId}`;
  try {
    const nudgeLog = await dynamo.send(
      new GetItemCommand({
        TableName: NUDGE_LOG_TABLE,
        Key: { conversationId: { S: nudgeKey } },
      })
    );
    if (nudgeLog.Item) {
      const lastNudge = new Date(nudgeLog.Item.timestamp?.S || 0);
      const hoursSinceLast = (Date.now() - lastNudge.getTime()) / 3_600_000;
      if (hoursSinceLast < NUDGE_COOLDOWN_HOURS) {
        console.log(`[burnoutChecker] ${caregiverId}: Nudge cooldown active (${hoursSinceLast.toFixed(1)}h since last)`);
        return;
      }
    }
  } catch (err) {
    console.error("[burnoutChecker] Cooldown check failed (non-fatal)", err);
  }

  // Load language preference
  let language = "hi";
  try {
    const profileResult = await dynamo.send(
      new GetItemCommand({
        TableName: PROFILES_TABLE,
        Key: { caregiverId: { S: caregiverId } },
      })
    );
    language = profileResult.Item?.language?.S || "hi";
  } catch (err) {
    console.error("[burnoutChecker] Profile load failed (non-fatal)", err);
  }

  // Send wellbeing nudge via SNS
  const nudgeText = WELLBEING_NUDGE[language] || WELLBEING_NUDGE.en;
  try {
    await sns.send(
      new PublishCommand({
        TopicArn: SNS_TOPIC_ARN,
        Subject: "Sahay — A gentle check-in 💙",
        Message: nudgeText,
        MessageAttributes: {
          messageType: { DataType: "String", StringValue: "WELLBEING_NUDGE" },
          caregiverId: { DataType: "String", StringValue: caregiverId },
        },
      })
    );
    console.log(`[burnoutChecker] Wellbeing nudge sent to ${caregiverId}`);
  } catch (err) {
    console.error("[burnoutChecker] SNS nudge failed", err);
    return;
  }

  // Log nudge time (for cooldown)
  await dynamo.send(
    new PutItemCommand({
      TableName: NUDGE_LOG_TABLE,
      Item: {
        conversationId: { S: nudgeKey },
        caregiverId: { S: caregiverId },
        sessionId: { S: "BURNOUT_NUDGE" },
        userMessage: { S: "" },
        assistantResponse: { S: "WELLBEING_NUDGE_SENT" },
        distressScore: { N: String(average.toFixed(1)) },
        timestamp: { S: new Date().toISOString() },
      },
    })
  );
}
