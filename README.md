# Sahay · सहाय 💙

> **Voice-First Alzheimer''s Caregiver & Safety Companion**
> Built for the **First Commit Hackathon 2026** · Bharat Builds Tour (WeMakeDevs × AWS) · Ship It Track
> 🌐 **[main.sahay.amplifyapp.com](https://main.sahay.amplifyapp.com)** · 🔌 API: `https://m4fcfzmsa7.execute-api.ap-south-1.amazonaws.com/prod/`

---

## The Problem

India has **8.8 million people living with dementia**, projected to cross **17 million by 2050**. Family caregivers — typically a spouse or adult child — figure it out entirely alone. Existing tools like SAGE-LEAF explicitly require English literacy and reliable internet to even enroll, completely excluding most Indian caregivers whose documented barriers are:

- ❌ Lack of time
- ❌ Limited internet access
- ❌ Digital illiteracy

**Sahay requires zero tech skills.** It is entirely voice-driven, speaks the local language, and works in moments of crisis when caregivers have no time to navigate apps or read articles.

---

## What Sahay Does

| User | Feature | How it works |
|---|---|---|
| 🧑‍⚕️ **Caregiver** | Voice-first AI guidance | Speak in Hindi/English, get personalized advice grounded in your patient''s context |
| 🧑‍⚕️ **Caregiver** | Emergency escalation | AI detects crisis, fires SNS alert + rich email instantly |
| 🧑‍⚕️ **Caregiver** | Burnout tracking | Distress scores trend-analyzed over sessions, proactive nudge before collapse |
| 🧠 **Patient** | Voice companion | Speaks to Sahay, gets calming responses, is never confused alone |
| 🧠 **Patient** | Route safety | Gets guided home if lost; caregiver alerted with location |
| 🧠 **Patient** | Memory Theater | AI-narrated family photo slideshow to stay grounded |
| 🌍 **Bystander** | QR card | Scans patient''s card, sees calming screen + emergency contact |

---

## Architecture Overview

```mermaid
graph TB
    subgraph Client["🖥️ Client (Browser — Amplify CDN)"]
        CP[Patient Page\nDeepgram WebSocket STT]
        CC[Caregiver Dashboard\nReact + TypeScript]
        MT[Memory Theater\nPhoto Slideshow]
        QR[Bystander QR\nCalming Screen]
    end

    subgraph Gateway["☁️ AWS API Gateway (ap-south-1)"]
        AG[REST API — Throttle + TLS + X-Ray]
    end

    subgraph Compute["⚡ AWS Lambda — All Business Logic"]
        VCH[voiceCompanionHandler\nGroq AI → Polly TTS]
        CH[chatHandler\nCaregiver Chat + RAG]
        TRG[triageAgent\nClassify: Routine vs Emergency]
        CGA[careGuidanceAgent\nBedrock RAG Guidance]
        ESC[escalationAgent\nSNS + Email Alert]
        BC[burnoutChecker\nTrend Analysis]
        RM[routeMonitor\nGeofence Logic]
        CRA[calmingResponseAgent\nPolly Calming Script]
        AH[alertHandler\nEmail via SMTP]
    end

    subgraph AI["🧠 AI / ML"]
        GROQ[Groq — Qwen 3.8B + LLaMA 3.3]
        BEDROCK[Amazon Bedrock — Claude 3 Haiku]
        KB[Bedrock Knowledge Base\nPatient Context RAG]
        POLLY[Amazon Polly — Aditi, Indian English TTS]
        DG[Deepgram Nova-2 — Real-time STT]
    end

    subgraph Storage["💾 Storage"]
        DDB[DynamoDB — Profiles · Logs · Scores · Routes]
        S3[S3 — Audio Clips · KB Docs]
    end

    subgraph Events["📡 Events & Alerts"]
        SNS[Amazon SNS — Emergency Alerts]
        EB[EventBridge — Route Anomaly · Burnout Cron]
        SF[Step Functions — Multi-Agent Orchestration]
    end

    CP -->|WebSocket| DG
    DG -->|Transcript| CP
    CP -->|POST /patient/voice| AG
    CC -->|POST /chat| AG

    AG --> VCH & CH & TRG & RM & AH

    VCH --> GROQ --> POLLY
    VCH --> DDB
    CH --> SF
    SF --> TRG --> CGA & ESC
    CGA --> BEDROCK --> KB --> S3
    ESC --> SNS

    BC --> EB
    RM --> EB --> CRA --> POLLY
```

---

## Patient Voice AI Pipeline

```mermaid
sequenceDiagram
    participant P as 👴 Patient
    participant B as Browser
    participant DG as Deepgram WebSocket
    participant AG as API Gateway
    participant VCH as voiceCompanionHandler
    participant GROQ as Groq AI
    participant POLLY as Amazon Polly
    participant DB as DynamoDB

    P->>B: Speaks naturally
    B->>DG: Audio stream (WebSocket)
    DG-->>B: Real-time transcript
    B->>B: Wake phrase check — "sahay", "help", "where am I"...

    alt Wake phrase detected
        B->>AG: POST /patient/voice
        AG->>VCH: Invoke Lambda
        VCH->>DB: Fetch patient profile
        DB-->>VCH: Name, routines, relationships, home address
        VCH->>GROQ: System prompt + transcript (8s timeout)
        GROQ-->>VCH: intent, response, distress_score

        Note over VCH: Post-processing corrections:<br/>Emergency override (fell/chest pain → score 9)<br/>Score floor (scared≥7, lost≥7)<br/>Intent correction (greeting/ignore)

        par Parallel
            VCH->>POLLY: SynthesizeSpeech (Aditi, en-IN)
            POLLY-->>VCH: base64 MP3 audio
        and
            VCH->>VCH: resolveMapDestination() — Haversine
        end

        VCH-->>B: response + audioBase64 + intent + mapRoute
        B->>P: Plays audio + shows map

        alt distressScore >= 7
            B->>AG: POST /patient/alert
            AG-->>P: Rich HTML email to caregiver
        end
    else Background noise
        B->>B: Suppressed — intent=ignore
    end
```

---

## Multi-Agent Orchestration (Step Functions)

```mermaid
stateDiagram-v2
    [*] --> Triage : Caregiver sends message

    Triage : 🔍 Triage Agent\nClassify: Routine or Emergency?

    Triage --> CareGuidance : Routine query (confidence ≥ 0.65)
    Triage --> Escalation : Emergency detected (distress ≥ 7)
    Triage --> FlagForReview : Low confidence < 0.65

    CareGuidance : 📚 Care-Guidance Agent\nBedrock + Knowledge Base RAG\nPersonalized stage-adaptive response

    CareGuidance --> BurnoutCheck : Extract distress score from session

    Escalation : 🚨 Escalation Agent\nSNS alert to emergency contact

    BurnoutCheck : 📊 Burnout Checker\nTrack distress trend over sessions

    BurnoutCheck --> Nudge : 3-session decline detected
    BurnoutCheck --> [*] : Single bad night — no action

    Nudge : 💙 Proactive nudge\nARDSI helpline resources sent

    FlagForReview --> [*]
    Escalation --> [*]
    Nudge --> [*]
```

---

## Route Anomaly & Calming Flow

```mermaid
flowchart TD
    A[👴 Patient sets out on expected route] --> B{Route configured\nby caregiver?}
    B -->|No| Z[Standard patient page only]
    B -->|Yes| C[Route monitoring active]

    C --> D{Patient deviates\nfrom route?}
    D -->|No| C
    D -->|Yes| E[POST /route/check — routeMonitor Lambda]

    E --> F[EventBridge: route-anomaly event]

    F --> G[calmingResponseAgent Lambda]
    F --> H[SNS alert to caregiver]

    G --> I[Groq generates calming script]
    I --> J[Amazon Polly — Aditi voice]
    J --> K[Audio plays on patient device]

    K --> L{Patient says Where am I?}
    L -->|Yes| M[voiceCompanionHandler\nresolveMapDestination — Haversine]
    M --> N[Picks closer: Home vs Scheduled Destination]
    N --> O[OpenStreetMap route shown on screen]
    L -->|No| P[Patient calmed by audio]
```

---

## Burnout Tracker

```mermaid
flowchart LR
    A[Caregiver chat session] --> B[chatHandler Lambda]
    B --> C[Bedrock extracts distress_score 1-10]
    C --> D[(DynamoDB\nsahay-distress-scores\nTTL: 30 days)]

    E[EventBridge Cron — Every 24h] --> F[burnoutChecker Lambda]
    F --> D
    D --> G{Last 3 sessions all declining?}

    G -->|No — single bad night| H[No action]
    G -->|Yes — sustained decline| I[SNS nudge event]
    I --> J[Email: ARDSI helpline + NIMHANS + respite care resources]
```

---

## Onboarding & RAG Pipeline

```mermaid
sequenceDiagram
    participant CG as 🧑‍⚕️ Caregiver
    participant UI as React App
    participant OH as onboardHandler
    participant DB as DynamoDB
    participant S3 as S3 KB Docs Bucket
    participant BED as Bedrock Knowledge Base

    CG->>UI: Fill onboarding form
    Note over UI: Patient name, age, dementia stage<br/>Key relationships, daily routines<br/>Home address, emergency contact

    UI->>OH: POST /onboard
    OH->>DB: Store structured profile
    OH->>S3: Store narrative context document
    S3->>BED: Knowledge Base auto-sync (embeddings)

    Note over BED: When caregiver says<br/>"she keeps calling me her sister"<br/>Bedrock retrieves ACTUAL stored<br/>sister name + relationship context

    CG->>UI: Ask question via voice
    UI->>OH: POST /chat
    OH->>BED: Semantic RAG retrieval
    BED-->>OH: Relevant patient context chunks
    OH->>OH: Claude 3 Haiku — stage-adaptive response
    OH-->>CG: Spoken + text personalized reply
```

---

## Memory Theater

```mermaid
flowchart TD
    A[🧑‍⚕️ Caregiver uploads family photos] --> B[Photos stored with captions + dates]
    B --> C[(localStorage: sahay_memories)]

    D[Patient shows confusion signals] --> E[Patient Page detects distress intent]
    E --> F{Memory Theater photos available?}

    F -->|Yes| G[Auto-navigate to /memories/theater]
    F -->|No| H[Standard calming voice response]

    G --> I[Full-screen family photo slideshow]
    I --> J[AI reads caption via browser TTS]
    J --> K[Patient sees familiar faces + hears names]
    K --> L{Patient calmed?}
    L -->|Yes| M[Return to companion]
    L -->|No| N[Continue slideshow + alert caregiver]
```

---

## AWS Services

| Service | Role | Why |
|---|---|---|
| **Bedrock (Claude 3 Haiku)** | Triage, care guidance, distress scoring | State-of-art reasoning, fast, cheap per-token |
| **Bedrock Knowledge Base** | RAG — patient personal context embeddings | Managed embeddings + retrieval, no vector DB to run |
| **Step Functions** | Multi-agent orchestration | Visual state machine, retry logic, parallel branches |
| **Lambda** (Node.js 24.x) | All backend logic — 16 functions | Scales 0→1000 concurrent, pay-per-ms |
| **API Gateway** | Client-facing REST API | Managed TLS, throttle, X-Ray tracing |
| **DynamoDB** | Profiles, logs, distress scores, route configs | Single-digit ms reads, PAY_PER_REQUEST, TTL |
| **S3** | KB docs, audio clips (24h auto-delete) | Durable, lifecycle rules for privacy |
| **Amazon Polly** (Aditi) | Indian English TTS | Warm natural Indian English, <300ms |
| **Deepgram Nova-2** | Always-on real-time STT WebSocket | 500ms transcript latency |
| **Amazon SNS** | Emergency caregiver alerts | Fan-out for future multi-caregiver |
| **EventBridge** | Route anomaly + burnout cron | Decoupled event bus |
| **Cognito** | Caregiver authentication | Managed user pools |
| **Amplify Hosting** | Frontend + global CDN | Git-push deploy, HTTPS, SPA rewrites |
| **AWS CDK** (TypeScript) | Infrastructure as code | Full stack in one `cdk deploy` |
| **Groq** (Qwen 3.8B) | Patient voice AI — ultra-low latency | Sub-2s responses for real-time use |

---

## Tech Stack

```
Frontend:      React 19 + TypeScript · Vite 8 · TailwindCSS 3 · React Router 7
Backend:       Node.js 24.x ESM · AWS Lambda × 16 · AWS CDK TypeScript
AI:            Groq (Qwen 3.8B / LLaMA 3.3) · Amazon Bedrock (Claude 3 Haiku)
               Bedrock Knowledge Base · Amazon Polly · Deepgram Nova-2
Storage:       DynamoDB (4 tables) · S3 (2 buckets)
Events:        Amazon SNS · EventBridge · Step Functions
Auth:          Amazon Cognito
Hosting:       AWS Amplify (CDN) + API Gateway
```

---

## Performance

| Operation | P50 | P95 | P99 | Hard Cap |
|---|---|---|---|---|
| Page startup (mic ready) | ~300ms | ~500ms | ~800ms | — |
| Deepgram STT transcript | ~500ms | ~800ms | ~1.2s | — |
| Groq AI response | ~1.5s | ~3s | ~5s | **8s** |
| Polly TTS synthesis | ~200ms | ~350ms | ~600ms | — |
| **Speak → hear reply (E2E)** | **~2.5s** | **~4s** | **~7s** | **8s** |
| Caregiver alert email | ~400ms | ~1s | ~2s | — |

**Concurrent capacity:** Lambda 1000 → ~5,000 simultaneous active patients.

---

## Design Principles

- **Fallback-first** — every AI call has a hardcoded offline fallback; never crashes silently
- **Confidence-gated** — triage < 0.65 confidence flags for human review, never auto-escalates
- **Idempotent alerts** — DynamoDB conditional write dedup prevents duplicate emergency emails
- **Least-privilege IAM** — each Lambda has its own scoped role
- **Privacy-by-design** — S3 audio has 24h lifecycle auto-expiry; no continuous cloud audio
- **Empathy in engineering** — warm amber theme for patients, premium dark for caregivers

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| POST | `/onboard` | Create/update caregiver + patient profile |
| POST | `/chat` | Caregiver AI chat (Step Functions) |
| POST | `/patient/voice` | Patient voice AI → Polly audio |
| POST | `/patient/alert` | Caregiver emergency email |
| POST | `/patient/transcribe` | Groq Whisper PTT transcription |
| GET | `/deepgram/token` | Secure Deepgram key proxy |
| POST | `/route/set` | Set expected patient route |
| POST | `/route/check` | Check for route deviation |
| POST | `/qr/generate` | Generate bystander QR code |

---

## Quick Start

```bash
# 1. Deploy infrastructure
cd infrastructure && npm install
cdk bootstrap aws://YOUR_ACCOUNT_ID/ap-south-1
cdk deploy

# 2. Run frontend locally
cd frontend && cp .env.example .env.local
# Edit .env.local with ApiUrl from CDK output
npm install && npm run dev
```

---

## Impact

- **8.8 million families** directly impacted today → 17 million by 2050
- **Caregiver burnout** detected proactively — not after collapse
- **Patient dignity** preserved — safety net without stripping independence
- **Zero tech skills required** — entirely voice-driven, no menus, no reading

---

> **Not a medical device. Does not diagnose Alzheimer's or any medical condition.**
> For real emergencies: **112** (India) | **100** (Police) | **ARDSI: 1800-200-ARDSI**

*Built with ❤️ for India''s 8.8 million dementia patients and their families*
