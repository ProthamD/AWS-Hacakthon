import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Circle, MapPin, Film, Mic, ImageIcon, AlertTriangle } from 'lucide-react';

/* ── Grid geometry ─────────────────────────────────── */
const V_LINES = [20, 35, 50, 65, 80];
const H_LINES = [25, 50, 75];
const PLUS_POSITIONS = [
  { top: 25, left: 20 }, { top: 25, left: 50 }, { top: 25, left: 80 },
  { top: 50, left: 35 }, { top: 50, left: 65 },
  { top: 75, left: 20 }, { top: 75, left: 50 }, { top: 75, left: 80 },
];

function Plus({ top, left, delay }: { top: number; left: number; delay: number }) {
  return (
    <div className="anim-fade-in" style={{ position: 'absolute', top: `${top}%`, left: `${left}%`, transform: 'translate(-50%,-50%)', animationDelay: `${delay}ms`, opacity: 0 }}>
      <svg width="12" height="12" viewBox="0 0 12 12">
        <line x1="6" y1="0" x2="6" y2="12" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
        <line x1="0" y1="6" x2="12" y2="6" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
      </svg>
    </div>
  );
}

/* ── Floating animated screen mockups ──────────────── */
function PatientMockup({ delay }: { delay: number }) {
  return (
    <div className="anim-scale-in" style={{
      animationDelay: `${delay}ms`, opacity: 0,
      animation: `scaleIn 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}ms both, floatCard 6s ease-in-out ${delay + 800}ms infinite`,
      background: '#050508',
      border: '1px solid rgba(255,255,255,0.14)',
      borderRadius: 12, overflow: 'hidden',
      width: 160, flexShrink: 0,
      boxShadow: '0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,102,241,0.1)',
    }}>
      {/* Top bar */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 8, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>SAHAY</span>
        <span style={{ fontSize: 8, color: 'rgba(74,222,128,0.7)', border: '1px solid rgba(74,222,128,0.25)', padding: '1px 5px', borderRadius: 3 }}>◉ Live</span>
      </div>
      {/* Name */}
      <div style={{ padding: '12px 10px 6px', textAlign: 'center' }}>
        <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>FRIDAY, SEPTEMBER 19</div>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 400, color: '#ede8e3', letterSpacing: '-1px', lineHeight: 1, marginBottom: 6 }}>Meera</div>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, color: 'rgba(237,232,227,0.3)', marginBottom: 10 }}>12:28 PM</div>
        {/* Orb */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          border: '1px solid rgba(74,222,128,0.5)',
          margin: '0 auto 8px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.4)' }} />
        </div>
        <div style={{ fontSize: 8, letterSpacing: '0.12em', color: 'rgba(74,222,128,0.7)', textTransform: 'uppercase' }}>Listening</div>
      </div>
      {/* Conversation snippets */}
      <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ alignSelf: 'flex-end', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '6px 6px 2px 6px', padding: '4px 7px', fontSize: 8, color: 'rgba(255,255,255,0.65)', lineHeight: 1.4 }}>
          What is my name?
        </div>
        <div style={{ alignSelf: 'flex-start', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px 6px 6px 2px', padding: '4px 7px', fontSize: 8, color: 'rgba(255,255,255,0.55)', lineHeight: 1.4 }}>
          Your name is Meera Sharma. You are safe.
        </div>
      </div>
      {/* Panic strip */}
      <div style={{ margin: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 4, padding: '6px 8px', textAlign: 'center', fontSize: 8, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.04em' }}>
        🆘 I Need Help
      </div>
    </div>
  );
}

function ChatMockup({ delay }: { delay: number }) {
  return (
    <div className="anim-scale-in" style={{
      animationDelay: `${delay}ms`, opacity: 0,
      animation: `scaleIn 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}ms both, floatCard 7s ease-in-out ${delay + 800}ms infinite`,
      background: '#080810',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 12, overflow: 'hidden',
      width: 170, flexShrink: 0,
      boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
    }}>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 8, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>03 / Talk to Sahay</span>
        <Mic size={8} strokeWidth={1.5} style={{ color: 'rgba(99,102,241,0.6)' }} />
      </div>
      <div style={{ padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* AI message */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px 8px 8px 2px', padding: '6px 8px' }}>
          <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>Sahay</div>
          <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>नमस्ते। मैं Sahay हूँ।</div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', lineHeight: 1.4, marginTop: 2 }}>Hello! I'm here to listen.</div>
        </div>
        {/* User message */}
        <div style={{ alignSelf: 'flex-end', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.22)', borderRadius: '8px 8px 2px 8px', padding: '6px 8px', maxWidth: '80%' }}>
          <div style={{ fontSize: 7, color: 'rgba(99,102,241,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>You</div>
          <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>वो मुझे पहचान नहीं रही</div>
        </div>
        {/* Distress bar */}
        <div style={{ padding: '4px 0', marginTop: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7, color: 'rgba(255,255,255,0.3)', marginBottom: 3 }}>
            <span>Wellbeing</span><span style={{ color: '#f59e0b' }}>5/10</span>
          </div>
          <div style={{ height: 2, background: 'rgba(255,255,255,0.08)', borderRadius: 1 }}>
            <div style={{ width: '50%', height: '100%', background: '#f59e0b', borderRadius: 1 }} />
          </div>
        </div>
        {/* AI response */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px 8px 8px 2px', padding: '6px 8px' }}>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>यह सामान्य है। थोड़ा आराम करें।</div>
        </div>
      </div>
    </div>
  );
}

function MemoryMockup({ delay }: { delay: number }) {
  // Fake gradient "photo" cards
  const photos = [
    { bg: 'linear-gradient(135deg, #1a1040, #2d1b69)', caption: 'Our trip to Rishikesh' },
    { bg: 'linear-gradient(135deg, #0a2a1a, #166534)', caption: 'Morning tea, 2019' },
    { bg: 'linear-gradient(135deg, #3b0a0a, #7f1d1d)', caption: 'Family festival' },
  ];

  return (
    <div className="anim-scale-in" style={{
      animationDelay: `${delay}ms`, opacity: 0,
      animation: `scaleIn 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}ms both, floatCard 5.5s ease-in-out ${delay + 800}ms infinite`,
      background: '#060612',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 12, overflow: 'hidden',
      width: 155, flexShrink: 0,
      boxShadow: '0 24px 60px rgba(0,0,0,0.65)',
    }}>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 8, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>Memory Theater</span>
        <ImageIcon size={8} strokeWidth={1.5} style={{ color: 'rgba(99,102,241,0.5)' }} />
      </div>
      {/* Photo stack */}
      <div style={{ position: 'relative', height: 90, margin: '8px', overflow: 'visible' }}>
        {photos.map((p, i) => (
          <div key={i} style={{
            position: 'absolute', top: i * 4, left: i * 4,
            width: 'calc(100% - 8px)', height: 80,
            background: p.bg, borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', flexDirection: 'column',
            justifyContent: 'flex-end', padding: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}>
            {i === 0 && <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.6)', lineHeight: 1.3 }}>{p.caption}</div>}
          </div>
        ))}
      </div>
      {/* Dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 4, padding: '4px 0 6px' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: i === 0 ? 12 : 4, height: 4, borderRadius: 2, background: i === 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)', transition: 'all 0.3s' }} />
        ))}
      </div>
      {/* Caption */}
      <div style={{ padding: '0 10px 10px', fontFamily: "'Fraunces', serif", fontSize: 9, fontStyle: 'italic', color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, textAlign: 'center' }}>
        "Our trip to Rishikesh, 2018"
      </div>
    </div>
  );
}

/* ── Stat counter ──────────────────────────────────── */
// Simple count-up hook
function useCountUp(target: number) {
  const [val, setVal] = useStateLocal(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let i = 0;
    const steps = 50;
    const t = setInterval(() => {
      i++;
      setVal(Math.round((target * i) / steps));
      if (i >= steps) clearInterval(t);
    }, 1600 / steps);
    return () => clearInterval(t);
  }, [target]);
  return val;
}

import { useState as useStateLocal } from 'react';

/* ── Tech ticker ────────────────────────────────────── */
const TECH = ['Lambda', 'API Gateway', 'DynamoDB', 'S3', 'SNS', 'EventBridge', 'Amplify', 'CDK', 'LLaMA 3.3', 'Deepgram Nova-3', 'Groq Whisper', 'React 18', 'TypeScript'];

function Ticker() {
  const doubled = [...TECH, ...TECH];
  return (
    <div style={{ overflow: 'hidden', width: '100%', padding: '18px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="ticker-track" style={{ display: 'flex', gap: 12, width: 'max-content' }}>
        {doubled.map((t, i) => (
          <span key={i} className="font-ui" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.08)', padding: '3px 10px', borderRadius: 4, whiteSpace: 'nowrap' }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const count1 = useCountUp(88);
  const count2 = useCountUp(200);

  return (
    <div className="font-ui" style={{ minHeight: '100vh', position: 'relative', background: '#0a0a12', overflow: 'hidden' }}>

      {/* ── Gradient background ─────────────────────── */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 70% 50% at 60% -5%, rgba(99,102,241,0.14), transparent)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 50% 40% at 20% 80%, rgba(99,102,241,0.06), transparent)', pointerEvents: 'none' }} />

      {/* ── Grid lines — vertical ───────────────────── */}
      {V_LINES.map((l, i) => (
        <div key={`v${i}`} className="anim-grid-h" style={{ position: 'absolute', top: 0, bottom: 0, left: `${l}%`, width: 1, background: 'rgba(255,255,255,0.04)', transformOrigin: 'top', animationDelay: `${300 + i * 80}ms`, zIndex: 1, opacity: 0 }} />
      ))}

      {/* ── Grid lines — horizontal ─────────────────── */}
      {H_LINES.map((h, i) => (
        <div key={`h${i}`} className="anim-grid-v" style={{ position: 'absolute', left: 0, right: 0, top: `${h}%`, height: 1, background: 'rgba(255,255,255,0.04)', transformOrigin: 'left', animationDelay: `${500 + i * 80}ms`, zIndex: 1, opacity: 0 }} />
      ))}

      {/* ── Plus marks ──────────────────────────────── */}
      {PLUS_POSITIONS.map((p, i) => (
        <Plus key={i} top={p.top} left={p.left} delay={800 + i * 60} />
      ))}

      {/* ── Capability nodes (desktop, behind cards) ── */}
      <div className="hidden lg:block" style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="none">
          <line x1="20%" y1="40%" x2="48%" y2="58%" stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="4 6" className="anim-draw-line" style={{ animationDelay: '1800ms', strokeDashoffset: 300 }} />
          <line x1="52%" y1="56%" x2="72%" y2="36%" stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="4 6" className="anim-draw-line" style={{ animationDelay: '2000ms', strokeDashoffset: 300 }} />
          <line x1="20%" y1="38%" x2="72%" y2="34%" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="3 8" className="anim-draw-line" style={{ animationDelay: '2200ms', strokeDashoffset: 300 }} />
        </svg>

        {[
          { label: '[ AI_PANIC_DETECTION ]', desc: 'Distress score 1–10. Alerts only at 7+.', icon: AlertTriangle, top: '34%', left: '16%', delay: 1200 },
          { label: '[ LIVE_ROUTE ]', desc: 'Google Maps when patient asks where to go.', icon: MapPin, top: '60%', left: '48%', delay: 1400 },
          { label: '[ MEMORY_THEATER ]', desc: 'Family photos with AI narration.', icon: Film, top: '28%', left: '70%', delay: 1600 },
        ].map((node, i) => (
          <div key={i} className="anim-scale-in" style={{ position: 'absolute', top: node.top, left: node.left, transform: 'translate(-50%,-50%)', animationDelay: `${node.delay}ms`, opacity: 0, pointerEvents: 'auto' }}>
            <div style={{ border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(10,10,18,0.8)', backdropFilter: 'blur(12px)', padding: '12px 16px', maxWidth: 200, cursor: 'default', transition: 'border-color 0.25s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,0.5)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.14)'; }}
            >
              <node.icon size={12} style={{ color: 'rgba(99,102,241,0.7)', marginBottom: 7 }} strokeWidth={1.5} />
              <div style={{ fontSize: 10, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.85)', marginBottom: 5, textTransform: 'uppercase', fontWeight: 600 }}>{node.label}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>{node.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main layout: hero left + cards right ────── */}
      <div style={{ position: 'relative', zIndex: 3, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '80px 20px 0', gap: 40, minHeight: '80vh' }}>

        {/* LEFT — hero text */}
        <div style={{ flex: '0 0 auto', maxWidth: 480, paddingTop: 20 }}>

          {/* Badge */}
          <div className="anim-fade-up" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(99,102,241,0.9)', border: '1px solid rgba(99,102,241,0.22)', padding: '4px 12px', marginBottom: 28, animationDelay: '100ms', opacity: 0 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} />
            Voice-first · Hindi · Bengali · English
          </div>

          {/* H1 */}
          <h1 className="font-display anim-fade-up" style={{ fontSize: 'clamp(2.8rem, 5.5vw, 5.5rem)', fontWeight: 400, lineHeight: 1.04, letterSpacing: '-2px', color: '#fff', marginBottom: 24, animationDelay: '200ms', opacity: 0 }}>
            The caregiver<br />
            deserves<br />
            <em style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.45)' }}>rest too.</em>
          </h1>

          {/* Subhead */}
          <p className="anim-fade-up" style={{ fontSize: 16, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, maxWidth: 380, marginBottom: 36, animationDelay: '350ms', opacity: 0 }}>
            Set up a profile in 5 minutes.<br />
            Sahay handles the rest, day and night.
          </p>

          {/* CTAs */}
          <div className="anim-fade-up" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 52, animationDelay: '500ms', opacity: 0 }}>
            <Link to="/setup" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: '#6366f1', color: '#fff', padding: '12px 22px', fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', textDecoration: 'none', transition: 'background 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#818cf8')}
              onMouseLeave={e => (e.currentTarget.style.background = '#6366f1')}>
              Start Setup <ArrowRight size={15} strokeWidth={1.8} />
            </Link>
            <Link to="/patient" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, border: '1px solid rgba(255,255,255,0.22)', color: '#fff', padding: '12px 22px', fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', textDecoration: 'none', transition: 'border-color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)')}>
              <Circle size={13} strokeWidth={1.5} /> Patient Mode
            </Link>
          </div>

          {/* Disclaimer card */}
          <div className="anim-fade-up" style={{ border: '1px solid rgba(255,255,255,0.08)', padding: '14px 18px', maxWidth: 340, background: 'rgba(255,255,255,0.025)', animationDelay: '700ms', opacity: 0 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(99,102,241,0.7)', marginBottom: 7 }}>NOT A DIAGNOSIS — A COMPANION</div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.65 }}>Built with caregivers, for the moments a diagnosis doesn't prepare you for.</p>
          </div>
        </div>

        {/* RIGHT — animated floating screen mockups */}
        <div className="hidden md:flex" style={{ flexDirection: 'column', gap: 28, paddingTop: 40, alignItems: 'flex-end', flex: '0 0 auto' }}>
          {/* Row 1: Patient + Chat side by side */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <PatientMockup delay={900} />
            <ChatMockup delay={1100} />
          </div>
          {/* Row 2: Memory centered */}
          <div style={{ display: 'flex', justifyContent: 'center', width: '100%', paddingRight: 20 }}>
            <MemoryMockup delay={1300} />
          </div>
        </div>
      </div>

      {/* ── Stats strip ─────────────────────────────── */}
      <div className="anim-fade-up" style={{ position: 'relative', zIndex: 3, marginTop: 60, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', animationDelay: '800ms', opacity: 0 }}>
        {[
          { value: `${(count1 / 10).toFixed(1)}M`, label: 'Indians living with dementia', color: '#fff' },
          { value: `<${count2}ms`, label: 'Deepgram real-time response', color: 'rgba(74,222,128,0.9)' },
          { value: '0', label: 'Tech skills required', color: '#fff' },
        ].map((s, i) => (
          <div key={i} style={{ padding: '28px 20px', borderRight: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
            <div className="font-display" style={{ fontSize: 'clamp(2rem, 4vw, 3.2rem)', fontWeight: 400, letterSpacing: '-1px', color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 6, lineHeight: 1.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Tech ticker ──────────────────────────────── */}
      <Ticker />

    </div>
  );
}
