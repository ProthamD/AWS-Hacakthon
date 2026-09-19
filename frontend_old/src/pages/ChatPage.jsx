import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { API_BASE, DEMO_CAREGIVER_ID } from '../App';
import { useToast } from '../components/Toast';

const EXAMPLE_QUESTIONS = [
  { hi: 'वो मुझे पहचान नहीं रही आज', en: "She doesn't recognize me today" },
  { hi: 'वो बार-बार एक ही बात पूछती है', en: 'She keeps asking the same question' },
  { hi: 'रात में बहुत बेचैन रहती है', en: 'She is very restless at night' },
  { hi: 'मैं बहुत थक गई हूँ', en: 'I am very exhausted' },
];

function DistressMeter({ score }) {
  const pct = (score / 10) * 100;
  const color = score <= 3 ? 'var(--color-safe)'
    : score <= 6 ? 'var(--color-warning)'
    : 'var(--color-danger)';
  return (
    <div className="distress-meter">
      <div className="flex justify-between text-xs text-muted">
        <span>Wellbeing</span>
        <span style={{ color }}>{score}/10</span>
      </div>
      <div className="distress-bar">
        <div className="distress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function ChatBubble({ msg }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);

  const playAudio = () => {
    if (!msg.audioUrl) return;
    if (audioRef.current) {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  return (
    <div>
      <div className={`chat-bubble chat-bubble--${msg.role}${playing ? ' playing' : ''}`}>
        {msg.content}
        {msg.audioUrl && (
          <>
            <audio ref={audioRef} src={msg.audioUrl} onEnded={() => setPlaying(false)} />
            <button
              onClick={playAudio}
              style={{
                display: 'block', marginTop: '0.5rem',
                background: 'none', color: 'var(--color-primary-light)',
                fontSize: '0.8rem', padding: 0,
              }}
            >
              {playing ? '⏸ Playing...' : '▶ Play Audio'}
            </button>
          </>
        )}
      </div>
      {msg.distressScore !== undefined && msg.role === 'ai' && (
        <div style={{ maxWidth: 220, marginTop: '0.5rem' }}>
          <DistressMeter score={msg.distressScore} />
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  const toast = useToast();
  const [messages, setMessages] = useState([
    {
      id: 1, role: 'ai',
      content: 'नमस्ते। मैं Sahay हूँ — आपका AI सहायक। आज आप किस बारे में बात करना चाहते हैं?\n\n(Hello! I am Sahay, your AI companion. What would you like to talk about today?)',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [useOrchestrate, setUseOrchestrate] = useState(false); // toggle between single/multi-agent
  const chatEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;
    const userMsg = { id: Date.now(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const endpoint = useOrchestrate ? `${API_BASE}/chat/orchestrate` : `${API_BASE}/chat`;
      const { data } = await axios.post(endpoint, {
        caregiverId: DEMO_CAREGIVER_ID,
        message: text,
        synthesizeAudio: true,
      });

      // Handle both single-agent (response) and Step Functions (response from nested obj) output
      const responseText = data.response || data.assistantResponse || 'I am here for you.';
      const audioUrl = data.audioUrl || null;
      const distressScore = data.distressScore ?? undefined;
      const agentType = data.agentType;

      const aiMsg = {
        id: Date.now() + 1,
        role: 'ai',
        content: responseText,
        audioUrl,
        distressScore,
        escalated: data.escalated,
        agentType,
      };
      setMessages(prev => [...prev, aiMsg]);

      if (data.escalated) {
        toast('🚨 Emergency alert sent to your emergency contact!', 'error', 8000);
      }
    } catch (err) {
      const fallback = 'मुझे खेद है, अभी कनेक्शन में दिक्कत है। ARDSI हेल्पलाइन: 1800-200-ARDSI।';
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', content: fallback }]);
      toast('Connection error — using fallback response', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        // For demo: use Web Speech API for transcription
        // In production: send to Amazon Transcribe via API
        toast('Voice recorded! (Demo: type your message — Transcribe integration needs AWS)', 'info', 5000);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch {
      toast('Microphone access denied', 'error');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  return (
    <div className="page chat-page" style={{ maxWidth: 800 }}>
      <div className="chat-page__heading flex justify-between items-center mb-2" style={{ marginBottom: '1rem' }}>
        <div>
          <div className="section-label section-label--signal" style={{ marginBottom: '0.4rem' }}>Your private care space</div>
          <h1 style={{ fontSize: '1.7rem', fontWeight: 700 }}>Talk to Sahay</h1>
          <p className="text-sm text-muted">Your AI caregiver companion</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="text-xs text-muted">Multi-agent</span>
          <button
            id="orchestrate-toggle"
            onClick={() => setUseOrchestrate(!useOrchestrate)}
            style={{
              width: 40, height: 22, borderRadius: 11,
              background: useOrchestrate ? 'var(--color-primary)' : 'var(--color-surface-3)',
              position: 'relative', transition: 'background 0.2s',
            }}
            title="Toggle Step Functions multi-agent orchestration"
          >
            <span style={{
              position: 'absolute', top: 2, left: useOrchestrate ? 20 : 2,
              width: 18, height: 18, borderRadius: 9, background: 'white',
              transition: 'left 0.2s',
            }} />
          </button>
          {useOrchestrate && <span className="badge badge--info text-xs">Step Functions</span>}
        </div>
      </div>

      {/* Chat window */}
      <div className="card chat-panel" style={{ minHeight: 300, marginBottom: '1rem', position: 'relative' }}>
        <div className="chat-panel__bar">
          <span className="chat-panel__avatar" aria-hidden="true">S</span>
          <div><strong>Sahay</strong><span>Here to listen, in Hindi or English</span></div>
          <span className="chat-panel__status"><i /> Available now</span>
        </div>
        <div className="chat-container" style={{ minHeight: 245, overflowY: 'auto', maxHeight: '40vh', paddingBottom: '0.5rem' }}>
          {messages.map(m => <ChatBubble key={m.id} msg={m} />)}
          {loading && (
            <div className="chat-bubble chat-bubble--ai" style={{ display: 'flex', gap: 8 }}>
              <div className="spinner" style={{ width: 16, height: 16 }} />
              <span className="text-muted">Sahay is thinking...</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Quick examples */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        {EXAMPLE_QUESTIONS.map(q => (
          <button
            key={q.hi}
            className="btn btn--secondary"
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
            onClick={() => sendMessage(q.hi)}
            title={q.en}
          >
            {q.hi}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div className="card chat-composer" style={{ padding: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
          {/* Voice button */}
          <button
            id="voice-record-btn"
            className={`record-btn${recording ? ' record-btn--recording' : ''}`}
            style={{ width: 52, height: 52, fontSize: '1.4rem', flexShrink: 0 }}
            onClick={recording ? stopRecording : startRecording}
            title={recording ? 'Stop recording' : 'Start voice input'}
          >
            {recording ? '⏹' : '🎙️'}
          </button>

          {/* Text input */}
          <textarea
            id="chat-input"
            className="form-textarea"
            placeholder="अपना सवाल यहाँ लिखें... (Type or use the mic)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ minHeight: 52, maxHeight: 120, resize: 'none', flex: 1 }}
          />

          {/* Send button */}
          <button
            id="send-btn"
            className="btn btn--primary"
            style={{ padding: '0.75rem 1.25rem', flexShrink: 0, alignSelf: 'flex-end' }}
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
          >
            Send
          </button>
        </div>

        <div className="text-xs text-muted mt-1" style={{ marginTop: '0.5rem' }}>
          Press Enter to send · Shift+Enter for new line · Sahay is not a doctor — call 112 for emergencies
        </div>
      </div>
    </div>
  );
}
