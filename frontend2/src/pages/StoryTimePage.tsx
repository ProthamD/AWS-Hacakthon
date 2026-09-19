/**
 * StoryTimePage — Full-screen memory narration for Alzheimer's patients
 *
 * Flow:
 * 1. Loads memories from localStorage
 * 2. Fetches AI-generated story segments from /memories/narrate
 * 3. Shows photos one at a time with warm narration text
 * 4. Speaks narration aloud via SpeechSynthesis
 * 5. Auto-advances slides every 10–12s
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X, Volume2, VolumeX } from 'lucide-react';
import { API_BASE } from '../App';

interface Memory { id: string; url: string; caption: string; date: string; }
interface StorySegment { memoryId: string; narration: string; }

const SLIDE_DURATION_MS = 12000;

function speakText(text: string, onEnd?: () => void) {
  if (!window.speechSynthesis) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 0.82;
  utt.pitch = 1.05;
  utt.volume = 1;
  // Prefer a warm female voice
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => v.lang.startsWith('en') && /female|samantha|karen|susan|victoria|fiona/i.test(v.name))
    || voices.find(v => v.lang.startsWith('en'));
  if (preferred) utt.voice = preferred;
  utt.onend = () => onEnd?.();
  utt.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utt);
}

export default function StoryTimePage() {
  const navigate = useNavigate();
  const [memories] = useState<Memory[]>(() => {
    try { return JSON.parse(localStorage.getItem('sahay_memories') || '[]'); } catch { return []; }
  });
  const [segments, setSegments] = useState<StorySegment[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutedRef = useRef(false);
  mutedRef.current = muted;

  // Patient name from profile
  const patientName = (() => {
    try { return JSON.parse(localStorage.getItem('sahay_profile') || '{}').patientName || 'you'; } catch { return 'you'; }
  })();

  // Fetch AI narration
  useEffect(() => {
    if (!memories.length) { setLoading(false); return; }
    async function fetchStory() {
      try {
        const res = await fetch(`${API_BASE}/memories/narrate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientName,
            memories: memories.map(m => ({ id: m.id, caption: m.caption, date: m.date })),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setSegments(data.segments || []);
        }
      } catch {
        // Fallback: use captions as narration
        setSegments(memories.map(m => ({ memoryId: m.id, narration: m.caption })));
      } finally {
        setLoading(false);
      }
    }
    fetchStory();
  }, []);

  const getNarration = useCallback((idx: number) => {
    const mem = memories[idx];
    if (!mem) return '';
    const seg = segments.find(s => s.memoryId === mem.id);
    return seg?.narration || mem.caption;
  }, [memories, segments]);

  const goTo = useCallback((idx: number) => {
    if (transitioning) return;
    setTransitioning(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    window.speechSynthesis?.cancel();
    setTimeout(() => {
      setCurrentIdx(idx);
      setTransitioning(false);
    }, 500);
  }, [transitioning]);

  const advance = useCallback(() => {
    const next = (currentIdx + 1) % memories.length;
    goTo(next);
  }, [currentIdx, memories.length, goTo]);

  // Auto-advance
  useEffect(() => {
    if (loading || !memories.length || transitioning) return;
    const narration = getNarration(currentIdx);
    if (!mutedRef.current && narration) {
      speakText(narration, () => {
        timerRef.current = setTimeout(advance, 2000);
      });
    } else {
      timerRef.current = setTimeout(advance, SLIDE_DURATION_MS);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentIdx, loading, transitioning]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--c-bg)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 20,
      }}>
        <div style={{ fontSize: 32 }}>✨</div>
        <p className="font-display" style={{ fontSize: 22, color: 'var(--c-text-2)', fontStyle: 'italic' }}>
          Weaving your stories together…
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2].map(i => (
            <span key={i} className="typing-dot" style={{ animationDelay: `${i * 0.18}s` }} />
          ))}
        </div>
      </div>
    );
  }

  if (!memories.length) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--c-bg)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 20, textAlign: 'center', padding: 40,
      }}>
        <div style={{ fontSize: 48 }}>📷</div>
        <h2 className="font-display" style={{ fontSize: 28, color: 'var(--c-text-1)', fontWeight: 300 }}>
          No memories yet
        </h2>
        <p style={{ color: 'var(--c-text-2)', maxWidth: 340, lineHeight: 1.65 }}>
          Add family photos in the Memories section and {patientName} will be able to enjoy them here.
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/memories')}>
          Add Memories
        </button>
      </div>
    );
  }

  const current = memories[currentIdx];
  const narration = getNarration(currentIdx);

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#0A0806',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 20px',
        background: 'linear-gradient(to bottom, rgba(10,8,6,0.8) 0%, transparent 100%)',
      }}>
        <div className="font-display" style={{ fontSize: 15, color: 'rgba(245,237,226,0.5)', fontStyle: 'italic' }}>
          Memory Story Time
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => { setMuted(m => !m); if (!muted) window.speechSynthesis?.cancel(); }}
            style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 9999, width: 38, height: 38, cursor: 'pointer',
              color: 'rgba(245,237,226,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button
            onClick={() => { window.speechSynthesis?.cancel(); navigate('/patient'); }}
            style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 9999, width: 38, height: 38, cursor: 'pointer',
              color: 'rgba(245,237,226,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="Close story time"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Photo */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: transitioning ? 0 : 1,
        transition: 'opacity 0.5s ease',
      }}>
        <img
          key={current.id}
          src={current.url}
          alt={current.caption}
          style={{
            maxWidth: '100vw', maxHeight: '100vh',
            objectFit: 'contain',
            animation: 'kenBurns 12s ease-in-out both',
          }}
        />
      </div>

      {/* Gradient overlay */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(to top, rgba(10,8,6,0.97) 0%, rgba(10,8,6,0.7) 55%, transparent 100%)',
        padding: '80px 40px 40px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {/* Date chip */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'rgba(217,98,42,0.8)', fontFamily: 'Manrope', fontWeight: 700,
          marginBottom: 4,
        }}>
          <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#D9622A', display: 'inline-block' }} />
          {current.date}
        </div>

        {/* Narration text */}
        <p
          className="font-display"
          style={{
            fontSize: 'clamp(1.1rem, 3vw, 1.55rem)',
            color: 'rgba(245,237,226,0.92)',
            lineHeight: 1.65,
            fontStyle: 'italic',
            fontWeight: 300,
            maxWidth: 680,
            opacity: transitioning ? 0 : 1,
            transition: 'opacity 0.5s ease',
          }}
        >
          "{narration}"
        </p>

        {/* Navigation */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16,
        }}>
          {/* Dots */}
          <div style={{ display: 'flex', gap: 6 }}>
            {memories.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                style={{
                  width: i === currentIdx ? 20 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: i === currentIdx ? '#D9622A' : 'rgba(245,237,226,0.25)',
                  border: 'none', cursor: 'pointer',
                  transition: 'width 0.3s, background 0.3s',
                  padding: 0,
                }}
                aria-label={`Go to memory ${i + 1}`}
              />
            ))}
          </div>

          {/* Arrows */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => goTo((currentIdx - 1 + memories.length) % memories.length)}
              style={{
                background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 9999, width: 44, height: 44, cursor: 'pointer',
                color: 'rgba(245,237,226,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              aria-label="Previous memory"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={() => goTo((currentIdx + 1) % memories.length)}
              style={{
                background: 'rgba(217,98,42,0.20)', border: '1px solid rgba(217,98,42,0.35)',
                borderRadius: 9999, width: 44, height: 44, cursor: 'pointer',
                color: '#E8784A', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              aria-label="Next memory"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
