import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Circle, MapPin, Film, Mic, ImageIcon, AlertTriangle } from 'lucide-react';

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
        <line x1="6" y1="0" x2="6" y2="12" stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
        <line x1="0" y1="6" x2="12" y2="6" stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
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
    <div style={{ overflow: 'hidden', width: '100%', padding: '24px 0', borderTop: '1px solid rgba(255,255,255,0.15)' }}>
      <div className="ticker-track" style={{ display: 'flex', gap: 16, width: 'max-content' }}>
        {doubled.map((t, i) => (
          <span key={i} className="font-ui" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.3)', padding: '6px 14px', borderRadius: 6, whiteSpace: 'nowrap', background: 'rgba(255,255,255,0.05)', boxShadow: '0 0 15px rgba(255,255,255,0.15), inset 0 1px 1px rgba(255,255,255,0.3)' }}>
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
        <div key={`v${i}`} className="anim-grid-h" style={{ position: 'absolute', top: 0, bottom: 0, left: `${l}%`, width: 1, background: 'rgba(255,255,255,0.12)', transformOrigin: 'top', animationDelay: `${300 + i * 80}ms`, zIndex: 1, opacity: 0 }} />
      ))}

      {/* ── Grid lines — horizontal ─────────────────── */}
      {H_LINES.map((h, i) => (
        <div key={`h${i}`} className="anim-grid-v" style={{ position: 'absolute', left: 0, right: 0, top: `${h}%`, height: 1, background: 'rgba(255,255,255,0.12)', transformOrigin: 'left', animationDelay: `${500 + i * 80}ms`, zIndex: 1, opacity: 0 }} />
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
            <Link to="/setup" className="uiverse-btn" tabIndex={0}>
              <div className="outline"></div>
              <div className="state state--default">
                <div className="icon">
                  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <g style={{ filter: 'url(#shadow)' }}>
                      <path d="M14.2199 21.63C13.0399 21.63 11.3699 20.8 10.0499 16.83L9.32988 14.67L7.16988 13.95C3.20988 12.63 2.37988 10.96 2.37988 9.78001C2.37988 8.61001 3.20988 6.93001 7.16988 5.60001L15.6599 2.77001C17.7799 2.06001 19.5499 2.27001 20.6399 3.35001C21.7299 4.43001 21.9399 6.21001 21.2299 8.33001L18.3999 16.82C17.0699 20.8 15.3999 21.63 14.2199 21.63ZM7.63988 7.03001C4.85988 7.96001 3.86988 9.06001 3.86988 9.78001C3.86988 10.5 4.85988 11.6 7.63988 12.52L10.1599 13.36C10.3799 13.43 10.5599 13.61 10.6299 13.83L11.4699 16.35C12.3899 19.13 13.4999 20.12 14.2199 20.12C14.9399 20.12 16.0399 19.13 16.9699 16.35L19.7999 7.86001C20.3099 6.32001 20.2199 5.06001 19.5699 4.41001C18.9199 3.76001 17.6599 3.68001 16.1299 4.19001L7.63988 7.03001Z" fill="currentColor"></path>
                      <path d="M10.11 14.4C9.92005 14.4 9.73005 14.33 9.58005 14.18C9.29005 13.89 9.29005 13.41 9.58005 13.12L13.16 9.53C13.45 9.24 13.93 9.24 14.22 9.53C14.51 9.82 14.51 10.3 14.22 10.59L10.64 14.18C10.5 14.33 10.3 14.4 10.11 14.4Z" fill="currentColor"></path>
                    </g>
                    <defs>
                      <filter id="shadow"><feDropShadow dx="0" dy="1" stdDeviation="0.6" floodOpacity="0.5"></feDropShadow></filter>
                    </defs>
                  </svg>
                </div>
                <p>
                  <span style={{ '--i': 0 } as React.CSSProperties}>S</span>
                  <span style={{ '--i': 1 } as React.CSSProperties}>t</span>
                  <span style={{ '--i': 2 } as React.CSSProperties}>a</span>
                  <span style={{ '--i': 3 } as React.CSSProperties}>r</span>
                  <span style={{ '--i': 4 } as React.CSSProperties}>t</span>
                  <span style={{ '--i': 5 } as React.CSSProperties}>&nbsp;</span>
                  <span style={{ '--i': 6 } as React.CSSProperties}>S</span>
                  <span style={{ '--i': 7 } as React.CSSProperties}>e</span>
                  <span style={{ '--i': 8 } as React.CSSProperties}>t</span>
                  <span style={{ '--i': 9 } as React.CSSProperties}>u</span>
                  <span style={{ '--i': 10 } as React.CSSProperties}>p</span>
                </p>
              </div>
              <div className="state state--sent">
                <div className="icon">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" height="1em" width="1em" strokeWidth="0.5px" stroke="black">
                    <g style={{ filter: 'url(#shadow)' }}>
                      <path fill="currentColor" d="M12 22.75C6.07 22.75 1.25 17.93 1.25 12C1.25 6.07 6.07 1.25 12 1.25C17.93 1.25 22.75 6.07 22.75 12C22.75 17.93 17.93 22.75 12 22.75ZM12 2.75C6.9 2.75 2.75 6.9 2.75 12C2.75 17.1 6.9 21.25 12 21.25C17.1 21.25 21.25 17.1 21.25 12C21.25 6.9 17.1 2.75 12 2.75Z"></path>
                      <path fill="currentColor" d="M10.5795 15.5801C10.3795 15.5801 10.1895 15.5001 10.0495 15.3601L7.21945 12.5301C6.92945 12.2401 6.92945 11.7601 7.21945 11.4701C7.50945 11.1801 7.98945 11.1801 8.27945 11.4701L10.5795 13.7701L15.7195 8.6301C16.0095 8.3401 16.4895 8.3401 16.7795 8.6301C17.0695 8.9201 17.0695 9.4001 16.7795 9.6901L11.1095 15.3601C10.9695 15.5001 10.7795 15.5801 10.5795 15.5801Z"></path>
                    </g>
                  </svg>
                </div>
                <p>
                  <span style={{ '--i': 5 } as React.CSSProperties}>G</span>
                  <span style={{ '--i': 6 } as React.CSSProperties}>o</span>
                  <span style={{ '--i': 7 } as React.CSSProperties}>i</span>
                  <span style={{ '--i': 8 } as React.CSSProperties}>n</span>
                  <span style={{ '--i': 9 } as React.CSSProperties}>g</span>
                  <span style={{ '--i': 10 } as React.CSSProperties}>!</span>
                </p>
              </div>
            </Link>
            <Link to="/patient" className="patient-btn">
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
        <div className="hidden md:flex" style={{ position: 'relative', flexDirection: 'column', gap: 28, paddingTop: 40, alignItems: 'flex-end', flex: '0 0 auto' }}>
          
          {/* Snowy smoke screen behind the cluster */}
          <div style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '800px', height: '800px',
            background: 'radial-gradient(circle, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.08) 40%, transparent 70%)',
            filter: 'blur(50px)',
            pointerEvents: 'none',
            zIndex: 0
          }} />

          {/* Row 1: Patient + Chat side by side */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
            <PatientMockup delay={900} />
            <ChatMockup delay={1100} />
          </div>
          {/* Row 2: Memory centered */}
          <div style={{ display: 'flex', justifyContent: 'center', width: '100%', paddingRight: 20, position: 'relative', zIndex: 1 }}>
            <MemoryMockup delay={1300} />
          </div>
        </div>
      </div>

      {/* ── Stats strip ─────────────────────────────── */}
      <div className="anim-fade-up grid grid-cols-1 md:grid-cols-3" style={{ 
        position: 'relative', zIndex: 3, 
        margin: '60px 20px 40px',
        maxWidth: 960,
        background: 'rgba(10,10,18,0.7)',
        backdropFilter: 'blur(15px)',
        border: '1px solid rgba(255,255,255,0.2)', 
        borderRadius: 16,
        boxShadow: '0 0 35px rgba(255,255,255,0.15), inset 0 1px 2px rgba(255,255,255,0.3)',
        animationDelay: '800ms', opacity: 0 
      }}>
        {/* On very large screens we center it using margin inline auto, but keep 20px side margins on small screens */}
        <style>{`
          @media (min-width: 1000px) {
            .anim-fade-up.grid { margin-left: auto !important; margin-right: auto !important; }
          }
        `}</style>
        {[
          { value: `${(count1 / 10).toFixed(1)}M`, label: 'Indians living with dementia', color: '#fff' },
          { value: `<${count2}ms`, label: 'Deepgram real-time response', color: 'rgba(74,222,128,1)' },
          { value: '0', label: 'Tech skills required', color: '#fff' },
        ].map((s, i) => (
          <div key={i} className={`p-8 md:p-10 text-center ${i < 2 ? 'border-b md:border-b-0 md:border-r border-white/15' : ''}`}>
            <div className="font-display" style={{ fontSize: 'clamp(3rem, 5vw, 3.5rem)', fontWeight: 400, letterSpacing: '-1px', color: s.color, lineHeight: 1, textShadow: '0 2px 10px rgba(255,255,255,0.25)' }}>{s.value}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 8, lineHeight: 1.5, fontWeight: 500, letterSpacing: '0.02em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Tech ticker ──────────────────────────────── */}
      <Ticker />

    </div>
  );
}
