import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight, Volume2 } from 'lucide-react';

interface Memory { id: string; url: string; caption: string; date: string; }

export default function MemoryTheaterPage() {
  const [mems, setMems] = useState<Memory[]>([]);
  const [idx, setIdx] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [visible, setVisible] = useState(true); // for fade transition

  useEffect(() => {
    try { setMems(JSON.parse(localStorage.getItem('sahay_memories') || '[]')); } catch {}
  }, []);

  // Auto-advance every 10s
  useEffect(() => {
    if (mems.length === 0) return;
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setIdx(i => (i + 1) % mems.length); setVisible(true); }, 400);
    }, 10000);
    return () => clearInterval(t);
  }, [mems]);

  // Narrate with TTS when slide changes
  useEffect(() => {
    if (!mems[idx]) return;
    const text = mems[idx].caption;
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(`This photo shows: ${text}. You are loved and safe.`);
    u.lang = 'en-IN'; u.rate = 0.75; u.pitch = 1.05; u.volume = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find(v => v.lang.startsWith('en-IN')) || voices.find(v => v.lang.startsWith('en'));
    if (v) u.voice = v;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
    return () => { window.speechSynthesis.cancel(); setSpeaking(false); };
  }, [idx, mems]);

  const goTo = (i: number) => {
    setVisible(false);
    setTimeout(() => { setIdx(i); setVisible(true); }, 300);
  };

  if (mems.length === 0) {
    return (
      <div style={{
        minHeight: '100vh', background: '#000',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Manrope, sans-serif', gap: 20,
      }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.28)' }}>No memories added yet</div>
        <Link
          to="/memories"
          className="btn btn-ghost"
          style={{ fontSize: 13 }}
        >
          Add Memories →
        </Link>
      </div>
    );
  }

  const mem = mems[idx];

  return (
    <div style={{
      minHeight: '100vh', background: '#000',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Manrope, sans-serif',
      position: 'relative', overflow: 'hidden',
    }}>

      {/* Ambient glow behind photo */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 40%, rgba(124,111,250,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} aria-hidden="true" />

      {/* Close button */}
      <Link
        to="/memories"
        aria-label="Close theater"
        style={{
          position: 'absolute', top: 20, right: 20, zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 9999,
          background: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(8px)',
          color: 'rgba(255,255,255,0.55)',
          fontSize: 12, fontWeight: 600, textDecoration: 'none',
          border: '1px solid rgba(255,255,255,0.12)',
          transition: 'background 0.2s, color 0.2s',
        }}
      >
        <X size={13} strokeWidth={2} /> Close
      </Link>

      {/* Speaking indicator */}
      {speaking && (
        <div style={{
          position: 'absolute', top: 20, left: 20, zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 9999,
          background: 'rgba(124,111,250,0.15)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(124,111,250,0.25)',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'rgba(155,143,252,0.9)',
        }}>
          <Volume2 size={12} strokeWidth={2} style={{ animation: 'blinkDot 1s ease-in-out infinite' }} />
          Narrating
        </div>
      )}

      {/* Photo */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '72px 32px 20px', position: 'relative' }}>
        <img
          key={mem.id}
          src={mem.url}
          alt={mem.caption}
          style={{
            maxHeight: '62vh', maxWidth: '88vw',
            objectFit: 'contain',
            borderRadius: 12,
            boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 0 60px rgba(124,111,250,0.1)',
            opacity: visible ? 1 : 0,
            transform: visible ? 'scale(1)' : 'scale(0.98)',
            transition: 'opacity 0.4s ease, transform 0.4s ease',
            animation: visible ? 'kenBurns 10s ease-in-out both' : 'none',
          }}
        />
      </div>

      {/* Caption and controls */}
      <div style={{ padding: '20px 20px 36px', textAlign: 'center' }}>

        {/* Caption */}
        <div
          className="font-display"
          style={{
            fontSize: 'clamp(1.1rem, 3.5vw, 1.8rem)',
            fontStyle: 'italic',
            fontWeight: 300,
            color: 'rgba(240,240,248,0.8)',
            lineHeight: 1.55,
            maxWidth: 560,
            margin: '0 auto 8px',
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.4s ease',
          }}
        >
          "{mem.caption}"
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 24 }}>
          {mem.date}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <button
            onClick={() => goTo((idx - 1 + mems.length) % mems.length)}
            aria-label="Previous memory"
            style={{ color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9999, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.18s' }}
          >
            <ChevronLeft size={20} strokeWidth={1.8} />
          </button>

          {/* Dots */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {mems.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                aria-label={`Go to memory ${i + 1}`}
                aria-current={i === idx}
                style={{
                  width: i === idx ? 22 : 6, height: 6, borderRadius: 3,
                  background: i === idx ? '#fff' : 'rgba(255,255,255,0.2)',
                  border: 'none', cursor: 'pointer',
                  transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
                  padding: 0,
                }}
              />
            ))}
          </div>

          <button
            onClick={() => goTo((idx + 1) % mems.length)}
            aria-label="Next memory"
            style={{ color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9999, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.18s' }}
          >
            <ChevronRight size={20} strokeWidth={1.8} />
          </button>
        </div>

        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.14)', marginTop: 20 }}>
          You are loved and safe. 💙
        </p>
      </div>
    </div>
  );
}
