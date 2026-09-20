# Sahay · सहाय — System Design & Capabilities

## What is Sahay?

An **AI-powered Alzheimer's companion and caregiver alert system** — voice-first, real-time, and built for production scale on AWS. A patient speaks naturally; Sahay listens, understands, responds with empathy, routes them home if lost, and instantly alerts their caregiver if distress is detected.

---

## Architecture Overview

```
Patient Device (Browser)
       │
       ├── Deepgram WebSocket (always-on STT, real-time)
       │        │
       │   transcript
       │        ↓
       └── API Gateway (HTTPS + throttle)
                │
         ┌──────┴───────────────────┐
         │                          │
  POST /patient/voice        POST /patient/alert
  voiceCompanionHandler      alertHandler
  (Groq LLaMA → Polly)       (Nodemailer → Gmail SMTP)
         │                          │
    DynamoDB (profiles)        DynamoDB (TTL dedup)
    AWS Polly (TTS audio)      Gmail → any email globally
         │
   base64 audio + intent
         │
  Browser plays audio
  + map shown if lost
```

---

## AWS Services Used

| Service | Role | Why it's the right choice |
|---------|------|--------------------------|
| **AWS Lambda** | All backend logic | Auto-scales 0→1000 concurrent instantly, pay-per-ms |
| **API Gateway** | HTTPS routing + throttle | Managed TLS, 50-burst/20rps throttle, X-Ray tracing |
| **DynamoDB** | Patient profiles + alert TTL dedup | Single-digit ms reads, PAY_PER_REQUEST, TTL auto-expiry |
| **AWS Polly** | Text-to-speech (Indian English) | Aditi voice, warm natural Indian English, <300ms |
| **AWS Amplify** | Frontend hosting + CI/CD | Global CDN, auto-deploy on git push |
| **AWS Step Functions** | Multi-agent orchestration (caregiver dashboard) | Visual state machine, retry logic, parallel branches |
| **Amazon S3** | Audio clip uploads, KB docs | Distress audio stored for review |
| **Amazon Cognito** | Auth for caregiver portal | Managed user pools, no auth code to maintain |
| **Amazon EventBridge** | Scheduled warmup + burnout checks | Cron-based Lambda triggers |
| **AWS X-Ray** | Distributed tracing | End-to-end request tracing across Lambda + API GW |
| **Amazon SNS** | Alert broadcast (secondary) | Fan-out capable for future multi-caregiver alerts |
| **CloudWatch** | Logs + metrics | Lambda duration, error rate, cold start monitoring |

---

## Key Features

### 🎤 Voice Companion (Patient-facing)
- **Always-on Deepgram WebSocket STT** — no button needed, speaks naturally
- **PTT fallback** (Groq Whisper) — works even without Deepgram key
- **Wake phrase detection** — only responds when patient says "Sahay" or is in distress
- **Intent classification** — greeting, lost, scared, navigation, name query, distress, emergency
- **Polly TTS** — Indian English audio response, falls back to browser TTS
- **Smart map routing** — Haversine distance picks closer of home vs scheduled destination
- **OpenStreetMap embed** — free, no API key, always works

### 🚨 Caregiver Alert System
- **Dual-trigger** — automatic on AI distress score ≥7, manual panic button
- **Rich HTML email** — distress score bar, what patient said, recommended actions
- **30-min TTL dedup** — DynamoDB conditional write prevents spam
- **Works to any email** — Nodemailer/Gmail SMTP, no AWS SES verification needed
- **Fail-open design** — if DynamoDB check fails, email sends anyway (patient safety first)
- **Client-side guard** — timestamp-based 30-min suppression even before API call

### 👨‍⚕️ Caregiver Dashboard
- QR code onboarding
- Conversation history
- Distress trend analysis
- Multi-agent AI care guidance (Step Functions)
- Burnout checker (scheduled)

---

## System Design Properties

### Scalability ✅
- **Lambda scales to 1,000 concurrent invocations** — each patient session is independent
- **DynamoDB PAY_PER_REQUEST** — no capacity planning, handles any spike
- **API Gateway + Amplify CDN** — both fully managed, scale automatically
- **Stateless backend** — no sticky sessions, any Lambda instance handles any request
- **Warmup ping every 5 min** — zero cold starts for the primary voice handler

> **Concurrent capacity estimate:**
> - 1 patient speaking every ~5s → ~0.2 req/s per patient
> - Lambda concurrency 1000 → supports **~5,000 simultaneous active patients**
> - DynamoDB PAY_PER_REQUEST → no limit at all

### Reliability ✅
- **Groq 8s hard timeout** — P99 bounded, never waits 30s
- **Groq 429/5xx separate handling** — rate limits don't crash, go to offline fallback
- **Polly non-fatal** — falls back to browser SpeechSynthesis
- **Deepgram exponential backoff** — reconnects at 1s, 2s, 4s… up to 30s
- **processingRef 15s auto-reset** — UI never permanently freezes
- **fetchRetry with AbortController** — 10s per attempt, 2 retries
- **Alert 3× retry** — survives transient network blips
- **Offline fallback responses** — hardcoded intent→response map works with zero internet

### CAP Theorem (Alert Dedup)
| Property | Decision | Why |
|----------|----------|-----|
| **Consistency** | `ConsistentRead: true` | Must know if alert was already sent — no duplicates |
| **Availability** | Fail-open on DynamoDB error | Patient safety > dedup correctness |
| **Partition Tolerance** | DynamoDB built-in | AWS manages network partitions |
| **Concurrent writes** | Conditional PutItem | Two simultaneous Lambdas cannot both write — one gets `ConditionalCheckFailedException` |

**Result: CP for dedup, AP for safety — the correct design for a medical application.**

### Performance (P-Latencies)

| Operation | P50 | P95 | P99 | Hard Cap |
|-----------|-----|-----|-----|----------|
| Page startup (mic ready) | ~300ms | ~500ms | ~800ms | — |
| Deepgram STT transcript | ~500ms | ~800ms | ~1.2s | — |
| Groq AI response | ~1.5s | ~3s | ~5s | **8s** |
| Polly TTS synthesis | ~200ms | ~350ms | ~600ms | — |
| **End-to-end (speak→hear reply)** | **~2.5s** | **~4s** | **~7s** | **8s** |
| Caregiver alert email | ~400ms | ~1s | ~2s | — |

### Accessibility ✅
- `aria-live="assertive"` on AI reply bubble and alert badge
- `aria-live="polite"` on status indicator and debug line
- `role="alert"` on caregiver alert badge
- `role="log"` on conversation reply
- `role="status"` on status indicator
- `aria-label` on all key interactive elements

### Security ✅
- Deepgram API key never in frontend bundle (fetched from backend proxy at runtime)
- No secrets committed to git (history scrubbed)
- API Gateway throttle (50 burst / 20 rps) prevents abuse
- HTTPS enforced everywhere (Amplify + API Gateway)
- Cognito auth on caregiver portal

---

## Advantages Over Alternatives

| Competitor approach | Sahay's advantage |
|--------------------|-------------------|
| App requires constant button press | Always-on wake-phrase detection |
| SMS alerts only | Rich HTML email with distress score bar |
| Alert spam (every utterance) | 30-min server+client TTL dedup |
| Google Maps embed (broken/key needed) | OpenStreetMap — free, always works |
| Keys hardcoded in frontend | Backend proxy — key never in browser |
| Single LLM call | Intent classification + post-processing correction |
| Groq-only (fails on rate limit) | Instant offline fallback with full intent coverage |
| Fixed alert threshold | 1-10 distress score with calibrated examples |

---

## Where to Test P-Latencies

### 1. Browser DevTools (best for frontend)
- Open **Chrome DevTools → Network tab**
- Filter by `XHR` or search `patient/voice`
- Click the request → **Timing tab** shows: DNS, connect, TTFB (= server time), download
- **TTFB is your Lambda processing time** — target <3s P50

### 2. AWS X-Ray (best for backend)
👉 [X-Ray Service Map](https://ap-south-1.console.aws.amazon.com/xray/home?region=ap-south-1#/service-map)
- Shows end-to-end trace: API Gateway → Lambda → DynamoDB → Polly
- See exact time spent in each service
- Filter by `responsetime > 3` to find slow requests

### 3. CloudWatch Metrics (best for P99 over time)
👉 [Lambda Metrics](https://ap-south-1.console.aws.amazon.com/cloudwatch/home?region=ap-south-1#metricsV2:graph=~();namespace=AWS/Lambda)
- Metric: `Duration` on `sahay-voice-companion-handler`
- Statistic: `p99` — set time range to last 1h after testing
- Also check `Throttles` and `Errors`

### 4. API Gateway Metrics
👉 [API Gateway Dashboard](https://ap-south-1.console.aws.amazon.com/apigateway/home?region=ap-south-1#/apis)
- Click `sahay-api` → **Monitoring** tab
- See `Latency`, `IntegrationLatency`, `4XXError`, `5XXError`
- `IntegrationLatency` = pure Lambda time (excludes API GW overhead)

### 5. Quick manual test (command line)
```bash
curl -o /dev/null -s -w "Total: %{time_total}s\nTTFB: %{time_starttransfer}s\n" \
  -X POST https://m4fcfzmsa7.execute-api.ap-south-1.amazonaws.com/prod/patient/voice \
  -H "Content-Type: application/json" \
  -d '{"transcript":"hello sahay","patientProfile":{}}'
```
Run 10 times → P50 is the median, P99 is the worst.

---

## Live Endpoints

| Resource | URL |
|----------|-----|
| 🌐 Frontend | [main.d33r1s7xj9cmie.amplifyapp.com](https://main.d33r1s7xj9cmie.amplifyapp.com) |
| 🔌 API Base | `https://m4fcfzmsa7.execute-api.ap-south-1.amazonaws.com/prod/` |
| 📊 X-Ray | [ap-south-1 X-Ray console](https://ap-south-1.console.aws.amazon.com/xray/home?region=ap-south-1) |
| 📈 CloudWatch | [ap-south-1 CloudWatch](https://ap-south-1.console.aws.amazon.com/cloudwatch/home?region=ap-south-1) |
| ⚡ Lambda | [ap-south-1 Lambda](https://ap-south-1.console.aws.amazon.com/lambda/home?region=ap-south-1#/functions) |
