import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { API_BASE, DEMO_CAREGIVER_ID } from '../App';
import { Send, Mic, MicOff } from 'lucide-react';

const EXAMPLES = [
  { hi: 'वो मुझे पहचान नहीं रही आज', en: "She doesn't recognise me today" },
  { hi: 'वो बार-बार एक ही बात पूछती है', en: 'She keeps asking the same question' },
  { hi: 'रात में बहुत बेचैन रहती है', en: 'She is very restless at night' },
  { hi: 'मैं बहुत थक गई हूँ', en: 'I am very exhausted' },
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
  const color = score <= 3 ? 'rgba(74,222,128,0.8)' : score <= 6 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
        <span style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Wellbeing</span>
        <span style={{ color }}>{score}/10</span>
      </div>
      <div style={{ height: 2, background: 'rgba(255,255,255,0.08)', borderRadius: 1, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width 0.6s' }} />
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    setMsgs(p => [...p, { id: Date.now(), role: 'user', content: text }]);
    setInput('');
    setLoading(true);
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
      setMsgs(p => [...p, { id: Date.now() + 1, role: 'ai', content: 'मुझे खेद है, अभी कनेक्शन में दिक्कत है। ARDSI: 1800-200-ARDSI' }]);
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

  return (
    <div className="font-ui" style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 52px - 110px)' }}>

      {/* Header */}
      <div style={{ marginBottom: 20, flexShrink: 0 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(99,102,241,0.8)', marginBottom: 8, fontWeight: 600 }}>
          03 / Caregiver Chat
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="font-display" style={{ fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontWeight: 400, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
              Talk to Sahay
            </h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Hindi · Bengali · English — your private care space</p>
          </div>
          {/* Orchestrate toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Step Fn</span>
            <div
              onClick={() => setOrchestrate(!orchestrate)}
              style={{
                width: 36, height: 20, borderRadius: 10,
                background: orchestrate ? '#6366f1' : 'rgba(255,255,255,0.1)',
                position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 2, left: orchestrate ? 18 : 2,
                width: 16, height: 16, borderRadius: 8, background: '#fff',
                transition: 'left 0.2s',
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12,
        padding: '16px 0', marginBottom: 16,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        {msgs.map(m => (
          <div
            key={m.id}
            style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}
          >
            <div style={{ maxWidth: '78%' }}>
              <div
                style={{
                  padding: '12px 16px',
                  fontSize: 14, lineHeight: 1.6,
                  color: 'rgba(255,255,255,0.85)',
                  whiteSpace: 'pre-wrap',
                  ...(m.role === 'user'
                    ? { background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '12px 12px 3px 12px' }
                    : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '12px 12px 12px 3px' }
                  ),
                }}
              >
                {m.content}
              </div>
              {m.distressScore !== undefined && m.role === 'ai' && (
                <div style={{ maxWidth: 220, paddingLeft: 4 }}>
                  <DistressBar score={m.distressScore} />
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex' }}>
            <div style={{
              padding: '12px 16px', fontSize: 14, color: 'rgba(255,255,255,0.4)',
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '12px 12px 12px 3px',
            }}>
              Sahay is thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, flexShrink: 0 }}>
        {EXAMPLES.map(q => (
          <button
            key={q.hi}
            onClick={() => send(q.hi)}
            title={q.en}
            style={{
              fontSize: 12, color: 'rgba(255,255,255,0.55)',
              border: '1px solid rgba(255,255,255,0.1)',
              padding: '5px 12px', background: 'transparent', cursor: 'pointer',
              fontFamily: 'Manrope, sans-serif',
              transition: 'border-color 0.2s, color 0.2s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(99,102,241,0.4)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.55)'; }}
          >
            {q.hi}
          </button>
        ))}
      </div>

      {/* Composer */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexShrink: 0 }}>
        <button
          onClick={recording ? stopRec : startRec}
          style={{
            width: 44, height: 44, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: recording ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${recording ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.12)'}`,
            color: recording ? '#ef4444' : 'rgba(255,255,255,0.5)',
            cursor: 'pointer', transition: 'all 0.2s',
          }}
        >
          {recording ? <MicOff size={16} strokeWidth={1.5} /> : <Mic size={16} strokeWidth={1.5} />}
        </button>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="अपना सवाल यहाँ लिखें… (Type in Hindi or English)"
          className="input-field"
          style={{ flex: 1, resize: 'none', minHeight: 44, maxHeight: 120, lineHeight: 1.5 }}
          rows={1}
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          style={{
            width: 44, height: 44, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: input.trim() && !loading ? '#6366f1' : 'rgba(255,255,255,0.04)',
            border: '1px solid transparent',
            color: '#fff', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
            transition: 'background 0.2s',
          }}
        >
          <Send size={16} strokeWidth={1.8} />
        </button>
      </div>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 10, textAlign: 'center' }}>
        Sahay is not a doctor · For emergencies call 112 · ARDSI: 1800-200-ARDSI
      </p>
    </div>
  );
}
