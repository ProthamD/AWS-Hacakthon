import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface Memory { id: string; url: string; caption: string; date: string; }

export default function MemoryTheaterPage() {
  const [mems, setMems] = useState<Memory[]>([]);
  const [idx, setIdx] = useState(0);
  const [caption, setCaption] = useState('');

  useEffect(() => {
    try { setMems(JSON.parse(localStorage.getItem('sahay_memories') || '[]')); } catch {}
  }, []);

  // Auto-advance every 8s
  useEffect(() => {
    if (mems.length === 0) return;
    const t = setInterval(() => setIdx(i => (i + 1) % mems.length), 8000);
    return () => clearInterval(t);
  }, [mems]);

  // Narrate caption with TTS
  useEffect(() => {
    if (!mems[idx]) return;
    const text = mems[idx].caption;
    setCaption(text);
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(`This photo shows: ${text}. You are loved and safe.`);
    u.lang = 'en-IN'; u.rate = 0.78; u.pitch = 1.05; u.volume = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find(v => v.lang.startsWith('en-IN')) || voices.find(v => v.lang.startsWith('en'));
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
    return () => { window.speechSynthesis.cancel(); };
  }, [idx, mems]);

  if (mems.length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'Manrope, sans-serif' }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginBottom: 24 }}>No memories added yet</div>
        <Link to="/memories" style={{ fontSize: 12, color: 'rgba(99,102,241,0.8)', textDecoration: 'none', border: '1px solid rgba(99,102,241,0.3)', padding: '8px 16px' }}>
          Add Memories →
        </Link>
      </div>
    );
  }

  const mem = mems[idx];

  return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', flexDirection: 'column', fontFamily: 'Manrope, sans-serif', position: 'relative', overflow: 'hidden' }}>

      {/* Close */}
      <Link
        to="/memories"
        style={{ position: 'absolute', top: 20, right: 20, zIndex: 10, color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, textDecoration: 'none' }}
      >
        <X size={14} strokeWidth={1.5} /> Close
      </Link>

      {/* Image */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 20px 0' }}>
        <img
          key={mem.id}
          src={mem.url}
          alt={mem.caption}
          style={{ maxHeight: '60vh', maxWidth: '90vw', objectFit: 'contain', animation: 'fadeIn 1s ease both' }}
        />
      </div>

      {/* Caption */}
      <div style={{ padding: '32px 20px', textAlign: 'center' }}>
        <div
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 'clamp(1.1rem, 3vw, 1.7rem)',
            fontStyle: 'italic', fontWeight: 400,
            color: 'rgba(255,255,255,0.7)',
            lineHeight: 1.55, maxWidth: 520, margin: '0 auto 12px',
          }}
        >
          "{caption}"
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 24 }}>
          {mem.date}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <button
            onClick={() => setIdx(i => (i - 1 + mems.length) % mems.length)}
            style={{ color: 'rgba(255,255,255,0.4)', background: 'none', cursor: 'pointer', display: 'flex' }}
          >
            <ChevronLeft size={20} strokeWidth={1.5} />
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            {mems.map((_, i) => (
              <div
                key={i}
                onClick={() => setIdx(i)}
                style={{ width: i === idx ? 20 : 5, height: 5, borderRadius: 3, background: i === idx ? '#fff' : 'rgba(255,255,255,0.2)', cursor: 'pointer', transition: 'all 0.3s' }}
              />
            ))}
          </div>
          <button
            onClick={() => setIdx(i => (i + 1) % mems.length)}
            style={{ color: 'rgba(255,255,255,0.4)', background: 'none', cursor: 'pointer', display: 'flex' }}
          >
            <ChevronRight size={20} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
