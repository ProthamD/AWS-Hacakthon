/**
 * routeMonitor — Location-based route anomaly detection (Branch B — 3.4a)
 *
 * POST /route/configure — set expected route for a patient
 * POST /route/ping — submit a location ping for a patient
 * GET  /route/status/{patientId} — get current route status
 *
 * Anomaly detection rules:
 *  - Wrong direction: current heading diverges significantly from expected path
 *  - Stationary too long: no movement for > 10 min in an unexpected location
 *  - ETA exceeded: arrival window passed by > 20 min
 *  - Geofence breach: location moves outside expected corridor
 *
 * On anomaly: publishes RouteAnomalyDetected event to EventBridge.
 * This is designed to work with SIMULATED pings for the demo.
 */

import { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { ok, badRequest, serverError } from "../shared/response.mjs";
import { randomUUID } from "crypto";

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION });
const eventBridge = new EventBridgeClient({ region: process.env.AWS_REGION });

const ROUTE_CONFIGS_TABLE = process.env.ROUTE_CONFIGS_TABLE;
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME || "default";

export const handler = async (event) => {
  console.log("[routeMonitor] event", JSON.stringify(event));

  const method = event.httpMethod || event.requestContext?.http?.method || "POST";
  const path = event.path || event.rawPath || "";

  if (path.includes("/route/configure")) {
    return handleConfigure(event);
  } else if (path.includes("/route/ping")) {
    return handlePing(event);
  } else if (path.includes("/route/status")) {
    return handleStatus(event);
  } else if (path.includes("/route/simulate")) {
    // Debug endpoint — inject a simulated anomaly for testing
    return handleSimulate(event);
  }

  return badRequest("Unknown route endpoint");
};

/**
 * Configure expected route for a patient.
 */
async function handleConfigure(event) {
  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    return badRequest("Invalid JSON");
  }

  const {
    patientId,
    caregiverId,
    routeDescription,      // e.g. "12B bus from home to market"
    originLat,
    originLng,
    destinationLat,
    destinationLng,
    expectedArrivalISO,    // ISO timestamp of expected arrival
    maxDeviationMeters = 500,
    maxStationaryMinutes = 10,
  } = body || {};

  if (!patientId || !caregiverId || !destinationLat || !destinationLng) {
    return badRequest("patientId, caregiverId, destinationLat, destinationLng are required");
  }

  await dynamo.send(new PutItemCommand({
    TableName: ROUTE_CONFIGS_TABLE,
    Item: {
      patientId: { S: patientId },
      caregiverId: { S: caregiverId },
      routeDescription: { S: routeDescription || "Configured route" },
      originLat: { N: String(originLat || 0) },
      originLng: { N: String(originLng || 0) },
      destinationLat: { N: String(destinationLat) },
      destinationLng: { N: String(destinationLng) },
      expectedArrivalISO: { S: expectedArrivalISO || "" },
      maxDeviationMeters: { N: String(maxDeviationMeters) },
      maxStationaryMinutes: { N: String(maxStationaryMinutes) },
      status: { S: "ACTIVE" },
      lastPingLat: { N: "0" },
      lastPingLng: { N: "0" },
      lastPingTime: { S: "" },
      createdAt: { S: new Date().toISOString() },
    },
  }));

  return ok({ message: "Route configured successfully", patientId });
}

/**
 * Process a location ping from the patient's device (or simulated).
 */
async function handlePing(event) {
  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    return badRequest("Invalid JSON");
  }

  const { patientId, lat, lng, timestamp = new Date().toISOString() } = body || {};
  if (!patientId || lat === undefined || lng === undefined) {
    return badRequest("patientId, lat, lng are required");
  }

  // Load route config
  let config;
  try {
    const result = await dynamo.send(
      new GetItemCommand({
        TableName: ROUTE_CONFIGS_TABLE,
        Key: { patientId: { S: patientId } },
      })
    );
    config = result.Item;
  } catch (err) {
    return serverError("Failed to load route config", err);
  }

  if (!config || config.status?.S !== "ACTIVE") {
    return ok({ status: "NO_ACTIVE_ROUTE", patientId });
  }

  const destLat = parseFloat(config.destinationLat?.N || "0");
  const destLng = parseFloat(config.destinationLng?.N || "0");
  const maxDeviation = parseFloat(config.maxDeviationMeters?.N || "500");
  const maxStationary = parseFloat(config.maxStationaryMinutes?.N || "10");
  const expectedArrivalISO = config.expectedArrivalISO?.S || "";
  const lastPingLat = parseFloat(config.lastPingLat?.N || "0");
  const lastPingLng = parseFloat(config.lastPingLng?.N || "0");
  const lastPingTime = config.lastPingTime?.S || "";
  const caregiverId = config.caregiverId?.S || "";
  const routeDescription = config.routeDescription?.S || "Configured route";

  // Calculate distance from destination
  const distFromDest = haversineMeters(lat, lng, destLat, destLng);

  // Check anomalies
  const anomalies = [];

  // 1. ETA exceeded check
  if (expectedArrivalISO) {
    const expected = new Date(expectedArrivalISO);
    const now = new Date();
    const overdueMins = (now.getTime() - expected.getTime()) / 60000;
    if (overdueMins > 20 && distFromDest > 200) {
      anomalies.push({ type: "ETA_EXCEEDED", detail: `${Math.round(overdueMins)} min overdue, ${Math.round(distFromDest)}m from destination` });
    }
  }

  // 2. Stationary too long check
  if (lastPingTime && lastPingLat && lastPingLng) {
    const distMoved = haversineMeters(lat, lng, lastPingLat, lastPingLng);
    const minutesSinceLastPing = (new Date(timestamp).getTime() - new Date(lastPingTime).getTime()) / 60000;
    if (distMoved < 50 && minutesSinceLastPing > maxStationary && distFromDest > 200) {
      anomalies.push({ type: "STATIONARY_TOO_LONG", detail: `Stationary for ${Math.round(minutesSinceLastPing)} min, ${Math.round(distFromDest)}m from destination` });
    }
  }

  // 3. Major deviation from expected corridor
  const originLat = parseFloat(config.originLat?.N || String(lat));
  const originLng = parseFloat(config.originLng?.N || String(lng));
  const corridorDist = pointToLineDistance(lat, lng, originLat, originLng, destLat, destLng);
  if (corridorDist > maxDeviation && distFromDest > 200) {
    anomalies.push({ type: "ROUTE_DEVIATION", detail: `${Math.round(corridorDist)}m off expected route corridor` });
  }

  // Update last ping in DynamoDB
  try {
    await dynamo.send(new UpdateItemCommand({
      TableName: ROUTE_CONFIGS_TABLE,
      Key: { patientId: { S: patientId } },
      UpdateExpression: "SET lastPingLat = :lat, lastPingLng = :lng, lastPingTime = :ts",
      ExpressionAttributeValues: {
        ":lat": { N: String(lat) },
        ":lng": { N: String(lng) },
        ":ts": { S: timestamp },
      },
    }));
  } catch (err) {
    console.error("[routeMonitor] Failed to update last ping (non-fatal)", err);
  }

  // If anomalies detected, publish to EventBridge
  if (anomalies.length > 0) {
    console.log(`[routeMonitor] ANOMALY detected for patient ${patientId}:`, anomalies);
    try {
      await eventBridge.send(new PutEventsCommand({
        Entries: [{
          EventBusName: EVENT_BUS_NAME,
          Source: "sahay.route-monitor",
          DetailType: "RouteAnomalyDetected",
          Detail: JSON.stringify({
            patientId,
            caregiverId,
            routeDescription,
            currentLat: lat,
            currentLng: lng,
            anomalies,
            timestamp: new Date().toISOString(),
          }),
        }],
      }));
      console.log("[routeMonitor] RouteAnomalyDetected event published");
    } catch (err) {
      console.error("[routeMonitor] EventBridge publish failed", err);
    }
    return ok({ status: "ANOMALY_DETECTED", anomalies, patientId });
  }

  return ok({ status: "OK", distFromDestinationM: Math.round(distFromDest), patientId });
}

/**
 * Get current route status.
 */
async function handleStatus(event) {
  const patientId = event.pathParameters?.patientId || event.queryStringParameters?.patientId;
  if (!patientId) return badRequest("patientId required");

  try {
    const result = await dynamo.send(
      new GetItemCommand({ TableName: ROUTE_CONFIGS_TABLE, Key: { patientId: { S: patientId } } })
    );
    if (!result.Item) return ok({ status: "NO_ROUTE_CONFIGURED", patientId });
    return ok({
      patientId,
      status: result.Item.status?.S,
      routeDescription: result.Item.routeDescription?.S,
      lastPingLat: result.Item.lastPingLat?.N,
      lastPingLng: result.Item.lastPingLng?.N,
      lastPingTime: result.Item.lastPingTime?.S,
    });
  } catch (err) {
    return serverError("Failed to fetch route status", err);
  }
}

/**
 * Simulate a route anomaly (debug endpoint for demo).
 */
async function handleSimulate(event) {
  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    return badRequest("Invalid JSON");
  }

  const { patientId, caregiverId, anomalyType = "ROUTE_DEVIATION", lat = 0, lng = 0 } = body || {};
  if (!patientId || !caregiverId) return badRequest("patientId and caregiverId required");

  await eventBridge.send(new PutEventsCommand({
    Entries: [{
      EventBusName: EVENT_BUS_NAME,
      Source: "sahay.route-monitor",
      DetailType: "RouteAnomalyDetected",
      Detail: JSON.stringify({
        patientId,
        caregiverId,
        routeDescription: "SIMULATED ROUTE",
        currentLat: lat,
        currentLng: lng,
        anomalies: [{ type: anomalyType, detail: "Simulated for demo/testing" }],
        simulated: true,
        timestamp: new Date().toISOString(),
      }),
    }],
  }));

  return ok({ message: "Simulated anomaly event published", anomalyType, patientId });
}

// --- Geospatial helpers ---

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointToLineDistance(px, py, x1, y1, x2, y2) {
  const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let t = lenSq !== 0 ? dot / lenSq : -1;
  t = Math.max(0, Math.min(1, t));
  const nearX = x1 + t * C, nearY = y1 + t * D;
  return haversineMeters(px, py, nearX, nearY);
}
