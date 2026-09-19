import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

const SLIDE_DURATION = 8000; // 8 seconds per memory

export default function MemoryTheaterPage() {
  const [memories, setMemories] = useState([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef(null);
  const progressRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('sahay_memories');
      if (raw) setMemories(JSON.parse(raw));
    } catch {}
  }, []);

  const speak = (text) => {
    if (!window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.85; u.pitch = 1.05; u.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.lang === 'en-IN') || voices.find(v => v.lang.startsWith('en'));
    if (preferred) u.voice = preferred;
    window.speechSynthesis.speak(u);
  };

  const goTo = (newIdx) => {
    clearInterval(timerRef.current);
    clearInterval(progressRef.current);
    window.speechSynthesis?.cancel();
    setIdx(newIdx);
    setProgress(0);
    startRef.current = Date.now();
  };

  useEffect(() => {
    if (!memories.length || !playing) return;
    const mem = memories[idx];
    let narration = mem.caption || '';
    if (mem.people) narration += `. ${mem.people}.`;
    if (mem.date) narration += ` This was in ${mem.date}.`;
    setTimeout(() => speak(narration), 800);

    startRef.current = Date.now();
    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      setProgress(Math.min(100, (elapsed / SLIDE_DURATION) * 100));
    }, 100);

    timerRef.current = setTimeout(() => {
      setIdx(prev => (prev + 1) % memories.length);
    }, SLIDE_DURATION);

    return () => { clearInterval(timerRef.current); clearInterval(progressRef.current); window.speechSynthesis?.cancel(); };
  }, [idx, memories, playing]);

  if (!memories.length) {
    return (
      <div style={{ minHeight: '100vh', background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', textAlign: 'center', padding: '2rem' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>🌅</div>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '2rem', marginBottom: '1rem', color: '#FCD34D' }}>No Memories Yet</h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '2rem' }}>Ask your caregiver to upload some photos first.</p>
        <Link to="/memories" className="btn btn--gold">Add Memories</Link>
      </div>
    );
  }

  const mem = memories[idx];

  return (
    <div style={{ minHeight: '100vh', background: '#000', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Background blur image */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url(${mem.src})`,
        backgroundSize: 'cover', backgroundPosition: 'center',
        filter: 'blur(40px) brightness(0.2) saturate(1.5)',
        transform: 'scale(1.1)',
      }} />

      {/* Top bar */}
      <div style={{ position: 'relative', zIndex: 10, padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to="/memories" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', textDecoration: 'none' }}>← Exit</Link>
        <div style={{ fontFamily: "'Playfair Display', serif", color: '#FCD34D', fontSize: '1.1rem', fontWeight: 600 }}>
          Your Memories
        </div>
        <button
          onClick={() => { setPlaying(p => !p); window.speechSynthesis?.cancel(); clearTimeout(timerRef.current); }}
          style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: 999, padding: '0.4rem 1rem', fontSize: '0.8rem', cursor: 'pointer' }}
        >
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
      </div>

      {/* Progress dots */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', gap: '4px', padding: '0 1.5rem', marginBottom: '0.5rem' }}>
        {memories.map((_, i) => (
          <div key={i} onClick={() => goTo(i)} style={{ flex: 1, height: 3, borderRadius: 2, cursor: 'pointer', background: i < idx ? '#FCD34D' : i === idx ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
            {i === idx && <div style={{ height: '100%', width: `${progress}%`, background: '#FCD34D', transition: 'width 0.1s linear', borderRadius: 2 }} />}
          </div>
        ))}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 10, padding: '1rem' }}>
        <div key={idx} style={{ animation: 'memory-fade 0.8s ease', width: '100%', maxWidth: 520, textAlign: 'center' }}>
          <img
            src={mem.src}
            alt={mem.caption}
            style={{
              width: '100%', maxHeight: '55vh', objectFit: 'contain',
              borderRadius: 20,
              boxShadow: '0 0 80px rgba(245,158,11,0.25), 0 20px 80px rgba(0,0,0,0.8)',
              marginBottom: '2rem',
            }}
          />
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(1.1rem,3vw,1.5rem)', color: '#FEF3C7', fontStyle: 'italic', marginBottom: '0.75rem', lineHeight: 1.6 }}>
            "{mem.caption}"
          </div>
          {mem.people && (
            <div style={{ color: 'rgba(254,243,199,0.65)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              👥 {mem.people}
            </div>
          )}
          {mem.date && (
            <div style={{ color: 'rgba(254,243,199,0.45)', fontSize: '0.8rem' }}>
              📅 {mem.date}
            </div>
          )}
        </div>
      </div>

      {/* Bottom navigation */}
      <div style={{ position: 'relative', zIndex: 10, padding: '1rem 2rem 2rem', display: 'flex', justifyContent: 'center', gap: '1.5rem' }}>
        <button onClick={() => goTo((idx - 1 + memories.length) % memories.length)}
          style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: 999, width: 52, height: 52, fontSize: '1.2rem', cursor: 'pointer' }}>←</button>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', alignSelf: 'center' }}>{idx + 1} / {memories.length}</span>
        <button onClick={() => goTo((idx + 1) % memories.length)}
          style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: 999, width: 52, height: 52, fontSize: '1.2rem', cursor: 'pointer' }}>→</button>
      </div>

      <style>{`
        @keyframes memory-fade {
          from { opacity: 0; transform: scale(0.97) translateY(10px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
