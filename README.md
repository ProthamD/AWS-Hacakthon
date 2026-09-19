# Sahay · सहाय 💙

**Voice-First Alzheimer's Caregiver & Safety Companion**

> First Commit Hackathon 2026 · Bharat Builds Tour (WeMakeDevs × AWS) · Ship It Track

---

## What is Sahay?

Sahay (Hindi: *सहाय* — "help", "companion") is an AI-powered companion for Indian family caregivers of Alzheimer's patients. India has **8.8 million people living with dementia**, and most caregivers have no professional support — they figure it out alone.

Sahay gives them:
- 🎙️ **Voice-first guidance** in Hindi — speak a question, hear a personalized answer
- 🧠 **RAG-grounded responses** — advice that references your specific patient's context, not generic tips
- 🚨 **Emergency triage** — automatic classification and escalation to emergency contacts
- 📍 **Route safety** — alerts if the patient deviates from an expected route, with a calming voice message for the patient
- 💙 **Burnout tracking** — detects sustained caregiver distress and nudges toward real support

**Not a medical device. Does not diagnose anything. Always provides human escalation paths.**

---

## Project Structure

```
AwsHackathon/
├── PROJECT_BRIEF.md          ← Source of truth for requirements + plan
├── infrastructure/           ← AWS CDK (TypeScript) — deploys everything
│   ├── bin/infrastructure.ts ← CDK entrypoint
│   ├── lib/infrastructure-stack.ts ← Full AWS stack definition
│   └── state-machines/       ← Step Functions ASL definitions
├── lambdas/                  ← Lambda function source (Node.js ESM)
│   ├── shared/               ← Shared utilities
│   ├── healthHandler/        ← GET /health
│   ├── onboardHandler/       ← POST /onboard (caregiver setup)
│   ├── chatHandler/          ← POST /chat (single-agent, Phase 3.1)
│   ├── triageAgent/          ← Step Functions: classifies input
│   ├── careGuidanceAgent/    ← Step Functions: RAG-grounded guidance
│   ├── escalationAgent/      ← Step Functions: SNS alert + calming
│   ├── burnoutChecker/       ← EventBridge: trend analysis
│   ├── routeMonitor/         ← POST /route/* (geofence logic)
│   ├── calmingResponseAgent/ ← EventBridge: patient calming flow
│   └── generateQR/           ← POST /qr/generate (bystander QR)
├── frontend/                 ← Classic React/Vite app
├── frontend2/                ← Modern UI/UX React + TypeScript app (Memory Theater, Voice Companion)
│   └── src/
│       ├── pages/            ← HomePage, PatientPage, ChatPage, OnboardPage, MemoriesAdminPage, MemoryTheaterPage, BystanderPage
│       └── ...
└── infrastructure/           ← AWS CDK (TypeScript) — deploys full AWS backend
```


---

## AWS Architecture

| Service | Used for |
|---|---|
| **Bedrock (Claude 3 Haiku)** | Triage, care guidance, escalation, distress scoring, calming scripts |
| **Bedrock Knowledge Base** | RAG store for patient personal context |
| **Step Functions** | Multi-agent orchestration (Triage → Guidance OR Escalation) |
| **Lambda** | All business logic |
| **API Gateway** | Client-facing REST API |
| **DynamoDB** | Profiles, conversation logs, distress scores, route configs |
| **S3** | KB documents, temporary audio (auto-delete in 24h) |
| **Amazon Polly** | Text-to-speech (Hindi voice responses) |
| **Amazon Transcribe** | Speech-to-text (planned; demo uses text input) |
| **SNS** | Emergency alerts to caregiver + wellbeing nudges |
| **EventBridge** | Route anomaly routing, burnout check schedule |
| **Cognito** | Caregiver authentication |
| **Amplify Hosting** | Frontend hosting |

---

## Setup & Deployment

### Prerequisites (manual — §5 of PROJECT_BRIEF.md)

1. **AWS Account** with billing enabled
2. **AWS CLI** installed and configured: `aws configure`
3. Verify: `aws sts get-caller-identity`
4. **Enable Bedrock model access** in the console for `anthropic.claude-3-haiku-20240307-v1:0`
5. **Region**: `ap-south-1` (Mumbai) recommended

### Deploy Infrastructure (Phase 0)

```powershell
# 1. Install CDK (already done if you're reading this)
npm install -g aws-cdk

# 2. Bootstrap CDK (once per account/region)
cd infrastructure
cdk bootstrap aws://YOUR_ACCOUNT_ID/ap-south-1

# 3. Deploy
cdk deploy

# 4. Note the outputs:
#    ApiUrl, CognitoUserPoolId, CognitoClientId, KbDocsBucketName, SnsTopicArn
```

**Phase 0 Gate:** Hit `{ApiUrl}/health` — should return `{"status":"ok"}`

### Configure Bedrock Knowledge Base (manual — one-time)

1. In AWS Console → Bedrock → Knowledge Bases → Create
2. Use S3 source: the `KbDocsBucketName` output from CDK
3. Note the Knowledge Base ID
4. Set it as an environment variable: `$env:BEDROCK_KB_ID = "YOUR_KB_ID"`
5. Redeploy: `cdk deploy`

### Frontend

```powershell
cd frontend
cp .env.example .env.local
# Edit .env.local with your API_URL from CDK output

npm run dev      # local development
npm run build    # production build for Amplify
```

### Subscribe to SNS Alerts (demo)

```powershell
aws sns subscribe \
  --topic-arn "YOUR_SNS_TOPIC_ARN" \
  --protocol email \
  --notification-endpoint your@email.com
```

Confirm the subscription via the email you receive.

---

## Dependency Graph & Gates

```
Phase 0 ── GATE: /health returns 200 ✅ (deploy first)
  │
  ├─ Branch A (sequential)
  │   3.1 Single-agent chat + RAG ── GATE: voice answer in deployed app
  │   └─ 3.2 Step Functions multi-agent ── GATE: emergency → SNS fires
  │      └─ 3.3 Burnout tracking ── GATE: 3-session decline → nudge
  │
  ├─ Branch B (independent)
  │   3.4a Route anomaly ── GATE: simulated deviation → EventBridge event
  │   └─ 3.4b Calming response ── GATE: deviation → Polly + SNS
  │      └─ 3.5 Bystander QR ── GATE: QR scan → calming screen
  │
  └─ Branch C (STRETCH — build last)
```

Use the **Simulate** page in the app to verify each gate.

---

## Design Principles

- **Fallback/circuit-breaker on every Bedrock call** — Lambdas never crash silently; they return hardcoded helpline info if Bedrock fails
- **Confidence-gated autonomy** — Triage scores < 0.65 confidence don't auto-escalate; they flag for review
- **Idempotent SNS** — Escalation Lambda uses session ID as dedup key; retries don't duplicate alerts
- **Least-privilege IAM** — Each Lambda has its own role scoped to only the tables/services it touches
- **Privacy-by-design** — S3 audio bucket has 24h lifecycle auto-expiry; no continuous cloud audio

---

## Limitations & Disclaimers

- This is a **hackathon prototype** — not production-ready for clinical use
- Does **not** diagnose Alzheimer's or any medical condition
- **Always** provide your own emergency contact details before demo
- For real emergencies: **112** (India emergency) | **100** (Police) | **ARDSI: 1800-200-ARDSI**

---

*Built with ❤️ for India's 8.8 million dementia patients and their families*
