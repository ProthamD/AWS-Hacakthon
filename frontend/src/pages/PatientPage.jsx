/**
 * PatientPage — Voice-first AI Companion using Deepgram & Groq Whisper STT
 *
 * Architecture:
 *  1. If Deepgram key present -> WebSocket real-time streaming (250ms chunks)
 *  2. If Deepgram fails or missing -> Groq Whisper fallback (7s chunks)
 *  3. Final transcripts sent to POST /patient/voice (Groq Llama 3.3)
 *  4. AI response spoken via SpeechSynthesis
 *  5. 20-second rolling buffer maintained for panic upload
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { API_BASE } from "../App";

const CHUNK_INTERVAL_MS = 7000;   // Groq fallback chunk interval
const BUFFER_SECONDS = 20;
const SILENCE_THRESHOLD = 5;
const MAX_RETRIES = 2;
const DEEPGRAM_KEY = import.meta.env.VITE_DEEPGRAM_KEY || '';

// Fetch with retry and timeout
async function fetchWithRetry(url, options, retries = MAX_RETRIES, timeoutMs = 8000) {
  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
}

// Local fallback when API is unavailable
function localFallback(transcript, profile) {
  const t = (transcript || "").toLowerCase();
  const name = profile?.patientName || "dear";
  const contact = profile?.emergencyContactName || "your caregiver";

  if (t.includes("what is my name") || t.includes("who am i") || t.includes("my name"))
    return { response: `Your name is ${name}.${profile?.patientAge ? ` You are ${profile.patientAge} years old.` : ""}`, shouldAlert: false };
  if (t.includes("where am i going") || t.includes("destination") || t.includes("where should i go") || t.includes("route") || t.includes("show me"))
    return { response: `I am bringing up the map to your destination now.`, shouldAlert: false, intent: "destination_query" };
  if (t.includes("i am lost") || t.includes("i'm lost") || t.includes("where am i"))
    return { response: `${name}, please stay exactly where you are. I am alerting ${contact} right now. Help is on the way.`, shouldAlert: true, intent: "lost" };
  if (t.includes("help") || t.includes("scared") || t.includes("afraid"))
    return { response: `${name}, you are safe. I am alerting ${contact} right now.`, shouldAlert: true };
  if (t.includes("who are you") || t.includes("what are you"))
    return { response: `I am Sahay, your voice companion. I am always here to help you.`, shouldAlert: false };
  if (t.includes("sahay"))
    return { response: `I am here, ${name}. How can I help you?`, shouldAlert: false };
  return { response: `${name}, you are safe. I am here with you.`, shouldAlert: false };
}

export default function PatientPage() {
  const [time, setTime] = useState(new Date());
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState("starting");
  const [lastHeard, setLastHeard] = useState("");
  const [lastSpoken, setLastSpoken] = useState("");
  const [alertSent, setAlertSent] = useState(false);
  const [conversationLog, setConversationLog] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [aiMode, setAiMode] = useState("ai");

  const profileRef = useRef(null);
  const alertSentRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const sessionHistoryRef = useRef([]);
  const lastResponseRef = useRef("");
  const rollingBufferRef = useRef([]);
  const chunkRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const analyserRef = useRef(null);
  const loopRef = useRef(null);
  const isProcessingRef = useRef(false);
  const lastSpeakEndRef = useRef(0);
  const deepgramSocketRef = useRef(null);
  const usingDeepgramRef = useRef(false);

  useEffect(() => { profileRef.current = profile; }, [profile]);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("sahay_patient_profile");
      if (raw) { const p = JSON.parse(raw); setProfile(p); profileRef.current = p; }
    } catch {}
  }, []);

  useEffect(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener("voiceschanged", () => {});
    }
  }, []);

  useEffect(() => {
    startMic();
    return () => {
      clearTimeout(loopRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      window.speechSynthesis?.cancel();
      if (deepgramSocketRef.current) deepgramSocketRef.current.close();
    };
  }, []);

  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      setStatus("listening");

      if (DEEPGRAM_KEY) {
        startDeepgram(stream);
      } else {
        scheduleNextChunk(stream); // Fallback
      }
    } catch (err) {
      console.error("[PatientPage] Mic error:", err);
      setStatus("error");
    }
  };

  const getRMS = () => {
    if (!analyserRef.current) return 100;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += Math.abs(v - 128);
    return sum / data.length;
  };

  const startDeepgram = (stream) => {
    usingDeepgramRef.current = true;
    const socket = new WebSocket("wss://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&sentiment=true&endpointing=500&interim_results=false", [
      "token", DEEPGRAM_KEY
    ]);
    deepgramSocketRef.current = socket;

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    chunkRecorderRef.current = recorder;

    socket.onopen = () => {
      console.log("[PatientPage] Deepgram connected.");
      recorder.start(250); // Emit chunk every 250ms
    };

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        rollingBufferRef.current.push(e.data);
        if (rollingBufferRef.current.length > BUFFER_SECONDS * 4) { // 250ms = 4 chunks/sec
          rollingBufferRef.current.shift();
        }
        if (socket.readyState === 1) {
          socket.send(e.data);
        }
      }
    };

    socket.onmessage = (message) => {
      const received = JSON.parse(message.data);
      const transcript = received?.channel?.alternatives[0]?.transcript;
      if (transcript && received.is_final) {
        const sentiment = received?.channel?.alternatives[0]?.sentiment;
        handleFinalTranscript(transcript, sentiment);
      }
    };

    socket.onclose = () => {
      console.warn("[PatientPage] Deepgram closed. Falling back to Groq.");
      usingDeepgramRef.current = false;
      try { recorder.stop(); } catch {}
      scheduleNextChunk(streamRef.current);
    };

    socket.onerror = (e) => {
      console.error("[PatientPage] Deepgram error:", e);
    };
  };

  const scheduleNextChunk = (stream) => {
    if (!stream || usingDeepgramRef.current) return;

    const chunks = [];
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    chunkRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
        rollingBufferRef.current.push(e.data);
        if (rollingBufferRef.current.length > BUFFER_SECONDS / (CHUNK_INTERVAL_MS / 1000)) {
          rollingBufferRef.current.shift();
        }
      }
    };

    recorder.onstop = async () => {
      if (chunks.length === 0 || usingDeepgramRef.current) { scheduleNextChunk(stream); return; }

      const msSinceSpeakEnd = Date.now() - lastSpeakEndRef.current;
      if (isSpeakingRef.current || msSinceSpeakEnd < 2000) {
        scheduleNextChunk(stream); return;
      }

      const rms = getRMS();
      if (rms < SILENCE_THRESHOLD) {
        scheduleNextChunk(stream); return;
      }

      if (isProcessingRef.current) { scheduleNextChunk(stream); return; }
      isProcessingRef.current = true;

      const blob = new Blob(chunks, { type: mimeType });
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.readAsDataURL(blob);
      });

      setStatus("transcribing");
      let transcript = "";
      try {
        const res = await fetchWithRetry(`${API_BASE}/patient/transcribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioBase64: base64, mimeType }),
        });
        if (res && res.ok) {
          const data = await res.json();
          transcript = data.transcript || "";
        }
      } catch (err) {
        console.warn("[PatientPage] Transcribe failed:", err);
      }

      if (transcript && transcript.length > 2) {
        await handleFinalTranscript(transcript, "neutral");
      } else {
        setStatus("listening");
      }

      isProcessingRef.current = false;
      if (!usingDeepgramRef.current) scheduleNextChunk(stream);
    };

    recorder.start();
    loopRef.current = setTimeout(() => {
      try { recorder.stop(); } catch {}
    }, CHUNK_INTERVAL_MS);
  };

  const handleFinalTranscript = async (transcript, sentiment) => {
    const msSinceSpeakEnd = Date.now() - lastSpeakEndRef.current;
    if (isSpeakingRef.current || msSinceSpeakEnd < 2000) return;
    if (isProcessingRef.current && usingDeepgramRef.current) return;
    isProcessingRef.current = true;
    setLastHeard(transcript);
    setConversationLog(prev => [...prev.slice(-6), { who: "patient", text: transcript }]);
    setStatus("thinking");

    const isSahayAddressed = transcript.toLowerCase().includes("sahay");
    let responseText = null;
    let shouldAlert = false;

    try {
      const res = await fetchWithRetry(`${API_BASE}/patient/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          sentiment,
          patientProfile: profileRef.current || {},
          sessionHistory: sessionHistoryRef.current.slice(-6),
        }),
      });
      if (res && res.ok) {
        const data = await res.json();
        const distressScore = data.distressScore || data.distress_score || 1;
        const intent = data.intent || "other";

        const KEY_INTENTS = ["name_query", "destination_query", "lost", "scared", "distress", "greeting"];
        const isLowStakes = distressScore <= 2 && !KEY_INTENTS.includes(intent);
        if ((intent === "ignore" || isLowStakes) && !isSahayAddressed) {
          setStatus("listening");
          isProcessingRef.current = false;
          return;
        }

        if ((intent === "ignore" || isLowStakes) && isSahayAddressed) {
          responseText = `I am here. How can I help you?`;
          setAiMode("ai");
        } else {
          responseText = data.response;
          setAiMode("ai");
        }

        shouldAlert = data.shouldAlertCaregiver && distressScore >= 7;

        if (intent === "destination_query" || intent === "lost" ||
            transcript.toLowerCase().includes("route") || transcript.toLowerCase().includes("show me")) {
          setShowMap(true);
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
              (err) => console.warn("GPS error", err),
              { enableHighAccuracy: true }
            );
          }
        } else {
          setShowMap(false);
        }

        sessionHistoryRef.current.push({ role: "user", content: transcript });
        if (data.assistantMessage) sessionHistoryRef.current.push(data.assistantMessage);
      }
    } catch (err) {
      console.warn("[PatientPage] Voice API failed:", err);
    }

    if (!responseText) {
      setAiMode("fallback");
      const fb = localFallback(transcript, profileRef.current);
      responseText = fb.response;
      shouldAlert = fb.shouldAlert;
      if (fb.intent === "destination_query" || fb.intent === "lost") {
        setShowMap(true);
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            (err) => console.warn("GPS error", err),
            { enableHighAccuracy: true }
          );
        }
      } else {
        setShowMap(false);
      }
    }

    lastResponseRef.current = responseText;
    setConversationLog(prev => [...prev.slice(-6), { who: "sahay", text: responseText }]);

    if (shouldAlert && !alertSentRef.current) {
      alertSentRef.current = true;
      setAlertSent(true);
      uploadPanicAudio(transcript);
    }

    await speak(responseText);
    setStatus("listening");
    isProcessingRef.current = false;
  };

  const speak = (text) => new Promise((resolve) => {
    if (!window.speechSynthesis) return resolve();
    window.speechSynthesis.cancel();
    isSpeakingRef.current = true;
    setIsSpeaking(true);
    setLastSpoken(text);
    setStatus("speaking");

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-IN";
    utter.rate = 0.82;
    utter.pitch = 1.05;
    utter.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.includes("Google") && v.lang.startsWith("en"))
      || voices.find(v => v.lang.startsWith("en-IN"))
      || voices.find(v => v.lang.startsWith("en"));
    if (preferred) utter.voice = preferred;

    const done = () => {
      isSpeakingRef.current = false;
      lastSpeakEndRef.current = Date.now();
      setIsSpeaking(false);
      resolve();
    };
    utter.onend = done;
    utter.onerror = done;
    window.speechSynthesis.speak(utter);
  });

  const uploadPanicAudio = async (detectedPhrase) => {
    if (rollingBufferRef.current.length === 0) return;
    const blob = new Blob(rollingBufferRef.current, { type: "audio/webm" });
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        await fetch(`${API_BASE}/distress/audio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientId: profileRef.current?.patientName || "unknown",
            audioBase64: reader.result.split(",")[1],
            detectedPhrase,
            patientProfile: {
              name: profileRef.current?.patientName,
              emergencyContactName: profileRef.current?.emergencyContactName,
              emergencyContactPhone: profileRef.current?.emergencyContactPhone,
            },
          }),
        });
      } catch (e) { console.warn("Audio upload failed", e); }
    };
    reader.readAsDataURL(blob);
  };

  const handleManualPanic = async () => {
    const p = profileRef.current || {};
    const msg = `${p.patientName || "Dear"}, you are safe. I am alerting ${p.emergencyContactName || "your caregiver"} right now. Please stay where you are.`;
    if (!alertSentRef.current) { alertSentRef.current = true; setAlertSent(true); uploadPanicAudio("manual"); }
    await speak(msg);
  };

  const name = profile?.patientName || '—';

  const orbGradient =
    alertSent ? 'linear-gradient(135deg, #f87171, #ef4444)'
    : isSpeaking ? 'linear-gradient(135deg, #f59e0b, #d97706)'
    : 'linear-gradient(135deg, #7c6ffa, #4ade80, #38bdf8)';

  const orbClass =
    alertSent ? 'orb-deepgram alert'
    : isSpeaking ? 'orb-deepgram speaking'
    : 'orb-deepgram';

  const statusLabel =
    status === 'listening' ? 'Listening'
    : status === 'transcribing' ? 'Understanding…'
    : status === 'thinking' ? 'Thinking…'
    : status === 'speaking' ? 'Speaking'
    : status === 'starting' ? 'Starting…'
    : status === 'error' ? 'Allow microphone access' : '';

  const statusColor =
    status === 'listening' ? 'rgba(124,111,250,0.8)'
    : status === 'transcribing' ? 'rgba(155,143,252,0.9)'
    : status === 'thinking' ? 'rgba(155,143,252,0.9)'
    : status === 'speaking' ? '#f59e0b'
    : status === 'error' ? '#f87171'
    : 'rgba(255,255,255,0.2)';

  const statusDot =
    status === 'listening' ? '#4ade80'
    : status === 'transcribing' ? '#7c6ffa'
    : status === 'thinking' ? '#7c6ffa'
    : status === 'speaking' ? '#f59e0b'
    : status === 'error' ? '#f87171'
    : 'rgba(255,255,255,0.2)';

  return (
    <div
      className="font-ui"
      style={{
        minHeight: '100vh', width: '100%',
        background: 'radial-gradient(ellipse at 50% 30%, var(--c-accent-dim) 0%, var(--c-bg) 60%)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* ── Top bar ─────────────────────────────── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 20px', flexShrink: 0,
        borderBottom: '1px solid var(--c-border)',
      }}>
        <span style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--c-text-4)', fontFamily: 'Manrope', fontWeight: 700 }}>
          SAHAY
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
            background: DEEPGRAM_KEY ? 'rgba(74,222,128,0.1)' : 'rgba(124,111,250,0.1)',
            border: `1px solid ${DEEPGRAM_KEY ? 'rgba(74,222,128,0.25)' : 'rgba(124,111,250,0.25)'}`,
            color: DEEPGRAM_KEY ? 'rgba(74,222,128,0.9)' : 'rgba(155,143,252,0.9)',
            padding: '4px 10px', borderRadius: 9999, fontWeight: 700,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: DEEPGRAM_KEY ? '#4ade80' : '#7c6ffa', animation: 'blinkDot 1.4s step-end infinite', display: 'inline-block' }} />
            {DEEPGRAM_KEY ? 'Deepgram Live' : 'Groq Whisper'}
          </span>
          {aiMode === "ai" && <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
            background: 'rgba(255,255,255,0.05)',
            border: `1px solid rgba(255,255,255,0.1)`,
            color: 'rgba(255,255,255,0.5)',
            padding: '4px 10px', borderRadius: 9999, fontWeight: 700,
          }}>AI</span>}
        </div>
      </div>

      {/* ── Center ──────────────────────────────── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '20px', gap: 20, overflowY: 'auto',
      }}>

        {/* Date */}
        <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)' }}>
          {time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>

        {/* Name */}
        <div
          className="font-display"
          style={{
            fontSize: 'clamp(3.5rem, 16vw, 9rem)',
            fontWeight: 400,
            letterSpacing: '-2px',
            lineHeight: 0.95,
            color: 'var(--c-text-1)',
            textAlign: 'center',
          }}
        >
          {name}
        </div>

        {/* Clock */}
        <div
          className="font-display"
          style={{ fontSize: 'clamp(1.4rem, 4vw, 2.2rem)', fontWeight: 300, color: 'var(--c-text-4)', letterSpacing: '0.05em' }}
        >
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>


        {/* Orb — Deepgram Voice Agent Design */}
        <div style={{ position: 'relative', width: 140, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            className={orbClass}
            style={{
              width: '100%', height: '100%',
              background: `linear-gradient(var(--c-surface), var(--c-surface)) padding-box, ${orbGradient} border-box`,
              border: '3px solid transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          />
        </div>

        {/* Status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusDot, display: 'inline-block', animation: 'blinkDot 1.4s step-end infinite' }} />
          <span style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: statusColor, fontWeight: 700 }}>{statusLabel}</span>
        </div>

        {/* Last heard */}
        {lastHeard && status !== 'listening' && (
          <div style={{ fontSize: 12, color: 'var(--c-text-3)', fontStyle: 'italic', maxWidth: 340, textAlign: 'center' }}>
            "{lastHeard}"
          </div>
        )}

        {/* Sahay reply bubble */}
        {isSpeaking && lastSpoken && (
          <div
            className="font-display"
            style={{
              fontSize: 'clamp(1rem, 2vw, 1.25rem)',
              fontStyle: 'italic',
              color: 'var(--c-text-2)',
              textAlign: 'center',
              maxWidth: 400,
              lineHeight: 1.55,
              padding: '16px 20px',
              border: '1px solid var(--c-border)',
              background: 'var(--c-surface-2)',
            }}
          >
            "{lastSpoken}"
          </div>
        )}

        {/* Alert badge */}
        {alertSent && (
          <div style={{
            fontSize: 12, letterSpacing: '0.06em',
            color: 'rgba(74,222,128,0.9)',
            border: '1px solid rgba(74,222,128,0.3)',
            padding: '6px 14px',
          }}>
            ✓ {profile?.emergencyContactName || 'Caregiver'} alerted — help is on the way
          </div>
        )}

        {/* Map */}
        {showMap && profile?.homeAddress && (
          <div style={{
            width: '100%', maxWidth: 400,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.025)',
            padding: 16,
          }}>
            <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(74,222,128,0.7)', marginBottom: 10 }}>
              ◈ Route to safe destination
            </div>
            <iframe
              width="100%" height="150" frameBorder="0"
              style={{ border: 0, display: 'block', marginBottom: 10, opacity: 0.85 }}
              src={`https://maps.google.com/maps?q=${encodeURIComponent(profile.homeAddress)}&output=embed`}
              allowFullScreen
            />
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(profile.homeAddress)}${currentLocation ? `&origin=${currentLocation.lat},${currentLocation.lng}` : ''}`}
              target="_blank" rel="noreferrer"
              style={{
                display: 'block', textAlign: 'center', padding: '10px',
                background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)',
                color: 'rgba(74,222,128,0.9)', fontSize: 13, fontWeight: 600,
                letterSpacing: '0.04em', textDecoration: 'none',
                fontFamily: 'Manrope, sans-serif',
              }}
            >
              ▶ Open directions
            </a>
          </div>
        )}

        {/* Hint chips — what the patient can say */}
        <div style={{ textAlign: 'center', maxWidth: 400, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
          {['"What is my name?"', '"Show me the route"', '"I am lost"', '"I need help"'].map(h => (
            <span
              key={h}
              style={{
                display: 'inline-block',
                fontSize: 11, color: 'var(--c-text-3)',
                border: '1px solid var(--c-border)',
                padding: '4px 10px', borderRadius: 9999,
                letterSpacing: '0.03em',
                background: 'var(--c-interactive)',
              }}
            >
              {h}
            </span>
          ))}
        </div>

        {/* Memory Theater link if memories exist */}
        {(() => {
          try {
            const mems = JSON.parse(localStorage.getItem("sahay_memories") || "[]");
            if (mems.length > 0) return (
              <a href="/memories/theater" style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"0.7rem", color:"rgba(237,232,227,0.45)", letterSpacing:"0.1em", textTransform:"uppercase", textDecoration:"none", marginTop: 8 }}>
                ❐ Watch Memories
              </a>
            );
          } catch {}
          return null;
        })()}

        {/* Conversation log */}
        {conversationLog.length > 0 && (
          <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {conversationLog.slice(-5).map((entry, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: entry.who === 'patient' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '80%',
                    padding: '9px 14px',
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: 'var(--c-text-2)',
                    ...(entry.who === 'patient'
                      ? {
                          background: 'var(--c-accent-dim)',
                          border: '1px solid rgba(217,98,42,0.25)',
                          borderRadius: '12px 12px 3px 12px',
                        }
                      : {
                          background: 'var(--c-surface-2)',
                          border: '1px solid var(--c-border)',
                          borderRadius: '12px 12px 12px 3px',
                        }
                    ),
                  }}
                >
                  <div style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--c-text-4)', marginBottom: 4 }}>
                    {entry.who === 'patient' ? 'You' : 'Sahay'}
                  </div>
                  {entry.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Panic button ─────────────────────────── */}
      <div style={{ padding: '12px 20px 32px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
        <button
          onClick={handleManualPanic}
          style={{
            width: '100%', maxWidth: 400,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
            padding: '18px 24px',
            background: 'rgba(192,57,43,0.10)',
            border: '1px solid rgba(192,57,43,0.35)',
            color: 'var(--c-text-1)',
            fontSize: 15, fontWeight: 600,
            letterSpacing: '0.02em',
            cursor: 'pointer',
            fontFamily: 'Manrope, sans-serif',
            borderRadius: 12,
            transition: 'background 0.2s, border-color 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(192,57,43,0.20)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(192,57,43,0.10)'; }}
        >
          <span style={{ fontSize: 22 }}>🆘</span>
          I Need Help — Call {profile?.emergencyContactName || 'Caregiver'}
        </button>
      </div>
    </div>
  );
}


