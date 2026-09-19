import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { API_BASE, DEMO_CAREGIVER_ID } from '../App';
import { Send, Mic, MicOff, Settings2 } from 'lucide-react';

const EXAMPLES = [
  { hi: 'वो मुझे पहचान नहीं रही', en: "She doesn't recognise me today" },
  { hi: 'बार-बार एक ही बात पूछती है', en: 'She keeps repeating the same question' },
  { hi: 'रात में बहुत बेचैन रहती है', en: 'Very restless at night' },
  { hi: 'मैं बहुत थक गई हूँ', en: 'I am exhausted' },
];

interface Msg {
  id: number;
  role: 'user' | 'ai';
  content: string;
  audioUrl?: string;
  distressScore?: number;
}

function DistressBar({ score }: { score: number }) {
  const pct = (score / 10) * 100;
  const color = score <= 3 ? 'var(--c-calm)' : score <= 6 ? 'var(--c-amber)' : 'var(--c-red)';
  const label = score <= 3 ? 'Low stress' : score <= 6 ? 'Moderate' : 'High stress';
  return (
    <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid var(--c-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-text-3)', fontWeight: 700 }}>Wellbeing</span>
        <span style={{ fontSize: 11, color, fontWeight: 700 }}>{label} · {score}/10</span>
      </div>
      <div className="distress-bar-track">
        <div
          className="distress-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function SahayAvatar() {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginTop: 2,
      background: 'linear-gradient(135deg, #7c6ffa 0%, #9b8ffc 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 2px 8px rgba(124,111,250,0.35)',
    }} aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" strokeOpacity="0.4" />
      </svg>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <SahayAvatar />
      <div className="bubble-ai" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 5 }}>
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [msgs, setMsgs] = useState<Msg[]>([{
    id: 1, role: 'ai',
    content: 'नमस्ते। मैं Sahay हूँ — आपका AI सहायक।\n\nHello! I am Sahay, your AI companion. What would you like to talk about today?',
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [orchestrate, setOrchestrate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    setMsgs(p => [...p, { id: Date.now(), role: 'user', content: text }]);
    setInput('');
    setLoading(true);
    // Reset textarea height
    if (textareaRef.current) { textareaRef.current.style.height = '44px'; }
    try {
      const ep = orchestrate ? `${API_BASE}/chat/orchestrate` : `${API_BASE}/chat`;
      const { data } = await axios.post(ep, { caregiverId: DEMO_CAREGIVER_ID, message: text, synthesizeAudio: true });
      setMsgs(p => [...p, {
        id: Date.now() + 1, role: 'ai',
        content: data.response || data.assistantResponse || 'I am here for you.',
        audioUrl: data.audioUrl,
        distressScore: data.distressScore,
      }]);
    } catch {
      setMsgs(p => [...p, { id: Date.now() + 1, role: 'ai', content: 'मुझे खेद है, अभी कनेक्शन में दिक्कत है।\n\nPlease try again. For urgent help: ARDSI 1800-200-ARDSI' }]);
    } finally { setLoading(false); }
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mr.onstop = () => { stream.getTracks().forEach(t => t.stop()); };
      mr.start();
      recRef.current = mr;
      setRecording(true);
    } catch {}
  };
  const stopRec = () => { recRef.current?.stop(); setRecording(false); };

  const autoGrow = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = '44px';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  return (
    <div className="font-ui" style={{
      maxWidth: 720, margin: '0 auto', padding: '28px 20px',
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 54px - 108px)',
    }}>

      {/* Header */}
      <div style={{ marginBottom: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="section-label" style={{ marginBottom: 6 }}>03 / Caregiver Chat</div>
            <h1 className="font-display" style={{ fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontWeight: 300, color: 'var(--c-text-1)', letterSpacing: '-0.8px', lineHeight: 1.1 }}>
              Talk to Sahay
            </h1>
            <p style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 5 }}>Hindi · English · your private care space</p>
          </div>
          {/* Settings toggle */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="btn-icon"
              onClick={() => setShowSettings(s => !s)}
              aria-label="Toggle settings"
              aria-expanded={showSettings}
              style={{ borderColor: showSettings ? 'var(--c-accent)' : undefined }}
            >
              <Settings2 size={16} strokeWidth={1.6} />
            </button>
          </div>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="glass-card" style={{ marginTop: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text-1)' }}>Step Functions Mode</div>
              <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 2 }}>Uses multi-agent orchestration (slower, more thorough)</div>
            </div>
            <div
              className={`toggle-track ${orchestrate ? 'on' : ''}`}
              onClick={() => setOrchestrate(!orchestrate)}
              role="switch"
              aria-checked={orchestrate}
              aria-label="Toggle Step Functions mode"
              tabIndex={0}
              onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') setOrchestrate(!orchestrate); }}
            >
              <span className="toggle-thumb" />
            </div>
          </div>
        )}
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14,
        padding: '16px 0', marginBottom: 14,
        borderTop: '1px solid var(--c-border)',
        borderBottom: '1px solid var(--c-border)',
      }}>
        {msgs.map(m => (
          <div key={m.id} style={{ display: 'flex', gap: 10, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-start' }}>
            {m.role === 'ai' && <SahayAvatar />}
            <div style={{ maxWidth: '80%' }}>
              <div
                className={m.role === 'user' ? 'bubble-user' : 'bubble-ai'}
                style={{ padding: '12px 16px', fontSize: 14, lineHeight: 1.65, color: 'var(--c-text-1)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              >
                {m.content}
              </div>
              {m.distressScore !== undefined && m.role === 'ai' && (
                <div style={{ maxWidth: 260, paddingLeft: 4 }}>
                  <DistressBar score={m.distressScore} />
                </div>
              )}
              {m.audioUrl && m.role === 'ai' && (
                <audio src={m.audioUrl} controls style={{ marginTop: 8, width: '100%', height: 32, borderRadius: 4, opacity: 0.8 }} />
              )}
            </div>
          </div>
        ))}

        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexShrink: 0, overflowX: 'auto', paddingBottom: 2 }}>
        {EXAMPLES.map(q => (
          <button
            key={q.hi}
            onClick={() => send(q.hi)}
            title={q.en}
            className="prompt-chip"
            style={{ flexShrink: 0 }}
          >
            {q.hi}
          </button>
        ))}
      </div>

      {/* Composer */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
        {/* Mic */}
        <button
          onClick={recording ? stopRec : startRec}
          className="btn-icon"
          aria-label={recording ? 'Stop recording' : 'Start voice recording'}
          style={{
            background: recording ? 'rgba(248,113,113,0.12)' : undefined,
            borderColor: recording ? 'rgba(248,113,113,0.4)' : undefined,
            color: recording ? 'var(--c-red)' : undefined,
            animation: recording ? 'blinkDot 1.4s step-end infinite' : 'none',
            flexShrink: 0, alignSelf: 'flex-end',
          }}
        >
          {recording ? <MicOff size={16} strokeWidth={1.6} /> : <Mic size={16} strokeWidth={1.6} />}
        </button>

        {/* Input */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={autoGrow}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
          }}
          placeholder="अपना सवाल यहाँ लिखें… (Hindi or English)"
          className="input-field"
          style={{ flex: 1, resize: 'none', minHeight: 44, maxHeight: 120, lineHeight: 1.55, overflowY: 'auto' }}
          rows={1}
          aria-label="Message input"
        />

        {/* Send */}
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          aria-label="Send message"
          className="btn-icon"
          style={{
            background: input.trim() && !loading ? 'var(--c-accent)' : undefined,
            borderColor: input.trim() && !loading ? 'transparent' : undefined,
            color: input.trim() && !loading ? '#fff' : undefined,
            cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
            opacity: loading ? 0.5 : 1,
            flexShrink: 0, alignSelf: 'flex-end',
            boxShadow: input.trim() && !loading ? '0 2px 12px rgba(124,111,250,0.35)' : 'none',
          }}
        >
          <Send size={16} strokeWidth={1.8} />
        </button>
      </div>

      <p style={{ fontSize: 11, color: 'var(--c-text-4)', marginTop: 8, textAlign: 'center', lineHeight: 1.5 }}>
        Sahay is not a doctor · Emergencies: 112 · ARDSI: 1800-200-ARDSI
      </p>
    </div>
  );
}
