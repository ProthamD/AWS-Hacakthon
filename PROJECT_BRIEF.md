# Project Brief: Sahay — Voice-First Alzheimer's Caregiver & Safety Companion

**Hackathon:** First Commit (Bharat Builds Tour, WeMakeDevs x AWS), Sep 17-20 2026
**Track:** Ship It (deployed on AWS, live URL required — architecture is part of the score)
**Builder:** Solo, weekend build

---

## BUILD PROGRESS (updated by agent)

**🚀 LIVE API:** `https://m4fcfzmsa7.execute-api.ap-south-1.amazonaws.com/prod/`
**🌐 LIVE FRONTEND:** `https://main.d33r1s7xj9cmie.amplifyapp.com`

| Phase | Status | Notes |
|-------|--------|-------|
| **§5 Environment Setup** | ✅ DONE | AWS CLI configured, CDK deployed, API live. |
| **Phase 0 — CDK Scaffold** | ✅ LIVE | Stack deployed. All resources live in `ap-south-1`. |
| **3.1 Voice Companion** | ✅ LIVE | chatHandler + onboardHandler. Groq LLaMA 3.3 active. |
| **3.2 Multi-Agent Step Functions** | ✅ LIVE | triageAgent + careGuidanceAgent + escalationAgent. |
| **3.3 Burnout Tracking** | ✅ GATE PASSED | burnoutChecker live — `nudgesTriggered:1` confirmed ✅. |
| **3.4a Route Anomaly** | ✅ GATE PASSED | routeMonitor — deviation detection + EventBridge ✅. |
| **3.4b Calming Response** | ✅ LIVE | calmingResponseAgent + EventBridge rule. |
| **3.5 Bystander QR** | ✅ GATE PASSED | generateQR live ✅. |
| **4.1 Patient Companion** | ✅ LIVE | Groq Whisper (7s chunks) → LLaMA 3.3 → SpeechSynthesis. |
| **4.2 Voice Accuracy** | ✅ IMPROVED | 7s chunks (was 4s), RMS 5 (was 8), Whisper elderly speech prompt. |
| **4.3 Intent/Distress Logic** | ✅ IMPROVED | distress_score filter, Sahay keyword override, map trigger, chatter suppression. |
| **4.4 SPA Routing** | ✅ FIXED | Amplify rewrite rule for React Router direct links and refresh. |
| **4.5 UI/UX Redesign** | ✅ LIVE | "Memory Garden" dual-theme: warm amber patient + premium dark caregiver. Breathing orb, particle stars, Playfair Display font, Glassmorphism. |
| **4.6 Memory Theater** | ✅ LIVE | `/memories` admin for photo upload. `/memories/theater` full-screen slideshow with AI narration. Auto-triggered from patient page. |
| **4.7 Speech Upgrade (Deepgram)** | 🔲 READY | Architecture ready. Needs free Deepgram API key. Will enable real-time streaming + emotion detection. Groq kept as fallback. |

**NEXT STEPS:**
1. **Deepgram** — Get a free key at [console.deepgram.com](https://console.deepgram.com) to unlock real-time streaming STT with emotion detection.
2. **Memory Theater** — Upload patient photos via `/memories`. They appear on the patient page automatically.


**Live AWS Outputs:**
```
API URL:         https://m4fcfzmsa7.execute-api.ap-south-1.amazonaws.com/prod/
Audio Bucket:    sahay-audio-255144833317
KB Docs Bucket:  sahay-kb-docs-255144833317
Cognito Pool:    ap-south-1_uWqdL9hpy
Cognito Client:  4ftg0j9f9tdadq2hqodt0fc9tn
SNS Topic:       arn:aws:sns:ap-south-1:255144833317:sahay-alerts
State Machine:   arn:aws:states:ap-south-1:255144833317:stateMachine:sahay-multi-agent
```

---

## 1. Problem statement (do not deviate from this framing)

India has **8.8 million people living with dementia**, projected to cross 17 million by 2050. Existing caregiver-support tools (SAGE-LEAF and similar) explicitly require English literacy and reliable internet to even enroll — this excludes most Indian family caregivers, whose actual documented barriers are "lack of time, limited internet access, digital illiteracy" (peer-reviewed Indian caregiver study). Caregivers are largely unsupported and "figure it out alone."

**What we are building:** a voice-first, vernacular-language AI companion that (a) gives real-time behavioral guidance to caregivers in the moment of crisis, (b) tracks caregiver burnout over time and nudges toward real help before burnout is severe, and (c) provides a safety net for patients experiencing acute disorientation in public (e.g. on a bus, unfamiliar place).

### Non-negotiable framing constraints (do not overclaim)
- **This app does NOT diagnose Alzheimer's or detect "an Alzheimer's episode."** It detects *acute confusion/disorientation signals* and *route/location anomalies*, and responds to those. Never generate UI copy, agent prompts, or docs claiming medical detection/diagnosis.
- **Never continuously record or stream audio to the cloud.** All audio capture is local-trigger-first (see §3's STRETCH GOAL section). Any cloud-processed audio clip is short (10-15s), processed, and deleted — never stored long-term.
- **Always provide a path to human escalation** for anything resembling a real emergency. The app assists; it does not replace caregivers, doctors, or emergency services.
- **Every autonomous action needs a confidence gate.** High-confidence findings can auto-act (e.g. trigger calming flow). Lower-confidence findings should notify and wait for confirmation, not act blindly.

---

## 2. Current resolution / decisions locked in

- Track: **Ship It** (AWS cloud-deployed, not the local/open-source track)
- Core idea locked after comparing 9+ alternatives (DBT payment-failure explainer, gig-worker heat safety, GLOF flood relay, code-plagiarism detector, AWS security copilot — all scored, this one scored highest on the combination of real-problem strength + accessibility + feasibility)
- Honest self-assessed score: ~8.5/10 overall. Known risk: this has more moving parts than a single-feature app — **feasibility depends on strict phase discipline (§6)**, not on trying to build everything in §3-4 at once.
- Audio-based distress detection (§4, the STRETCH GOAL section) is an explicit **stretch goal, not core MVP** — build it last, and only if Phases 1-3 are solid and demoable first.

---

## 3. Core features (in priority order — build top to bottom)

### 3.1 Voice-first caregiver companion (MVP CORE — must work end to end)
- Onboarding flow: caregiver provides patient context (name, key relationships, routine, likes/dislikes, dementia stage: early/moderate/severe)
- Store this as embeddings (Bedrock embeddings + a Knowledge Base or OpenSearch Serverless) for retrieval — **this must be genuine RAG, not a static prompt.** When caregiver asks something like "she keeps calling me her sister's name," the response should retrieve the actual stored sister's name and situation, not give generic advice.
- Care-stage-adaptive prompting: early-stage guidance emphasizes patient autonomy; severe-stage guidance shifts toward caregiver self-care. Condition the system prompt on the stored stage.
- Voice in/out: Amazon Transcribe (speech-to-text) → Bedrock (grounded response) → Amazon Polly (text-to-speech)

### 3.2 Multi-agent orchestration (Step Functions)
Do not implement this as one big prompt. Use distinct agent roles, each a separate Bedrock call with a distinct system prompt, orchestrated by a Step Functions state machine:
1. **Triage Agent** — classifies input: routine behavioral question vs. real emergency (fall, chest pain, caregiver expressing self-harm ideation, patient reported missing)
2. **Care-Guidance Agent** — RAG-grounded behavioral guidance (only reached if Triage says "routine")
3. **Escalation Agent** — only reached if Triage flags danger; sends SNS alert with context to a pre-registered emergency contact + returns a calm "help is being contacted" message to the user

### 3.3 Burnout trajectory tracking
- After each conversation, Bedrock extracts a lightweight distress score (frustration/exhaustion/hopelessness signal), written to DynamoDB with a timestamp
- **Do not act on a single bad session.** Run a rolling-window trend check (e.g. via a scheduled EventBridge + Lambda job) — only trigger a proactive "are you okay, here are resources" nudge on a sustained multi-session decline, not one rough night
- Resource nudge should point to real support (e.g. ARDSI helpline info — placeholder/sample data is fine for the demo)

### 3.4 Location-based route-anomaly + calming trigger
- Caregiver can set an expected route/destination + time window for the patient (e.g. "12B bus to market, arrives ~11am")
- A Lambda job compares live/simulated location pings against the expected route; flags real deviation (wrong direction, missed stop, stationary too long somewhere unexpected)
- On flag: **proactively** trigger the calming flow — Bedrock generates a short, warm script using the stored patient context (name, likely destination, gentle reminder of diagnosis, "stay where you are, calling [contact name] now"), delivered via Polly — and simultaneously fires an SNS alert with location to the caregiver

### 3.5 Bystander-accessible trigger
- One large, always-visible "I'm lost / help" button in the patient-facing UI
- A QR code / simple card (generated by the app, printed by caregiver) that any bystander can scan to pull up the same calming flow + caregiver contact info, without the patient needing to operate anything

### 4. STRETCH GOAL — build LAST, only with spare time

**4.1 Local-first distress detection (not continuous cloud audio).**
- On-device only: lightweight keyword/pattern spotting for confusion phrases ("where am I," "who are you," repeated questions) — nothing leaves the device in normal operation
- Only on local trigger: send a short (10-15s) clip to S3 with an aggressive lifecycle policy (auto-delete in 24h) → Transcribe → Bedrock confirms genuine distress vs. false trigger (song lyric, joke, unrelated speech) → clip is not retained after processing

**4.2 Fusion gate (the actual technical payoff of this feature).**
- Only escalate to the full intervention flow (§3.4's calming response + alert) when **both** the audio-distress signal **and** the location/route anomaly cross threshold **together**, via a Step Functions gate combining both Lambda outputs
- This exists specifically to suppress false positives — audio alone (misheard phrase) or location alone (bus running late) should not fire the full intervention on their own

**If you are running low on time, cut §4 entirely. §3 alone is a complete, demoable product.**

---

## 5. Environment setup (do this first, before anything in the dependency graph)

**This part needs YOU, not the agent — an agentic tool cannot create AWS credentials for you.**

1. Have an AWS account with billing set up (use the hackathon's AWS credits if provided).
2. Install and configure the AWS CLI locally: `aws configure` — this needs an IAM user (or role) with an access key ID + secret access key. Create an IAM user for yourself in the AWS Console with sufficient permissions for this build (Lambda, API Gateway, DynamoDB, S3, Bedrock, Cognito, EventBridge, Step Functions, SNS, Amplify, IAM role creation) — do not use root account credentials.
3. Verify it works before handing off to the agent: `aws sts get-caller-identity` should return your account details.
4. **Enable Bedrock model access** in the AWS Console (Bedrock → Model access) for whichever foundation model you plan to use — this is a manual one-time approval step per account/region and commonly trips people up if skipped.
5. Tell the agent explicitly which AWS region to deploy into (Bedrock model availability varies by region — check this before picking one).

**Deployment tooling — tell the agent to use AWS CDK (TypeScript or Python), not raw CloudFormation/SAM YAML.** CDK is real code, which an agentic tool can read, modify, and reason about far more reliably than hand-edited YAML templates — fewer silent misconfiguration errors when the agent iterates. One-time setup the agent should run: `npm install -g aws-cdk`, then `cdk bootstrap` (once per account/region) before the first deploy.

**Every gate in §6 means an actual `cdk deploy` (or equivalent) to real AWS, not just working code locally.** "You have a live URL" (Phase 0's gate) and every gate after it should be verified against the deployed environment. Tell the agent to deploy after completing each node in the graph and confirm the gate against the live stack, not just local test output — this is a Ship It track hackathon, judged on a live URL, so untested-but-deployed is a real risk (this is exactly the failure mode that sank the Cloud_Gov reference repo this project's approach was refined away from).

---

## 6. Build strategy: dependency graph with verify-before-extend gates

Do not follow a flat numbered list. Instead, treat the feature set as a dependency graph. Correlated/dependent features nest sequentially — each one must be manually verified working before the next one is built on top of it ("envelope in envelope"). Uncorrelated features are independent branches that can be built in any order relative to each other, since they cannot break one another — they only need to be reconciled at explicit merge points.

```
Phase 0 (scaffold — everything depends on this)
 │   AWS account setup, least-privilege IAM roles (§6), base Lambda/API
 │   Gateway/DynamoDB scaffolding, Amplify hello-world deployed.
 │   GATE: you have a live URL, even if it does nothing yet.
 │
 ├─ Branch A (trunk — strictly sequential; do not start the next node
 │  │         until the current one is manually verified)
 │  │
 │  3.1 Voice companion — single agent, RAG-grounded (skip the
 │  │   multi-agent split for now; get ONE Bedrock call + retrieval
 │  │   working end to end first)
 │  │   GATE: caregiver can type/speak a question and get a grounded,
 │  │   personalized answer in the deployed app.
 │  │
 │  └─ 3.2 Multi-agent split (Triage / Guidance / Escalation via
 │     │   Step Functions) — wraps 3.1, do not attempt before 3.1's
 │     │   gate is met
 │     │   GATE: a test emergency phrase routes to Escalation and
 │     │   fires a real SNS message; a normal question still routes
 │     │   to Guidance.
 │     │
 │     └─ 3.3 Burnout trajectory tracking — wraps 3.2's session data
 │            GATE: a simulated 3-session decline triggers a nudge;
 │            a single bad session does not.
 │
 ├─ Branch B (independent of Branch A at first — can be built in
 │  │         parallel with Branch A, or before/after it)
 │  │
 │  3.4a Route-anomaly detection Lambda — pure geofencing/route-
 │  │    deviation logic against a simulated location feed. No
 │  │    dependency on Branch A.
 │  │    GATE: a simulated route deviation is correctly flagged.
 │  │
 │  └─ 3.4b Calming response generation — ★ MERGE POINT ★
 │     │    Requires BOTH 3.4a (flag fires) AND 3.1 (RAG store with
 │     │    patient context) to be independently verified first.
 │     │    This is where integration bugs hide — test it by hand,
 │     │    don't assume it works because both halves work alone.
 │     │    GATE: a simulated route deviation produces a correct,
 │     │    personalized calming voice script + caregiver SNS alert.
 │     │
 │     └─ 3.5 Bystander QR trigger — wraps 3.4b, reuses the same
 │            calming flow. Mostly front-end; low risk.
 │
 └─ Branch C (stretch — fully independent, no cloud dependency
    │         until its own confirmation step; build LAST)
    │
    4.1 On-device distress keyword spotting — standalone, no
    │   dependency on anything else.
    │
    └─ 4.2 Fusion gate — ★ MERGE POINT ★
           Requires BOTH 3.4a (route anomaly) AND 4.1 (audio
           distress) to be independently verified before wiring
           the AND-condition in Step Functions.
           Only attempt this branch if A and B are already
           demo-ready with time to spare.
```

**Working rule for the agent:** at every node, decide implementation order by checking which prerequisite nodes are already verified — never build a node whose prerequisites aren't done, and never assume a merge point works just because its two inputs each work in isolation. After finishing any node, stop and report what was built and how to verify it, rather than continuing on to dependent nodes automatically.

**Build a "simulate an event" test harness as part of Phase 0.** Since there's no real sensor/GPS feed, you need a simple internal trigger (a debug button or script) to inject fake route deviations, fake emergency phrases, and fake distress clips — every gate above depends on this existing first, and it's also what you'll use live in the demo.

---

## 7. System design patterns to apply (for code quality and to avoid common agentic-build failures)

- **Event-driven, not deeply nested synchronous calls.** Use EventBridge + Step Functions to orchestrate; avoid Lambda-calls-Lambda-calls-Lambda chains — they're fragile, hard to debug, and prone to timeout cascades.
- **Confidence-gated autonomy.** Every agent decision that triggers an external action (alert, escalation) should carry a confidence score; only high-confidence findings auto-act, everything else surfaces for confirmation. Apply this in both Triage (§3.2) and the fusion gate (§4.2).
- **Fallback/circuit-breaker for Bedrock calls.** If a Bedrock call fails, times out, or returns malformed output, fall back to a safe, hardcoded response (e.g., a helpline number) — never fail silently or crash the flow. This matters more here than in a typical app because failures happen during a caregiver's actual crisis moment.
- **Idempotent alert handlers.** SNS-triggering Lambdas must be idempotent — a retry should not send duplicate alerts to a caregiver.
- **Least-privilege IAM per function.** Do not create one broad execution role for everything; scope each Lambda's role to only the tables/services it actually touches. This is a common failure mode when an agentic tool is told to "just make it work."
- **Separate the RAG/personalization store from the operational data store.** Patient-context embeddings (Knowledge Base/OpenSearch) should be a distinct concern from operational logs (DynamoDB: conversations, distress scores, route configs) — don't conflate schemas.
- **Privacy-by-design for any audio (§4 only).** Process-and-discard; S3 lifecycle auto-expiry; never persist raw audio beyond the processing window.

---

## 8. AWS services map

| Service | Used for |
|---|---|
| Lambda | Business logic, trigger handlers, remediation actions |
| API Gateway | Client-facing endpoints |
| DynamoDB | Caregiver/patient profiles, conversation logs, distress scores, route configs |
| S3 | Temporary audio clips (§4, auto-expiring lifecycle), static assets |
| Bedrock | Triage/Guidance/Escalation/Wellbeing agents, embeddings, distress classification |
| Bedrock Knowledge Base / OpenSearch Serverless | RAG store for patient personal context |
| Amazon Transcribe | Speech-to-text |
| Amazon Polly | Text-to-speech (calming scripts) |
| Amplify Hosting | Caregiver dashboard + lightweight patient-facing web app |
| Cognito | Auth (caregiver account, patient linking) |
| EventBridge | Scheduled burnout-trend checks, route-monitoring polling |
| Step Functions | Multi-agent orchestration, fusion gate |
| SNS | Alerts to caregiver, escalation messages |

---

## 9. Explicitly out of scope for this weekend

- Real GPS hardware/wearable integration — use the simulated event harness instead
- Real medical diagnosis or clinical claims of any kind
- Continuous/always-on cloud audio processing
- Multi-language support beyond one or two target languages for the demo (pick one, e.g. Bengali or Hindi, and do it well)
