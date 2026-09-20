/**
 * PatientPage — Sahay Voice Companion for Alzheimer's patients
 *
 * Voice pipeline:
 *   MODE A: Deepgram Nova-2 always-on WebSocket (filtered by wake phrases)
 *   MODE B: Push-to-Talk (PTT) button → Groq Whisper → NO wake-gate (always responds)
 *
 * Audio storage rule:
 *   ONLY the 20-second rolling buffer around a distress event is uploaded to cloud.
 *   Continuous audio is NEVER sent to cloud.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../App';

/* ─── Config ─────────────────────────────────────────── */
// NOTE: DEEPGRAM_KEY is fetched from backend at runtime (not baked into bundle)
const GOOGLE_MAPS_KEY        = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';
const BUFFER_SECS            = 20;
const MAX_RETRIES            = 2;
const ALERT_TTL_MS           = 30 * 60 * 1000;  // 30 minutes client-side guard
const PROCESSING_TIMEOUT_MS  = 15_000;           // reset processingRef after 15s max

const MIME = (typeof MediaRecorder !== 'undefined' &&
  MediaRecorder.isTypeSupported('audio/webm;codecs=opus'))
  ? 'audio/webm;codecs=opus'
  : 'audio/webm';

/* ─── Wake / distress phrases ────────────────────────── */
const WAKE_PHRASES = [
  'sahay','sehaj','sahaj','sahai','shaay',
  'what is my name','who am i',"i don't know who i am",
  "i can't remember",'i forgot',"i don't remember",
  "what's happening",'what is happening',"i don't understand",
  'where are we','what day is it','what year is it',
  'where is my home','i want to go home','take me home',
  'i am lost',"i'm lost",'where am i','i do not know where',
  'show me the route','show me the way','where should i go',
  'which way','which direction','i missed my stop',
  'help me','i need help','help',
  'scared','i am scared',"i'm scared",'i am afraid',"i'm afraid",
  'frightened','worried','anxious','panic','something is wrong',
  "i don't feel safe",'i feel lost','i feel confused',
  'everything is confusing','nothing makes sense',
  'who are you','what are you','do i know you',
  'who is that','where is','where did everyone go',
  'where is my family','where is my son','where is my daughter',
  'where is my husband','where is my wife',
  'i fell','i am falling','i cannot get up','call someone',
  'call my son','call my daughter','call my family',
  'i am not feeling well','i feel sick','something hurts',
];

const HIGH_DISTRESS = [
  'help','i fell','cannot get up','i am scared',"i'm scared",
  'i feel sick','something hurts','call my','i am in pain',
  'cannot breathe','chest hurts','i am dying',
];

function isWakePhrase(t: string): boolean {
  const lower = t.toLowerCase().trim();
  if (lower.startsWith('sahay') || lower.includes('hey sahay')) return true;
  if (WAKE_PHRASES.some(p => lower.includes(p))) return true;
  const words = lower.split(' ').filter(Boolean).length;
  const isQ = lower.endsWith('?') || lower.startsWith('who') ||
    lower.startsWith('where') || lower.startsWith('what') ||
    lower.startsWith('when') || lower.startsWith('how do i');
  return isQ && words <= 7;
}

function isHighDistress(t: string): boolean {
  return HIGH_DISTRESS.some(p => t.toLowerCase().includes(p));
}

/* ─── Network helper ─────────────────────────────────── */
async function fetchRetry(
  url: string,
  opts: RequestInit,
  retries = MAX_RETRIES,
): Promise<Response | undefined> {
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const r = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(timer);
      return r;
    } catch (e) {
      clearTimeout(timer);
      if (i === retries) throw e;
      await new Promise(r2 => setTimeout(r2, 600 * (i + 1)));
    }
  }
}

/* ─── Local fallback responses ───────────────────────── */
interface Profile {
  patientName?: string;
  patientAge?: string;
  homeAddress?: string;
  homeLat?: string;
  homeLng?: string;
  caregiverEmail?: string;
  scheduledDestination?: string;
  destinationLat?: string;
  destinationLng?: string;
  destinationPriority?: 'normal' | 'high';
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  dementiaStage?: string;
  dailyRoutine?: string;
  keyRelationships?: string;
  likesAndDislikes?: string;
}

function localFallback(t: string, profile: Profile | null) {
  const lower   = t.toLowerCase();
  const name    = profile?.patientName || 'dear';
  const contact = profile?.emergencyContactName || 'your caregiver';
  if (lower.includes('what is my name') || lower.includes('who am i'))
    return { text: `Your name is ${name}. You are completely safe.`, alert: false };
  if (lower.includes('route') || lower.includes('show me') ||
      lower.includes('where should i go') || lower.includes('where am i going'))
    return { text: 'I am bringing up the map to your home right now.', alert: false, map: true };
  if (lower.includes('lost') || lower.includes('where am i'))
    return { text: `${name}, please stay exactly where you are. I am alerting ${contact} now. Help is coming.`, alert: true, map: true };
  if (lower.includes('help') || lower.includes('scared') || lower.includes('afraid'))
    return { text: `${name}, you are safe. I am right here with you. I am alerting ${contact} now.`, alert: true };
  if (lower.includes('who are you') || lower.includes('what are you'))
    return { text: 'I am Sahay, your voice companion. I am always here to help you.', alert: false };
  if (lower.includes('sahay'))
    return { text: `I am here, ${name}. How can I help you?`, alert: false };
  return { text: `${name}, you are safe. I am here with you. What do you need?`, alert: false };
}

function detectIntentClient(transcript: string): {
  needMap: boolean;
  isLost: boolean;
  isLocation: boolean;
} {
  const t = transcript.toLowerCase();
  const needMap = t.includes('route') || t.includes('show me the way') ||
    t.includes('where am i going') || t.includes('where do i need to go') ||
    t.includes('how do i get') || t.includes('directions') || t.includes('navigate');
  const isLost = t.includes('i am lost') || t.includes("i'm lost") ||
    t.includes('where am i') || t.includes('i am lost') || t.includes('i do not know where');
  const isLocation = t.includes('location') || t.includes('my location') ||
    t.includes('where am i') || t.includes('current location') ||
    t.includes('where is this') || t.includes('where are we');
  return { needMap, isLost, isLocation };
}


interface ConvMsg { who: 'patient' | 'sahay'; text: string; }
type StatusType = 'idle' | 'listening' | 'recording' | 'thinking' | 'speaking' | 'error';

/* ─── Component ──────────────────────────────────────── */
export default function PatientPage() {
  const navigate = useNavigate();

  const [time,       setTime]       = useState(new Date());
  const [profile,    setProfile]    = useState<Profile | null>(null);
  const [status,     setStatus]     = useState<StatusType>('idle');
  const [lastHeard,  setLastHeard]  = useState('');
  const [lastSpoken, setLastSpoken] = useState('');
  const [alertSent,  setAlertSent]  = useState(false);
  const [alertMsg,   setAlertMsg]   = useState('');   // suppressed message for UI
  const [log,        setLog]        = useState<ConvMsg[]>([]);
  const [speaking,   setSpeaking]   = useState(false);
  const [showMap,    setShowMap]    = useState(false);
  const [gps,        setGps]        = useState<{ lat: number; lng: number } | null>(null);
  const [mapDirectionsUrl, setMapDirectionsUrl] = useState<string | null>(null);
  const [mapDestLabel, setMapDestLabel] = useState<string>('');
  const [dgStatus,   setDgStatus]   = useState<'off'|'connecting'|'live'|'fallback'>('off');
  const [debugMsg,   setDebugMsg]   = useState('');
  const [pttActive,  setPttActive]  = useState(false);
  const [dgKey,      setDgKey]      = useState('');  // fetched from backend

  /* ─── Refs ───────────────────────────────────────── */
  const profileRef        = useRef<Profile | null>(null);
  const alertLastSentRef  = useRef(0);             // timestamp of last alert sent (30-min TTL)
  const speakingRef       = useRef(false);
  const speakEndRef       = useRef(0);
  const processingRef     = useRef(false);
  const processingTORef   = useRef<ReturnType<typeof setTimeout> | null>(null); // P99 timeout
  const sessionRef        = useRef<{ role: string; content: string }[]>([]);
  const mountedRef        = useRef(true);
  const streamRef         = useRef<MediaStream | null>(null);
  const audioCtxRef       = useRef<AudioContext | null>(null);
  const dgSocketRef       = useRef<WebSocket | null>(null);
  const dgRecRef          = useRef<MediaRecorder | null>(null);
  const usingDGRef        = useRef(false);
  const dgReconnectRef    = useRef(0);             // reconnect attempt counter
  const bufferRef         = useRef<Blob[]>([]);
  const bufferTsRef       = useRef<number[]>([]);
  const pttRecRef         = useRef<MediaRecorder | null>(null);
  const pttChunksRef      = useRef<Blob[]>([]);

  useEffect(() => { profileRef.current = profile; }, [profile]);

  /* clock */
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1_000);
    return () => clearInterval(t);
  }, []);

  /* load profile */
  useEffect(() => {
    try {
      const raw = localStorage.getItem('sahay_patient_profile');
      if (raw) { const p = JSON.parse(raw); setProfile(p); profileRef.current = p; }
    } catch { /* ignore */ }
  }, []);

  /* preload voices */
  useEffect(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {};
    }
  }, []);

  /* boot — fetch Deepgram key from backend, then init mic */
  useEffect(() => {
    mountedRef.current = true;
    // Fetch Deepgram key from backend (not from bundle env var)
    fetch(`${API_BASE}/patient/deepgram-token`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.key && mountedRef.current) setDgKey(d.key); })
      .catch(() => { /* non-fatal — will fall back to PTT mode */ })
      .finally(() => initMic());
    return () => {
      mountedRef.current = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioCtxRef.current?.close().catch(() => {});
      window.speechSynthesis?.cancel();
      if (processingTORef.current) clearTimeout(processingTORef.current);
      try { dgSocketRef.current?.close(); } catch { /* ok */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open Deepgram when key arrives (may come after mic init)
  useEffect(() => {
    if (dgKey && streamRef.current && dgStatus === 'off') {
      openDeepgram(streamRef.current, dgKey);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dgKey]);

  /* ── Init microphone ──────────────────────────────── */
  const initMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctx.createMediaStreamSource(stream); // keep ctx alive
      audioCtxRef.current = ctx;
      if (!mountedRef.current) return;
      setStatus('listening');
      // dgKey may not be fetched yet — useEffect above will open Deepgram once key arrives
      setDebugMsg(dgKey ? 'Deepgram connecting…' : 'Hold the 🎤 button to speak (Groq Whisper mode)');
      if (!dgKey) setDgStatus('fallback');
    } catch (err) {
      console.error('[Sahay] Mic error:', err);
      if (mountedRef.current) { setStatus('error'); setDebugMsg('Microphone access denied. Tap the orb to retry.'); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dgKey]);

  /* ── Deepgram always-on (with exponential backoff reconnect) ─── */
  const openDeepgram = useCallback((stream: MediaStream, key: string) => {
    if (!key) return;
    setDgStatus('connecting');
    const url = [
      'wss://api.deepgram.com/v1/listen',
      '?model=nova-2',
      '&smart_format=true',
      '&endpointing=700',
      '&interim_results=false',
      '&utterance_end_ms=1200',
      '&vad_events=true',
    ].join('');
    const socket = new WebSocket(url, ['token', key]);
    dgSocketRef.current = socket;
    const rec = new MediaRecorder(stream, { mimeType: MIME });
    dgRecRef.current = rec;

    socket.onopen = () => {
      console.log('[Sahay] Deepgram open');
      dgReconnectRef.current = 0; // reset backoff on success
      setDgStatus('live');
      usingDGRef.current = true;
      setDebugMsg('Deepgram live — say a wake phrase or hold 🎤 to speak freely');
      rec.start(250);
    };

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) {
        bufferRef.current.push(e.data);
        bufferTsRef.current.push(Date.now());
        while (bufferTsRef.current.length > BUFFER_SECS * 4) {
          bufferRef.current.shift(); bufferTsRef.current.shift();
        }
        if (socket.readyState === WebSocket.OPEN) socket.send(e.data);
      }
    };

    socket.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string);
        if (data.type === 'SpeechStarted') return;
        const alt = data?.channel?.alternatives?.[0];
        const transcript: string = alt?.transcript || '';
        if (!data.is_final || transcript.length < 3) return;
        setDebugMsg(`Heard (always-on): "${transcript.slice(0, 55)}"`);
        if (isWakePhrase(transcript) || isHighDistress(transcript)) {
          handleSpeech(transcript, alt?.sentiment || 'neutral', false);
        } else {
          setDebugMsg(`Not a wake phrase — hold 🎤 to speak freely`);
        }
      } catch { /* malformed */ }
    };

    socket.onclose = (evt) => {
      console.warn('[Sahay] Deepgram closed', evt.code);
      usingDGRef.current = false;
      setDgStatus('fallback');
      try { rec.stop(); } catch { /* ok */ }
      // Exponential backoff reconnect (max 30s)
      if (!mountedRef.current) return;
      const attempt = dgReconnectRef.current++;
      const delay = Math.min(1000 * Math.pow(2, attempt), 30_000);
      setDebugMsg(`Deepgram disconnected — reconnecting in ${Math.round(delay/1000)}s…`);
      setTimeout(() => {
        if (mountedRef.current && streamRef.current) openDeepgram(streamRef.current, key);
      }, delay);
    };

    socket.onerror = () => { /* onclose will fire with reconnect */ };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Push-to-Talk: start ────────────────────────── */
  const startPTT = useCallback(() => {
    if (!streamRef.current || speakingRef.current || processingRef.current) return;
    pttChunksRef.current = [];
    const rec = new MediaRecorder(streamRef.current, { mimeType: MIME });
    pttRecRef.current = rec;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) {
        pttChunksRef.current.push(e.data);
        bufferRef.current.push(e.data);
        bufferTsRef.current.push(Date.now());
        while (bufferTsRef.current.length > BUFFER_SECS * 4) {
          bufferRef.current.shift(); bufferTsRef.current.shift();
        }
      }
    };
    rec.start(100);
    setPttActive(true);
    setStatus('recording');
    setDebugMsg('Recording… release to send to Sahay');
  }, []);

  /* ── Push-to-Talk: stop ─────────────────────────── */
  const stopPTT = useCallback(async () => {
    setPttActive(false);
    const rec = pttRecRef.current;
    if (!rec || rec.state !== 'recording') {
      if (mountedRef.current) setStatus('listening');
      return;
    }
    await new Promise<void>(resolve => {
      rec.onstop = () => resolve();
      try { rec.stop(); } catch { resolve(); }
    });
    const chunks = pttChunksRef.current;
    if (!chunks.length) {
      setDebugMsg('No audio captured — try again');
      if (mountedRef.current) setStatus('listening');
      return;
    }
    setStatus('thinking');
    setDebugMsg('Transcribing your speech…');
    const blob = new Blob(chunks, { type: MIME });
    const b64 = await blobToBase64(blob);
    let transcript = '';
    try {
      const resp = await fetchRetry(`${API_BASE}/patient/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: b64, mimeType: MIME }),
      });
      if (resp?.ok) {
        const json = await resp.json();
        transcript = json.transcript || '';
        setDebugMsg(`You said: "${transcript.slice(0, 60)}"`);
      } else {
        setDebugMsg(`Transcribe HTTP ${resp?.status} — using local fallback`);
      }
    } catch (err) {
      setDebugMsg(`Transcribe error — using local fallback`);
      console.error('[Sahay] PTT transcribe:', err);
    }
    if (transcript.length > 1) {
      await handleSpeech(transcript, 'neutral', true /* skipWakeGate — PTT always responds */);
    } else {
      setDebugMsg("Couldn't hear that clearly. Try holding the button longer.");
      if (mountedRef.current) setStatus('listening');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Caregiver email alert (30-min client TTL guard) ─── */
  const sendCaregiverAlert = useCallback(async (
    transcript: string,
    distressScore: number,
    alertType: 'DISTRESS' | 'PANIC' | 'EMERGENCY' = 'DISTRESS',
  ) => {
    const now = Date.now();
    if (now - alertLastSentRef.current < ALERT_TTL_MS) {
      const minsLeft = Math.ceil((ALERT_TTL_MS - (now - alertLastSentRef.current)) / 60_000);
      setAlertMsg(`Caregiver was recently alerted — next alert in ${minsLeft} min`);
      return;
    }
    const p = profileRef.current;
    const email = p?.caregiverEmail || '';
    if (!email) { setAlertMsg('No caregiver email set — go to Setup'); return; }
    alertLastSentRef.current = now;
    setAlertSent(true);
    // Fire-and-forget with retry
    const send = async (attempt = 0): Promise<void> => {
      try {
        const res = await fetch(`${API_BASE}/patient/alert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caregiverId: p?.patientName || 'unknown',
            caregiverEmail: email,
            patientName: p?.patientName || 'Patient',
            message: transcript,
            alertType,
            distressScore,
          }),
        });
        if (res.ok) {
          const d = await res.json();
          if (d.suppressed) {
            const minsLeft = Math.ceil((d.nextAlertInSeconds || 1800) / 60);
            setAlertMsg(`Caregiver was already alerted — next alert in ${minsLeft} min`);
          } else {
            setAlertMsg(`✓ ${p?.emergencyContactName || 'Caregiver'} alerted by email`);
          }
        } else if (attempt < 2) {
          await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
          return send(attempt + 1);
        }
      } catch {
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
          return send(attempt + 1);
        }
        setAlertMsg('Alert delivery failed — please call caregiver directly');
      }
    };
    void send();
    void uploadDistressClip(transcript);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Core speech handler ─────────────────────────── */
  const handleSpeech = useCallback(async (
    transcript: string,
    sentiment: string,
    skipWakeGate: boolean,
  ) => {
    if (!mountedRef.current) return;
    const msSince = Date.now() - speakEndRef.current;
    if (speakingRef.current || msSince < 1_500) return;
    if (!skipWakeGate && !isWakePhrase(transcript) && !isHighDistress(transcript)) return;
    if (processingRef.current) return;
    processingRef.current = true;

    // P99 safety: auto-reset processingRef after PROCESSING_TIMEOUT_MS (prevents stuck state)
    if (processingTORef.current) clearTimeout(processingTORef.current);
    processingTORef.current = setTimeout(() => {
      processingRef.current = false;
      if (mountedRef.current) setStatus('listening');
      console.warn('[Sahay] processingRef auto-reset after timeout');
    }, PROCESSING_TIMEOUT_MS);

    setLastHeard(transcript);
    setLog(prev => [...prev.slice(-9), { who: 'patient', text: transcript }]);
    setStatus('thinking');

    // Immediate auto-alert on severe distress — no LLM wait
    if (isHighDistress(transcript)) {
      void sendCaregiverAlert(transcript, 9, 'EMERGENCY');
    }

    let responseText  = '';
    let shouldAlert   = false;
    let audioBase64: string | null = null;

    try {
      setDebugMsg('Asking Sahay AI…');

      // Get current GPS for smart map routing (non-blocking)
      let currentLocation: { lat: number; lng: number } | null = gps;
      if (!currentLocation) {
        try {
          currentLocation = await new Promise((res) => {
            navigator.geolocation?.getCurrentPosition(
              p => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
              () => res(null), { timeout: 3000 }
            );
          }) as { lat: number; lng: number } | null;
          if (currentLocation && mountedRef.current) setGps(currentLocation);
        } catch { /* non-fatal */ }
      }

      const res = await fetchRetry(`${API_BASE}/patient/voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          sentiment,
          patientProfile: profileRef.current || {},
          sessionHistory: sessionRef.current.slice(-6),
          currentLocation,   // GPS sent for Haversine map routing
        }),
      });
      if (res?.ok) {
        const data = await res.json();
        const distress = data.distressScore ?? data.distress_score ?? 1;
        const intent   = data.intent || 'other';
        audioBase64    = data.audioBase64 ?? null;
        setDebugMsg(`AI: intent=${intent} distress=${distress}${audioBase64 ? ' 🔊Polly' : ' 🔊TTS'}`);
        // In skipWakeGate (PTT) mode — never suppress, always speak
        if (!skipWakeGate && intent === 'ignore' && distress <= 2) {
          setDebugMsg('Background noise — no response needed');
          if (mountedRef.current) setStatus('listening');
          processingRef.current = false;
          return;
        }
        responseText = data.response || '';
        shouldAlert  = !!data.shouldAlertCaregiver && distress >= 7;

        // Smart map routing — use Lambda's resolved destination
        const mapRoute   = data.mapRoute;
        const clientIntent = detectIntentClient(transcript);
        const needMap = intent === 'destination_query' || intent === 'lost' ||
          clientIntent.needMap || clientIntent.isLost || clientIntent.isLocation;

        if (mountedRef.current && needMap) {
          setShowMap(true);
          // Use GPS from mapRoute mapsUrl or fall back to raw GPS
          if (mapRoute?.mapsUrl) {
            setMapDirectionsUrl(mapRoute.mapsUrl);
            setMapDestLabel(mapRoute.label || '');
          } else if (currentLocation) {
            setGps(currentLocation);
          }
          if (mapRoute?.label) {
            setDebugMsg(`Map: routing to ${mapRoute.label} (${mapRoute.reason})`);
          }
        }
        sessionRef.current.push({ role: 'user', content: transcript });
        if (data.assistantMessage) sessionRef.current.push(data.assistantMessage);
      } else {
        setDebugMsg(`API HTTP ${res?.status} — using offline fallback`);
      }
    } catch (err) {
      setDebugMsg(`API error — using offline fallback`);
      console.error('[Sahay] voice API:', err);
    }

    if (!responseText) {
      setDebugMsg('Using offline fallback');
      const fb = localFallback(transcript, profileRef.current);
      responseText = fb.text;
      shouldAlert  = !!fb.alert;
      const clientIntent = detectIntentClient(transcript);
      const fbNeedMap = !!(fb as { map?: boolean }).map || clientIntent.needMap || clientIntent.isLost || clientIntent.isLocation;
      if (fbNeedMap && mountedRef.current) {
        setShowMap(true);
        navigator.geolocation?.getCurrentPosition(
          p => setGps({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => {}, { enableHighAccuracy: true, timeout: 8000 },
        );
      }
    }

    if (mountedRef.current) setLog(prev => [...prev.slice(-9), { who: 'sahay', text: responseText }]);
    if (shouldAlert) {
      // Use the distress score from AI response for alert severity
      const score = (responseText.length > 0) ? 7 : 8; // conservative default
      void sendCaregiverAlert(transcript, score, 'DISTRESS');
    }

    setDebugMsg(`Saying: "${responseText.slice(0, 50)}…"`);
    if (processingTORef.current) clearTimeout(processingTORef.current);
    await speak(responseText, audioBase64);
    setDebugMsg('Listening again');
    if (mountedRef.current) setStatus('listening');
    processingRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendCaregiverAlert]);

  /* ── TTS — Polly mp3 preferred, browser TTS fallback ─── */
  const speak = useCallback((text: string, audioBase64?: string | null): Promise<void> => {
    return new Promise(resolve => {
      if (!text.trim()) { resolve(); return; }
      speakingRef.current = true;
      if (mountedRef.current) { setSpeaking(true); setLastSpoken(text); setStatus('speaking'); }

      const done = () => {
        speakingRef.current = false;
        speakEndRef.current = Date.now();
        if (mountedRef.current) setSpeaking(false);
        resolve();
      };

      // ── Option A: Play Polly mp3 audio from Lambda ──────────────
      if (audioBase64) {
        try {
          const binary = atob(audioBase64);
          const bytes  = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const blob   = new Blob([bytes], { type: 'audio/mpeg' });
          const url    = URL.createObjectURL(blob);
          const audio  = new window.Audio(url);
          audio.onended = () => { URL.revokeObjectURL(url); done(); };
          audio.onerror = () => { URL.revokeObjectURL(url); browserTTS(text, done); };
          audio.play().catch(() => browserTTS(text, done));
          setTimeout(done, 30_000);
          return;
        } catch {
          // fall through to browser TTS
        }
      }

      // ── Option B: Browser SpeechSynthesis (fallback) ────────────
      browserTTS(text, done);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const browserTTS = (text: string, done: () => void) => {
    if (!window.speechSynthesis) { done(); return; }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-IN'; utter.rate = 0.82; utter.pitch = 1.05;
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en'))
               ?? voices.find(v => v.lang.startsWith('en-IN'))
               ?? voices.find(v => v.lang.startsWith('en'));
    if (voice) utter.voice = voice;
    let alive: ReturnType<typeof setInterval>;
    const finish = () => { clearInterval(alive); done(); };
    utter.onend = finish; utter.onerror = finish;
    alive = setInterval(() => { if (window.speechSynthesis.paused) window.speechSynthesis.resume(); }, 4_000);
    window.speechSynthesis.speak(utter);
    setTimeout(finish, 30_000);
  };


  /* ── Panic button ────────────────────────────────── */
  const handlePanic = useCallback(async () => {
    const p = profileRef.current || {};
    const msg = `${p.patientName || 'Dear'}, you are safe. I am alerting ${p.emergencyContactName || 'your caregiver'} right now. Please stay where you are.`;
    void sendCaregiverAlert('Manual SOS panic button pressed', 10, 'PANIC');
    await speak(msg);
  }, [speak, sendCaregiverAlert]);

  /* ── Upload distress clip (20s buffer only) ────────── */
  const uploadDistressClip = useCallback(async (phrase: string) => {
    const now    = Date.now();
    const cutoff = now - BUFFER_SECS * 1_000;
    const recent = bufferRef.current.filter((_, i) => (bufferTsRef.current[i] ?? 0) >= cutoff);
    if (!recent.length) return;
    const blob = new Blob(recent, { type: 'audio/webm' });
    const b64  = await blobToBase64(blob).catch(() => '');
    if (!b64) return;
    try {
      await fetch(`${API_BASE}/distress/audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: profileRef.current?.patientName || 'unknown',
          audioBase64: b64,
          detectedPhrase: phrase,
          bufferDurationSecs: BUFFER_SECS,
          patientProfile: {
            name: profileRef.current?.patientName,
            emergencyContactName: profileRef.current?.emergencyContactName,
            emergencyContactPhone: profileRef.current?.emergencyContactPhone,
          },
        }),
      });
    } catch { /* non-critical */ }
  }, []);

  /* ── Helpers ─────────────────────────────────────── */
  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve((r.result as string).split(',')[1] ?? '');
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  /* ── Derived display ─────────────────────────────── */
  const name = profile?.patientName || '—';

  const STATUS_LABEL: Record<StatusType, string> = {
    idle: 'Tap mic to speak', listening: 'Listening…',
    recording: '● Recording', thinking: 'Thinking…',
    speaking: 'Speaking', error: 'Tap orb to retry',
  };
  const STATUS_COLOR: Record<StatusType, string> = {
    idle: 'rgba(255,255,255,0.28)', listening: '#4ade80',
    recording: '#f87171', thinking: '#818cf8',
    speaking: '#f59e0b', error: '#f87171',
  };
  const orbGrad = alertSent
    ? 'radial-gradient(circle at 38% 38%, #fca5a5, #dc2626)'
    : speaking ? 'radial-gradient(circle at 38% 38%, #fde68a, #f59e0b, #d97706)'
    : status === 'thinking' ? 'radial-gradient(circle at 38% 38%, #c4b5fd, #818cf8, #6366f1)'
    : pttActive ? 'radial-gradient(circle at 38% 38%, #fca5a5, #ef4444)'
    : 'radial-gradient(circle at 38% 38%, #6ee7b7, #06b6d4, #818cf8)';

  const orbAnim = alertSent || pttActive ? 'orbAlert 0.7s ease-in-out infinite'
    : speaking ? 'orbSpeak 1.6s ease-in-out infinite'
    : status === 'thinking' ? 'orbThink 1.0s ease-in-out infinite'
    : 'orbIdle 3.5s ease-in-out infinite';

  const dgColor = { off:'rgba(255,255,255,0.25)', connecting:'#fbbf24', live:'#4ade80', fallback:'#818cf8' }[dgStatus];
  const dgLabel = { off:'Off', connecting:'Connecting…', live:'Deepgram Live', fallback:'Groq Whisper' }[dgStatus];

  return (
    <div style={{
      minHeight: '100dvh', width: '100%',
      background: alertSent
        ? 'radial-gradient(ellipse at 50% 20%, rgba(239,68,68,0.18) 0%, #08080f 55%)'
        : pttActive ? 'radial-gradient(ellipse at 50% 25%, rgba(239,68,68,0.10) 0%, #08080f 55%)'
        : 'radial-gradient(ellipse at 50% 25%, rgba(99,102,241,0.10) 0%, #08080f 55%)',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Manrope','Noto Sans Devanagari',system-ui,sans-serif",
      color: '#fff', overflow: 'hidden', transition: 'background 1s',
    }}>

      {/* ── Top bar ─────────────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 18px', flexShrink:0, borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontSize:11, letterSpacing:'0.18em', textTransform:'uppercase', color:'rgba(255,255,255,0.28)', fontWeight:700 }}>SAHAY · सहाय</span>
        <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:9, letterSpacing:'0.08em', textTransform:'uppercase', background:`${dgColor}14`, border:`1px solid ${dgColor}44`, color:dgColor, padding:'3px 9px', borderRadius:9999, fontWeight:700 }}>
          <span style={{ width:5, height:5, borderRadius:'50%', background:dgColor, display:'inline-block', animation:'blinkDot 1.4s step-end infinite' }} />
          {dgLabel}
        </span>
      </div>

      {/* ── Scrollable body ──────────────────────────── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-start', padding:'18px 18px 0', gap:13, overflowY:'auto' }}>

        <div style={{ fontSize:10, letterSpacing:'0.16em', textTransform:'uppercase', color:'rgba(255,255,255,0.18)' }}>
          {time.toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })}
        </div>

        <div style={{ fontFamily:"'Fraunces',Georgia,serif", fontSize:'clamp(2.8rem,13vw,7rem)', fontWeight:400, letterSpacing:'-1.5px', lineHeight:0.95, color:'#fff', textAlign:'center' }}>
          {name}
        </div>

        <div style={{ fontFamily:"'Fraunces',Georgia,serif", fontSize:'clamp(1.1rem,3.5vw,1.8rem)', fontWeight:300, color:'rgba(255,255,255,0.32)', letterSpacing:'0.07em' }}>
          {time.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}
        </div>

        {/* Orb */}
        <div style={{ position:'relative', width:140, height:140, flexShrink:0 }}>
          <div style={{ position:'absolute', inset:-14, borderRadius:'50%', background:orbGrad, filter:'blur(30px)', opacity: pttActive ? 0.7 : alertSent ? 0.65 : speaking ? 0.5 : 0.22, animation:orbAnim, transition:'opacity 0.5s,background 0.6s' }} />
          <div
            onClick={status === 'error' ? () => initMic() : undefined}
            style={{ position:'absolute', inset:0, borderRadius:'50%', background:orbGrad, boxShadow:'0 0 0 3px rgba(255,255,255,0.07),0 8px 32px rgba(0,0,0,0.4)', animation:orbAnim, cursor: status === 'error' ? 'pointer' : 'default', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.6s' }}
          >
            {status === 'error' && <span style={{ fontSize:26 }}>🎤</span>}
            {pttActive && <span style={{ fontSize:22 }}>🔴</span>}
          </div>
        </div>

        {/* Status */}
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ width:7, height:7, borderRadius:'50%', background:STATUS_COLOR[status], display:'inline-block', animation:'blinkDot 1.4s step-end infinite', flexShrink:0 }} />
          <span style={{ fontSize:11, letterSpacing:'0.12em', textTransform:'uppercase', color:STATUS_COLOR[status], fontWeight:700 }}>{STATUS_LABEL[status]}</span>
        </div>

        {/* Debug line */}
        {debugMsg && (
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.22)', fontFamily:'monospace', maxWidth:380, textAlign:'center', padding:'2px 8px', background:'rgba(255,255,255,0.03)', borderRadius:5, border:'1px solid rgba(255,255,255,0.06)' }}>
            {debugMsg}
          </div>
        )}

        {/* Last heard */}
        {lastHeard && !pttActive && (
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.4)', fontStyle:'italic', maxWidth:360, textAlign:'center', lineHeight:1.5 }}>"{lastHeard}"</div>
        )}

        {/* Reply bubble */}
        {lastSpoken && (
          <div style={{ fontFamily:"'Fraunces',Georgia,serif", fontSize:'clamp(0.95rem,2vw,1.15rem)', fontStyle:'italic', color:'rgba(255,255,255,0.88)', textAlign:'center', maxWidth:400, lineHeight:1.65, padding:'14px 18px', border:'1px solid rgba(255,255,255,0.09)', background:'rgba(255,255,255,0.04)', borderRadius:14, backdropFilter:'blur(8px)' }}>
            "{lastSpoken}"
          </div>
        )}

        {/* Alert badge */}
        {alertSent && (
          <div style={{ fontSize:12, letterSpacing:'0.06em', fontWeight:600, color:'rgba(74,222,128,0.9)', border:'1px solid rgba(74,222,128,0.28)', background:'rgba(74,222,128,0.06)', padding:'7px 16px', borderRadius:8, textAlign:'center' }}>
            {alertMsg || `✓ ${profile?.emergencyContactName || 'Caregiver'} alerted — help is on the way`}
          </div>
        )}

        {/* Map — smart routing (OpenStreetMap embed — free, no API key needed) */}
        {showMap && (() => {
          const destAddr  = profile?.scheduledDestination || profile?.homeAddress || null;
          const destLabel = mapDestLabel || (profile?.scheduledDestination ? 'Scheduled Destination' : 'Home');
          // Prefer pinned coordinates from profile for the embed
          const destLat = profile?.destinationLat || profile?.homeLat || null;
          const destLng = profile?.destinationLng || profile?.homeLng || null;
          const mapLat  = destLat ? parseFloat(destLat) : gps?.lat ?? null;
          const mapLng  = destLng ? parseFloat(destLng) : gps?.lng ?? null;

          // OpenStreetMap embed — free, always works, no API key required
          const osmEmbedSrc = (mapLat && mapLng)
            ? `https://www.openstreetmap.org/export/embed.html?bbox=${(mapLng - 0.012).toFixed(6)},${(mapLat - 0.008).toFixed(6)},${(mapLng + 0.012).toFixed(6)},${(mapLat + 0.008).toFixed(6)}&layer=mapnik&marker=${mapLat.toFixed(6)},${mapLng.toFixed(6)}`
            : null;

          const directionsHref = mapDirectionsUrl || (destAddr
            ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destAddr)}${gps ? `&origin=${gps.lat},${gps.lng}` : ''}&travelmode=walking`
            : gps ? `https://www.google.com/maps?q=${gps.lat},${gps.lng}` : '#');

          return (
            <div style={{ width:'100%', maxWidth:380, border:'1px solid rgba(255,255,255,0.07)', background:'rgba(255,255,255,0.025)', padding:14, borderRadius:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <div style={{ fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(74,222,128,0.7)', fontWeight:700 }}>
                  ◈ Route to {destLabel}
                </div>
                {(mapLat && mapLng) && <div style={{ fontSize:10, color:'rgba(255,255,255,0.25)', fontFamily:'monospace' }}>
                  📍 {mapLat.toFixed(4)}, {mapLng.toFixed(4)}
                </div>}
              </div>

              {osmEmbedSrc ? (
                <iframe
                  width="100%" height="160" frameBorder="0"
                  style={{ border:0, display:'block', marginBottom:8, opacity:0.88, borderRadius:8 }}
                  src={osmEmbedSrc}
                  title={`Map: ${destLabel}`}
                  loading="lazy"
                />
              ) : (
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.4)', textAlign:'center', padding:'20px 0' }}>
                  📍 {destAddr || 'Destination not set'}
                  <br /><span style={{ fontSize:11, color:'rgba(255,255,255,0.25)' }}>Pin your home in Setup for map preview</span>
                </div>
              )}

              <a href={directionsHref} target="_blank" rel="noreferrer"
                style={{ display:'block', textAlign:'center', padding:'9px', background:'rgba(74,222,128,0.07)', border:'1px solid rgba(74,222,128,0.18)', color:'rgba(74,222,128,0.9)', fontSize:13, fontWeight:600, letterSpacing:'0.04em', textDecoration:'none', borderRadius:8 }}>
                ▶ Open turn-by-turn directions → {destLabel}
              </a>

              {!profile?.homeAddress && (
                <button onClick={() => navigate('/setup')}
                  style={{ display:'block', width:'100%', marginTop:8, textAlign:'center', padding:'7px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.09)', color:'rgba(255,255,255,0.4)', fontSize:11, cursor:'pointer', fontFamily:'inherit', borderRadius:6, letterSpacing:'0.05em' }}>
                  ⚙ Set home address in Setup
                </button>
              )}
            </div>
          );
        })()}

        {/* Hint chips */}
        <div style={{ maxWidth:400, display:'flex', flexWrap:'wrap', gap:6, justifyContent:'center', paddingBottom:8 }}>
          {['"What is my name?"','"Show me the route"','"I am lost"','"I need help"'].map(h => (
            <span key={h} style={{ display:'inline-block', fontSize:11, color:'rgba(255,255,255,0.28)', border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.02)', padding:'4px 10px', borderRadius:9999, letterSpacing:'0.03em' }}>{h}</span>
          ))}
          <button onClick={() => navigate('/memories/theater')} style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11, color:'rgba(165,180,252,0.85)', border:'1px solid rgba(129,140,248,0.22)', background:'rgba(99,102,241,0.07)', padding:'4px 10px', borderRadius:9999, cursor:'pointer', fontFamily:'inherit' }}>
            📖 My memories
          </button>
        </div>

        {/* Conversation log */}
        {log.length > 0 && (
          <div style={{ width:'100%', maxWidth:400, display:'flex', flexDirection:'column', gap:7, paddingBottom:4 }}>
            {log.slice(-6).map((entry, i) => (
              <div key={i} style={{ display:'flex', justifyContent: entry.who === 'patient' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth:'82%', padding:'8px 13px', fontSize:13, lineHeight:1.5, color:'rgba(255,255,255,0.82)',
                  ...(entry.who === 'patient'
                    ? { background:'rgba(99,102,241,0.11)', border:'1px solid rgba(99,102,241,0.18)', borderRadius:'12px 12px 3px 12px' }
                    : { background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.09)', borderRadius:'12px 12px 12px 3px' }),
                }}>
                  <div style={{ fontSize:9, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(255,255,255,0.22)', marginBottom:3, fontWeight:700 }}>{entry.who === 'patient' ? 'You' : 'Sahay'}</div>
                  {entry.text}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No-profile nudge */}
        {!profile && (
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.26)', textAlign:'center', maxWidth:290, lineHeight:1.6, border:'1px solid rgba(255,255,255,0.07)', background:'rgba(255,255,255,0.02)', padding:'11px 14px', borderRadius:10 }}>
            No profile yet.{' '}
            <button onClick={() => navigate('/setup')} style={{ background:'none', border:'none', color:'rgba(165,180,252,0.8)', cursor:'pointer', fontSize:12, textDecoration:'underline', fontFamily:'inherit' }}>Set up</button>
            {' '}for personalised responses.
          </div>
        )}
      </div>

      {/* ── Bottom controls ──────────────────────────── */}
      <div style={{ padding:'14px 18px 28px', display:'flex', flexDirection:'column', gap:10, flexShrink:0 }}>

        {/* Push-to-talk button */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
          <button
            id="ptt-button"
            onPointerDown={startPTT}
            onPointerUp={stopPTT}
            onPointerLeave={pttActive ? stopPTT : undefined}
            disabled={status === 'error' || speaking || status === 'thinking'}
            style={{
              width:80, height:80, borderRadius:'50%',
              background: pttActive ? 'rgba(239,68,68,0.28)' : 'rgba(255,255,255,0.05)',
              border: `2px solid ${pttActive ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.14)'}`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:28, cursor:'pointer', transition:'all 0.15s',
              boxShadow: pttActive ? '0 0 30px rgba(239,68,68,0.38)' : 'none',
              opacity: (status === 'thinking' || speaking) ? 0.35 : 1,
              userSelect:'none', WebkitUserSelect:'none',
            }}
            aria-label="Hold to speak"
          >
            {pttActive ? '🔴' : '🎤'}
          </button>
          <span style={{ fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(255,255,255,0.22)', fontWeight:600 }}>
            {pttActive ? 'Release to send' : 'Hold to speak'}
          </span>
        </div>

        {/* Panic / SOS */}
        <button
          id="panic-button"
          onClick={handlePanic}
          style={{
            width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:12,
            padding:'17px 20px',
            background: alertSent ? 'rgba(220,38,38,0.20)' : 'rgba(220,38,38,0.09)',
            border: `1px solid ${alertSent ? 'rgba(220,38,38,0.5)' : 'rgba(220,38,38,0.26)'}`,
            color:'#fff', fontSize:15, fontWeight:700, letterSpacing:'0.02em',
            cursor:'pointer', fontFamily:'inherit', borderRadius:14, transition:'all 0.2s',
            boxShadow: alertSent ? '0 0 20px rgba(220,38,38,0.22)' : 'none',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.20)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = alertSent ? 'rgba(220,38,38,0.20)' : 'rgba(220,38,38,0.09)'; }}
        >
          <span style={{ fontSize:22 }}>🆘</span>
          {alertSent ? 'Help Alerted — Stay Put' : `I Need Help — Call ${profile?.emergencyContactName || 'Caregiver'}`}
        </button>
      </div>

      <style>{`
        @keyframes orbIdle  { 0%,100%{transform:scale(1);opacity:.82} 50%{transform:scale(1.04);opacity:1} }
        @keyframes orbSpeak { 0%,100%{transform:scale(1);opacity:.9}  50%{transform:scale(1.09);opacity:1} }
        @keyframes orbThink { 0%,100%{transform:scale(.97);opacity:.78} 50%{transform:scale(1.03);opacity:1} }
        @keyframes orbAlert { 0%,100%{transform:scale(1);opacity:.85} 50%{transform:scale(1.12);opacity:1} }
        @keyframes blinkDot { 0%,100%{opacity:1} 50%{opacity:.15} }
      `}</style>
    </div>
  );
}
