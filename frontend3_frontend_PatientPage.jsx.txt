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

  const name = profile?.patientName || "—";

  const orbClass = "zen__orb" + (
    alertSent ? " zen__orb--alert"
    : isSpeaking ? " zen__orb--speaking"
    : status === "listening" ? " zen__orb--listening"
    : ""
  );

  const statusText =
    status === "listening" ? "Listening" :
    status === "transcribing" ? "Understanding…" :
    status === "thinking" ? "Thinking…" :
    status === "speaking" ? "Speaking" :
    status === "starting" ? "Starting…" :
    status === "error" ? "Allow microphone access" : "";

  const statusCls = "zen__status" + (
    status === "listening" ? " zen__status--active" :
    status === "speaking" ? " zen__status--speaking" : ""
  );

  return (
    <div className="zen">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"1.25rem 1.5rem", flexShrink:0 }}>
        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"0.65rem", letterSpacing:"0.15em", textTransform:"uppercase", color:"rgba(237,232,227,0.2)" }}>SAHAY</div>
        <div style={{ display:"flex", gap:"0.5rem", alignItems:"center" }}>
          {DEEPGRAM_KEY
            ? <span className="badge badge--mint">◉ Deepgram Live</span>
            : <span className="badge badge--signal">⚡ Groq Fallback</span>
          }
          {aiMode === "ai" && <span className="badge badge--muted">AI</span>}
        </div>
      </div>
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"1rem", gap:"1.5rem" }}>
        <div className="zen__date">
          {time.toLocaleDateString([], { weekday:"long", month:"long", day:"numeric" })}
        </div>
        <div className="zen__name">{name}</div>
        <div className="zen__clock">
          {time.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}
        </div>
        <div className={orbClass} />
        <div className={statusCls}>{statusText}</div>
        {lastHeard && status !== "listening" && (
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"0.7rem", color:"rgba(237,232,227,0.25)", letterSpacing:"0.04em" }}>
            "{lastHeard}"
          </div>
        )}
        {isSpeaking && lastSpoken && (
          <div className="zen__bubble">"{lastSpoken}"</div>
        )}
        {alertSent && (
          <span className="badge badge--mint" style={{ fontSize:"0.75rem", padding:"0.4rem 1rem" }}>
            ✓ {profile?.emergencyContactName || "Caregiver"} alerted — on their way
          </span>
        )}
        {showMap && profile?.homeAddress && (
          <div className="zen__map">
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"0.65rem", letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--mint)", marginBottom:"0.75rem" }}>
              ◈ Route to Safe Destination
            </div>
            <div style={{ fontSize:"0.8rem", color:"rgba(237,232,227,0.4)", marginBottom:"0.75rem" }}>{profile.homeAddress}</div>
            <iframe width="100%" height="160" frameBorder="0"
              style={{ border:0, borderRadius:10, marginBottom:"0.75rem", display:"block", opacity:0.9 }}
              src={`https://maps.google.com/maps?q=${encodeURIComponent(profile.homeAddress)}&output=embed`}
              allowFullScreen />
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(profile.homeAddress)}${currentLocation ? `&origin=${currentLocation.lat},${currentLocation.lng}` : ""}`}
              target="_blank" rel="noreferrer"
              style={{ display:"block", textAlign:"center", padding:"0.75rem", background:"rgba(0,229,181,0.1)", border:"1px solid rgba(0,229,181,0.25)", borderRadius:10, color:"var(--mint)", fontSize:"0.85rem", fontFamily:"'Syne',sans-serif", fontWeight:700, letterSpacing:"0.04em", textDecoration:"none" }}>
              ▶ Open Turn-by-Turn Directions
            </a>
          </div>
        )}
        <div style={{ textAlign:"center" }}>
          {['"What is my name?"','"Show me the route"','"I am lost"','"I need help"'].map(h => (
            <span key={h} className="zen__hint">{h}</span>
          ))}
        </div>
        {(() => {
          try {
            const mems = JSON.parse(localStorage.getItem("sahay_memories") || "[]");
            if (mems.length > 0) return (
              <a href="/memories/theater" style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"0.7rem", color:"rgba(237,232,227,0.25)", letterSpacing:"0.1em", textTransform:"uppercase", textDecoration:"none" }}>
                ❐ Watch Memories
              </a>
            );
          } catch {}
          return null;
        })()}
        {conversationLog.length > 0 && (
          <div className="zen__log">
            {conversationLog.slice(-4).map((entry, i) => (
              <div key={i} className={`zen__msg zen__msg--${entry.who === "patient" ? "patient" : "ai"}`}>
                <div className="zen__msg__bubble">
                  <span className="zen__msg__who">{entry.who === "patient" ? "You" : "Sahay"}</span>
                  {entry.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ padding:"1rem 1.5rem 2.5rem", display:"flex", justifyContent:"center", flexShrink:0 }}>
        <button onClick={handleManualPanic} className="zen__panic">
          <span style={{ fontSize:"1.4rem" }}>🆘</span>
          I Need Help — Call {profile?.emergencyContactName || "Caregiver"}
        </button>
      </div>
    </div>
  );
}


