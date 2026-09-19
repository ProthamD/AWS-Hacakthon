/**
 * PatientPage v3
 *
 * Speech pipeline:
 *  1. Deepgram Nova-3 WebSocket (real-time, 250ms chunks, endpointing=800ms)
 *     - Only fires handleSpeech() when IS_FINAL=true AND transcript ≥ 4 chars
 *     - "Name" wake-word filter: ignores background chat unless the patient speaks ≥ 14s
 *  2. Groq Whisper fallback (14s rolling chunks) if Deepgram unavailable
 *  3. POST /patient/voice → Llama 3.3 for response + distress score
 *  4. SpeechSynthesis for output
 *  5. 20s rolling buffer for panic audio upload
 */

import { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../App';

/* ── Config ─────────────────────────────────────────── */
const DEEPGRAM_KEY = import.meta.env.VITE_DEEPGRAM_KEY || '';
const CHUNK_MS = 14000;           // Groq fallback: 14s chunks (was 7s)
const BUFFER_SECS = 20;
const SILENCE_RMS = 4;            // lower = more sensitive
const MAX_RETRIES = 2;

// Phrases that definitely mean the patient is talking TO Sahay
const WAKE_PHRASES = [
  'sahay', 'sehaj', 'sahaj',      // Deepgram mishears of "sahay"
  'what is my name', 'who am i', 'i am lost', "i'm lost",
  'where am i', 'help', 'scared', 'afraid',
  'show me', 'route', 'where should i go',
  'who are you', 'what are you',
];

function isDirectedAtSahay(t: string) {
  const lower = t.toLowerCase();
  return WAKE_PHRASES.some(p => lower.includes(p));
}

/* ── Helpers ─────────────────────────────────────────── */
async function fetchRetry(url: string, opts: RequestInit, retries = MAX_RETRIES) {
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    try {
      const r = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(timer);
      return r;
    } catch (e) {
      clearTimeout(timer);
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
}

function localFallback(t: string, profile: any) {
  const lower = t.toLowerCase();
  const name = profile?.patientName || 'dear';
  const contact = profile?.emergencyContactName || 'your caregiver';
  if (lower.includes('what is my name') || lower.includes('who am i'))
    return { text: `Your name is ${name}.`, alert: false };
  if (lower.includes('route') || lower.includes('show me') || lower.includes('where should i go'))
    return { text: 'I am bringing up the map for you now.', alert: false, map: true };
  if (lower.includes('lost') || lower.includes('where am i'))
    return { text: `${name}, please stay where you are. I am alerting ${contact} right now. Help is on the way.`, alert: true, map: true };
  if (lower.includes('help') || lower.includes('scared') || lower.includes('afraid'))
    return { text: `${name}, you are safe. I am alerting ${contact} right now.`, alert: true };
  if (lower.includes('who are you') || lower.includes('what are you'))
    return { text: 'I am Sahay, your voice companion. I am always here to help you.', alert: false };
  if (lower.includes('sahay'))
    return { text: `I am here, ${name}. How can I help you?`, alert: false };
  return { text: `${name}, you are safe. I am here with you.`, alert: false };
}

/* ── Component ───────────────────────────────────────── */
interface Profile {
  patientName?: string;
  patientAge?: string;
  homeAddress?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}
interface ConvMsg { who: 'patient' | 'sahay'; text: string; }

type StatusType = 'starting' | 'listening' | 'thinking' | 'speaking' | 'error';

export default function PatientPage() {
  const [time, setTime] = useState(new Date());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<StatusType>('starting');
  const [lastHeard, setLastHeard] = useState('');
  const [lastSpoken, setLastSpoken] = useState('');
  const [alertSent, setAlertSent] = useState(false);
  const [log, setLog] = useState<ConvMsg[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);

  const profileRef = useRef<Profile | null>(null);
  const alertRef = useRef(false);
  const speakingRef = useRef(false);
  const speakEndRef = useRef(0);
  const processingRef = useRef(false);
  const sessionRef = useRef<any[]>([]);
  const bufferRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const loopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dgSocketRef = useRef<WebSocket | null>(null);
  const usingDGRef = useRef(false);

  useEffect(() => { profileRef.current = profile; }, [profile]);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load profile
  useEffect(() => {
    try {
      const raw = localStorage.getItem('sahay_patient_profile');
      if (raw) { const p = JSON.parse(raw); setProfile(p); profileRef.current = p; }
    } catch {}
  }, []);

  // Preload voices
  useEffect(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener('voiceschanged', () => {});
    }
  }, []);

  // Start mic
  useEffect(() => {
    startMic();
    return () => {
      if (loopRef.current) clearTimeout(loopRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      window.speechSynthesis?.cancel();
      if (dgSocketRef.current) dgSocketRef.current.close();
    };
  }, []);

  const getRMS = () => {
    if (!analyserRef.current) return 100;
    const d = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteTimeDomainData(d);
    let sum = 0;
    for (const v of d) sum += Math.abs(v - 128);
    return sum / d.length;
  };

  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyserRef.current = analyser;

      setStatus('listening');
      DEEPGRAM_KEY ? startDeepgram(stream) : scheduleChunk(stream);
    } catch {
      setStatus('error');
    }
  };

  // ── Deepgram WebSocket ─────────────────────────────
  const startDeepgram = (stream: MediaStream) => {
    usingDGRef.current = true;
    const url = [
      'wss://api.deepgram.com/v1/listen',
      '?model=nova-3',
      '&smart_format=true',
      '&sentiment=true',
      '&endpointing=800',          // 800ms silence = sentence done
      '&interim_results=false',    // only fire on final
      '&utterance_end_ms=1500',    // extra confirmation window
    ].join('');

    const socket = new WebSocket(url, ['token', DEEPGRAM_KEY]);
    dgSocketRef.current = socket;

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime });

    socket.onopen = () => { rec.start(250); };

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) {
        bufferRef.current.push(e.data);
        if (bufferRef.current.length > BUFFER_SECS * 4) bufferRef.current.shift();
        if (socket.readyState === WebSocket.OPEN) socket.send(e.data);
      }
    };

    socket.onmessage = (ev) => {
      const data = JSON.parse(ev.data);
      const alt = data?.channel?.alternatives?.[0];
      const transcript: string = alt?.transcript || '';
      if (!data.is_final || transcript.length < 4) return;
      const sentiment = alt?.sentiment || 'neutral';
      handleSpeech(transcript, sentiment);
    };

    socket.onclose = () => {
      console.warn('[Sahay] Deepgram closed → Groq fallback');
      usingDGRef.current = false;
      try { rec.stop(); } catch {}
      scheduleChunk(streamRef.current!);
    };

    socket.onerror = () => {
      console.warn('[Sahay] Deepgram error');
    };
  };

  // ── Groq Whisper fallback ──────────────────────────
  const scheduleChunk = (stream: MediaStream) => {
    if (!stream || usingDGRef.current) return;
    const chunks: Blob[] = [];
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime });

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
        bufferRef.current.push(e.data);
        if (bufferRef.current.length > BUFFER_SECS / (CHUNK_MS / 1000)) bufferRef.current.shift();
      }
    };

    rec.onstop = async () => {
      if (!chunks.length || usingDGRef.current) { scheduleChunk(stream); return; }
      const msSince = Date.now() - speakEndRef.current;
      if (speakingRef.current || msSince < 2000) { scheduleChunk(stream); return; }
      if (getRMS() < SILENCE_RMS) { scheduleChunk(stream); return; }
      if (processingRef.current) { scheduleChunk(stream); return; }

      processingRef.current = true;
      const blob = new Blob(chunks, { type: mime });
      const b64 = await new Promise<string>(res => {
        const r = new FileReader();
        r.onloadend = () => res((r.result as string).split(',')[1]);
        r.readAsDataURL(blob);
      });

      setStatus('thinking');
      let transcript = '';
      try {
        const resp = await fetchRetry(`${API_BASE}/patient/transcribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioBase64: b64, mimeType: mime }),
        });
        if (resp?.ok) transcript = (await resp.json()).transcript || '';
      } catch {}

      if (transcript.length > 2) await handleSpeech(transcript, 'neutral');
      else setStatus('listening');
      processingRef.current = false;
      if (!usingDGRef.current) scheduleChunk(stream);
    };

    rec.start();
    loopRef.current = setTimeout(() => { try { rec.stop(); } catch {} }, CHUNK_MS);
  };

  // ── Main speech handler ────────────────────────────
  const handleSpeech = async (transcript: string, sentiment: string) => {
    const msSince = Date.now() - speakEndRef.current;
    if (speakingRef.current || msSince < 2000) return;
    // Filter: only respond if transcript is clearly directed at Sahay
    if (!isDirectedAtSahay(transcript)) return;
    if (processingRef.current && usingDGRef.current) return;
    processingRef.current = true;

    setLastHeard(transcript);
    setLog(prev => [...prev.slice(-7), { who: 'patient', text: transcript }]);
    setStatus('thinking');

    let responseText = '';
    let shouldAlert = false;

    try {
      const res = await fetchRetry(`${API_BASE}/patient/voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript, sentiment,
          patientProfile: profileRef.current || {},
          sessionHistory: sessionRef.current.slice(-6),
        }),
      });
      if (res?.ok) {
        const data = await res.json();
        const distress = data.distressScore || data.distress_score || 1;
        const intent = data.intent || 'other';
        const KEY = ['name_query', 'destination_query', 'lost', 'scared', 'distress', 'greeting'];
        const lowStakes = distress <= 2 && !KEY.includes(intent);
        if (intent === 'ignore' && lowStakes) {
          setStatus('listening');
          processingRef.current = false;
          return;
        }
        responseText = data.response || '';
        shouldAlert = data.shouldAlertCaregiver && distress >= 7;
        const needMap = intent === 'destination_query' || intent === 'lost'
          || transcript.toLowerCase().includes('route')
          || transcript.toLowerCase().includes('show me');
        setShowMap(needMap);
        if (needMap && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(p => setGps({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { enableHighAccuracy: true });
        } else if (!needMap) setShowMap(false);
        sessionRef.current.push({ role: 'user', content: transcript });
        if (data.assistantMessage) sessionRef.current.push(data.assistantMessage);
      }
    } catch {}

    if (!responseText) {
      const fb = localFallback(transcript, profileRef.current);
      responseText = fb.text;
      shouldAlert = fb.alert;
      if ((fb as any).map) {
        setShowMap(true);
        if (navigator.geolocation)
          navigator.geolocation.getCurrentPosition(p => setGps({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { enableHighAccuracy: true });
      }
    }

    setLog(prev => [...prev.slice(-7), { who: 'sahay', text: responseText }]);
    if (shouldAlert && !alertRef.current) {
      alertRef.current = true;
      setAlertSent(true);
      uploadPanic(transcript);
    }
    await speak(responseText);
    setStatus('listening');
    processingRef.current = false;
  };

  // ── Speak ──────────────────────────────────────────
  const speak = (text: string) => new Promise<void>(resolve => {
    if (!window.speechSynthesis) { resolve(); return; }
    window.speechSynthesis.cancel();
    speakingRef.current = true;
    setSpeaking(true);
    setLastSpoken(text);
    setStatus('speaking');
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-IN';
    utter.rate = 0.82;
    utter.pitch = 1.05;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en'))
      || voices.find(v => v.lang.startsWith('en-IN'))
      || voices.find(v => v.lang.startsWith('en'));
    if (v) utter.voice = v;
    const done = () => {
      speakingRef.current = false;
      speakEndRef.current = Date.now();
      setSpeaking(false);
      resolve();
    };
    utter.onend = done;
    utter.onerror = done;
    window.speechSynthesis.speak(utter);
  });

  // ── Panic upload ────────────────────────────────────
  const uploadPanic = async (phrase: string) => {
    if (!bufferRef.current.length) return;
    const blob = new Blob(bufferRef.current, { type: 'audio/webm' });
    const r = new FileReader();
    r.onloadend = async () => {
      try {
        await fetch(`${API_BASE}/distress/audio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientId: profileRef.current?.patientName || 'unknown',
            audioBase64: (r.result as string).split(',')[1],
            detectedPhrase: phrase,
            patientProfile: {
              name: profileRef.current?.patientName,
              emergencyContactName: profileRef.current?.emergencyContactName,
              emergencyContactPhone: profileRef.current?.emergencyContactPhone,
            },
          }),
        });
      } catch {}
    };
    r.readAsDataURL(blob);
  };

  const handlePanic = async () => {
    const p = profileRef.current || {};
    const msg = `${p.patientName || 'Dear'}, you are safe. I am alerting ${p.emergencyContactName || 'your caregiver'} right now. Please stay where you are.`;
    if (!alertRef.current) { alertRef.current = true; setAlertSent(true); uploadPanic('manual'); }
    await speak(msg);
  };

  /* ── Render ──────────────────────────────────────── */
  const name = profile?.patientName || '—';

  const orbGradient =
    alertSent ? 'radial-gradient(circle, rgba(248,113,113,0.7) 0%, rgba(248,113,113,0.15) 70%)'
    : speaking ? 'radial-gradient(circle, rgba(245,158,11,0.7) 0%, rgba(245,158,11,0.15) 70%)'
    : 'radial-gradient(circle, rgba(124,111,250,0.6) 0%, rgba(124,111,250,0.12) 70%)';

  const orbBorder =
    alertSent ? 'rgba(248,113,113,0.5)'
    : speaking ? 'rgba(245,158,11,0.5)'
    : 'rgba(124,111,250,0.45)';

  const orbClass =
    alertSent ? 'orb-alert'
    : speaking ? 'orb-speak'
    : 'orb-idle';

  const statusLabel =
    status === 'listening' ? 'Listening'
    : status === 'thinking' ? 'Thinking…'
    : status === 'speaking' ? 'Speaking'
    : status === 'starting' ? 'Starting…'
    : status === 'error' ? 'Allow microphone access' : '';

  const statusColor =
    status === 'listening' ? 'rgba(124,111,250,0.8)'
    : status === 'thinking' ? 'rgba(155,143,252,0.9)'
    : status === 'speaking' ? '#f59e0b'
    : status === 'error' ? '#f87171'
    : 'rgba(255,255,255,0.2)';

  const statusDot =
    status === 'listening' ? '#4ade80'
    : status === 'thinking' ? '#7c6ffa'
    : status === 'speaking' ? '#f59e0b'
    : status === 'error' ? '#f87171'
    : 'rgba(255,255,255,0.2)';

  return (
    <div
      className="font-ui"
      style={{
        minHeight: '100vh', width: '100%',
        background: 'radial-gradient(ellipse at 50% 30%, rgba(124,111,250,0.07) 0%, #050508 60%)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* ── Top bar ─────────────────────────────── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 20px', flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <span style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.15)', fontFamily: 'Manrope', fontWeight: 700 }}>
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
            color: '#ede8e3',
            textAlign: 'center',
          }}
        >
          {name}
        </div>

        {/* Clock */}
        <div
          className="font-display"
          style={{ fontSize: 'clamp(1.4rem, 4vw, 2.2rem)', fontWeight: 300, color: 'rgba(237,232,227,0.3)', letterSpacing: '0.05em' }}
        >
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>


        {/* Orb — layered rings */}
        <div style={{ position: 'relative', width: 104, height: 104, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: -18, borderRadius: '50%', border: '1px solid rgba(124,111,250,0.1)' }} />
          <div style={{ position: 'absolute', inset: -7, borderRadius: '50%', border: '1px solid rgba(124,111,250,0.18)' }} />
          <div
            className={orbClass}
            style={{
              width: 92, height: 92, borderRadius: '50%',
              background: orbGradient,
              border: `1.5px solid ${orbBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: `1px solid ${orbBorder}` }} />
          </div>
        </div>

        {/* Status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusDot, display: 'inline-block', animation: 'blinkDot 1.4s step-end infinite' }} />
          <span style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: statusColor, fontWeight: 700 }}>{statusLabel}</span>
        </div>

        {/* Last heard */}
        {lastHeard && status !== 'listening' && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic', maxWidth: 340, textAlign: 'center' }}>
            "{lastHeard}"
          </div>
        )}

        {/* Sahay reply bubble */}
        {speaking && lastSpoken && (
          <div
            className="font-display"
            style={{
              fontSize: 'clamp(1rem, 2vw, 1.25rem)',
              fontStyle: 'italic',
              color: 'rgba(237,232,227,0.65)',
              textAlign: 'center',
              maxWidth: 400,
              lineHeight: 1.55,
              padding: '16px 20px',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.025)',
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
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(profile.homeAddress)}${gps ? `&origin=${gps.lat},${gps.lng}` : ''}`}
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

        {/* Hint chips */}
        <div style={{ textAlign: 'center', maxWidth: 380 }}>
          {['"What is my name?"', '"Show me the route"', '"I am lost"', '"I need help"'].map(h => (
            <span
              key={h}
              style={{
                display: 'inline-block',
                fontSize: 11, color: 'rgba(255,255,255,0.2)',
                border: '1px solid rgba(255,255,255,0.07)',
                padding: '3px 9px', margin: '3px',
                letterSpacing: '0.03em',
              }}
            >
              {h}
            </span>
          ))}
        </div>

        {/* Conversation log */}
        {log.length > 0 && (
          <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {log.slice(-5).map((entry, i) => (
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
                    color: 'rgba(255,255,255,0.75)',
                    ...(entry.who === 'patient'
                      ? {
                          background: 'rgba(99,102,241,0.1)',
                          border: '1px solid rgba(99,102,241,0.2)',
                          borderRadius: '12px 12px 3px 12px',
                        }
                      : {
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '12px 12px 12px 3px',
                        }
                    ),
                  }}
                >
                  <div style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>
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
          onClick={handlePanic}
          style={{
            width: '100%', maxWidth: 400,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
            padding: '18px 24px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#fff',
            fontSize: 15, fontWeight: 600,
            letterSpacing: '0.02em',
            cursor: 'pointer',
            fontFamily: 'Manrope, sans-serif',
            transition: 'background 0.2s, border-color 0.2s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.16)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)'; }}
        >
          <span style={{ fontSize: 22 }}>🆘</span>
          I Need Help — Call {profile?.emergencyContactName || 'Caregiver'}
        </button>
      </div>
    </div>
  );
}
