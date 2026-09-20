# Sahay: Voice-First Alzheimer's Caregiver & Safety Companion

## Overview
India has **8.8 million people living with dementia**, a number projected to cross 17 million by 2050. Sahay is a voice-first, vernacular-language AI companion designed to support both Alzheimer's patients and their caregivers. 

It provides real-time behavioral guidance to caregivers in moments of crisis, tracks caregiver burnout over time to proactively nudge them toward real help, and offers a safety net for patients experiencing acute disorientation in public.

## Key Features & How It Works

* **Voice-First Caregiver Companion:** Caregivers interact entirely via voice (Hindi, Bengali, English) powered by ultra-fast Deepgram STT and LLaMA 3.3 / Qwen. Sahay uses RAG (Retrieval-Augmented Generation) to store personal patient context (routines, key relationships, likes/dislikes) so advice is deeply personalized, not generic.
* **Multi-Agent Orchestration:** Behind the scenes, specialized AI agents handle different tasks via AWS Step Functions. A **Triage Agent** classifies if an input is routine or an emergency. Routine queries go to the **Care-Guidance Agent**, while emergencies instantly trigger an **Escalation Agent** that sends SMS/SNS alerts to emergency contacts.
* **Burnout Trajectory Tracking:** Caregiving is exhausting. After each session, Sahay extracts a lightweight distress score. It doesn't act on a single bad night, but if it detects a sustained multi-session decline, it proactively nudges the caregiver with professional resources (e.g., ARDSI helpline info).
* **Route Anomaly & Calming Trigger:** Caregivers can set an expected route and destination on a live map. If a patient deviates or asks "where am I?", the system routes them safely and instantly triggers a personalized, AI-generated calming voice script on the patient's device while alerting the caregiver.
* **Memory Theater:** A visual, interactive slideshow of uploaded family photos with AI-generated narration to help patients stay grounded and calm during episodes of confusion.

## Why Sahay? (The Market Gap)
Existing caregiver-support tools (like SAGE-LEAF) explicitly require English literacy and reliable internet to even enroll. This completely excludes most Indian family caregivers, whose documented barriers are a lack of time, limited internet access, and digital illiteracy. 

Sahay requires **0 tech skills**. It is entirely voice-driven and speaks the local language. Caregivers do not have to navigate complex menus or read long clinical articles; they simply speak to Sahay in their native tongue during a moment of crisis and receive immediate, calming, and practical guidance.

## Why is it Innovative?
Sahay moves away from the "static knowledge base" paradigm of traditional medical apps. 
1. **Context-Aware AI:** It doesn't just read WebMD. If a caregiver says, "she keeps calling me her sister's name," Sahay retrieves the actual stored sister's name and relationship dynamics to give specific, actionable advice.
2. **Adaptive Intelligence:** The AI's responses dynamically adapt based on the dementia stage. Early-stage guidance emphasizes patient autonomy; severe-stage shifts toward caregiver self-care and safety.
3. **Sensor & Intent Fusion:** By combining real-time geolocation with conversational distress and intent signals (e.g. knowing when a patient actually wants to go home vs. a scheduled appointment), Sahay creates a highly accurate safety net that prevents false positives while guaranteeing help when it's truly needed.

## The Impact: Who is Affected and Why?
* **8.8 Million Families:** Sahay directly impacts the families of the 8.8 million Indians living with dementia today, scaling to support the 17 million projected by 2050.
* **Alleviating Caregiver Burnout:** Caregivers often suffer from severe isolation, depression, and physical exhaustion. By providing a 24/7 companion that listens, guides, and monitors their mental well-being over time, Sahay intervenes before total caregiver collapse.
* **Patient Safety & Dignity:** Patients gain a localized safety net that protects them from wandering and public disorientation without stripping them of their independence, allowing them to age with dignity in their own communities.
