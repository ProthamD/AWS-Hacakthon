import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Mic, ImageIcon, MapPin, Shield, Heart, Zap } from 'lucide-react';

/* ── Animated counter hook ─────────────────────────────── */
function useCount(target: number, duration = 1800) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { start = target; clearInterval(timer); }
      if (ref.current) ref.current.textContent = Math.round(start).toLocaleString();
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return ref;
}

const FEATURES = [
  {
    icon: Mic,
    title: 'Voice Companion',
    desc: 'Speak your worries in Hindi or English. Sahay listens, understands, and responds with personalised guidance.',
    color: 'var(--c-accent)',
    glow: 'rgba(124,111,250,0.15)',
  },
  {
    icon: Shield,
    title: 'Emergency Triage',
    desc: 'AI detects distress signals and automatically escalates to emergency contacts with a single care network alert.',
    color: '#f87171',
    glow: 'rgba(248,113,113,0.12)',
  },
  {
    icon: MapPin,
    title: 'Route Safety',
    desc: 'Geofence alerts when the patient deviates from their safe route. A calming voice message plays on their device.',
    color: 'var(--c-amber)',
    glow: 'rgba(245,158,11,0.12)',
  },
  {
    icon: ImageIcon,
    title: 'Memory Theater',
    desc: 'Upload family photos — Sahay narrates them softly to help patients reconnect with cherished moments.',
    color: 'var(--c-calm)',
    glow: 'rgba(74,222,128,0.1)',
  },
];

/* ── Mock app screens for hero visual ─────────────────── */
function PatientMockup({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{
      width: 200, borderRadius: 18, overflow: 'hidden',
      background: 'var(--c-surface)', border: '1px solid var(--c-border-hi)',
      boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      flexShrink: 0,
      ...style,
    }}>
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--c-border)' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--c-accent)', fontFamily: 'Manrope, sans-serif', fontWeight: 700, marginBottom: 4 }}>Patient Mode</div>
        <div style={{ fontSize: 13, fontFamily: "'Fraunces', serif", color: 'var(--c-text-1)', fontWeight: 400 }}>Meera Sharma</div>
      </div>
      <div style={{ padding: '18px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        {/* Orb */}
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(124,111,250,0.6) 0%, rgba(124,111,250,0.15) 70%)',
          border: '1.5px solid rgba(124,111,250,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 24px rgba(124,111,250,0.3)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" strokeLinecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
        </div>
        {/* Convo bubbles */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ alignSelf: 'flex-end', background: 'rgba(124,111,250,0.18)', border: '1px solid rgba(124,111,250,0.28)', borderRadius: '10px 10px 2px 10px', padding: '5px 9px', fontSize: 9, color: 'rgba(240,240,248,0.85)', fontFamily: 'Noto Sans Devanagari, sans-serif' }}>Sahay, मेरा घर कहाँ है?</div>
          <div style={{ alignSelf: 'flex-start', background: 'var(--c-surface-2)', border: '1px solid var(--c-border-hi)', borderRadius: '10px 10px 10px 2px', padding: '5px 9px', fontSize: 9, color: 'rgba(240,240,248,0.75)', fontFamily: 'Manrope, sans-serif' }}>आप बिल्कुल सुरक्षित हैं…</div>
        </div>
        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--c-calm)' }} />
          <span style={{ fontSize: 8, color: 'var(--c-text-3)', fontFamily: 'Manrope, sans-serif', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Listening</span>
        </div>
      </div>
    </div>
  );
}

function ChatMockup({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{
      width: 200, borderRadius: 18, overflow: 'hidden',
      background: 'var(--c-surface)', border: '1px solid var(--c-border-hi)',
      boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      flexShrink: 0,
      ...style,
    }}>
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--c-border)' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--c-accent)', fontFamily: 'Manrope, sans-serif', fontWeight: 700, marginBottom: 4 }}>Caregiver Chat</div>
        <div style={{ fontSize: 12, fontFamily: 'Manrope, sans-serif', color: 'var(--c-text-2)' }}>Hindi · English</div>
      </div>
      <div style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ alignSelf: 'flex-end', background: 'rgba(124,111,250,0.18)', border: '1px solid rgba(124,111,250,0.25)', borderRadius: '10px 10px 2px 10px', padding: '6px 9px', fontSize: 9, color: 'rgba(240,240,248,0.85)', fontFamily: 'Noto Sans Devanagari, sans-serif', maxWidth: '85%' }}>वो मुझे पहचान नहीं रही आज</div>
        <div style={{ alignSelf: 'flex-start', background: 'var(--c-surface-2)', border: '1px solid var(--c-border-hi)', borderRadius: '10px 10px 10px 2px', padding: '6px 9px', fontSize: 9, color: 'rgba(240,240,248,0.75)', maxWidth: '85%', fontFamily: 'Manrope, sans-serif' }}>यह Alzheimer's में सामान्य है…</div>
        {/* Distress bar */}
        <div style={{ marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7, color: 'var(--c-text-3)', marginBottom: 3, fontFamily: 'Manrope, sans-serif', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            <span>Wellbeing</span><span style={{ color: 'var(--c-calm)' }}>4/10</span>
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '40%', background: 'var(--c-calm)', borderRadius: 2 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MemoryMockup({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{
      width: 200, borderRadius: 18, overflow: 'hidden',
      background: '#000', border: '1px solid var(--c-border-hi)',
      boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      flexShrink: 0,
      ...style,
    }}>
      {/* Photo placeholder */}
      <div style={{
        height: 90, background: 'linear-gradient(135deg, #1a1a2e 0%, #2a1f3d 50%, #1a2a1f 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <ImageIcon size={20} strokeWidth={1} style={{ color: 'rgba(255,255,255,0.2)', display: 'block', margin: '0 auto 4px' }} />
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', fontFamily: 'Manrope', letterSpacing: '0.08em' }}>FAMILY PHOTO</div>
        </div>
      </div>
      <div style={{ padding: '12px 12px 14px', textAlign: 'center' }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 11, fontStyle: 'italic', color: 'rgba(240,240,248,0.7)', lineHeight: 1.5, marginBottom: 8 }}>
          "Our trip to Rishikesh, 2018"
        </div>
        {/* Dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
          {[1,2,3].map((_, i) => <div key={i} style={{ width: i===0?14:4, height: 4, borderRadius: 2, background: i===0?'#fff':'rgba(255,255,255,0.2)' }} />)}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const count1Ref = useCount(88);   // 8.8M shown as 88 → "8.8M"
  const count2Ref = useCount(200);

  return (
    <div className="font-ui" style={{ overflowX: 'hidden' }}>

      {/* ── Hero ──────────────────────────────────────────── */}
      <section style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', position: 'relative', padding: '48px 0 60px' }}>

        {/* Background ambient glow */}
        <div style={{
          position: 'absolute', top: '10%', left: '-10%',
          width: '55%', height: '55%',
          background: 'radial-gradient(ellipse, rgba(124,111,250,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} aria-hidden="true" />
        <div style={{
          position: 'absolute', top: '20%', right: '-5%',
          width: '40%', height: '50%',
          background: 'radial-gradient(ellipse, rgba(74,222,128,0.05) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} aria-hidden="true" />

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', width: '100%', display: 'grid', gridTemplateColumns: '1fr auto', gap: 48, alignItems: 'center' }}>

          {/* Left: Text */}
          <div style={{ maxWidth: 560 }}>
            {/* Eyebrow */}
            <div className="anim-fade-up" style={{ animationDelay: '0.05s', marginBottom: 24 }}>
              <span className="badge badge-accent">
                <Heart size={10} strokeWidth={2} /> AWS Hackathon 2026
              </span>
            </div>

            {/* H1 */}
            <h1
              className="font-display anim-fade-up"
              style={{
                animationDelay: '0.1s',
                fontSize: 'clamp(2.8rem, 6vw, 5rem)',
                fontWeight: 300,
                lineHeight: 1.05,
                letterSpacing: '-2px',
                color: 'var(--c-text-1)',
                marginBottom: 20,
              }}
            >
              Care that<br />
              <em style={{
                fontStyle: 'italic',
                background: 'linear-gradient(135deg, #7c6ffa 0%, #c4b8ff 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>speaks</em> first.
            </h1>

            <p className="anim-fade-up" style={{
              animationDelay: '0.18s',
              fontSize: 17,
              lineHeight: 1.7,
              color: 'var(--c-text-2)',
              marginBottom: 36,
              maxWidth: 480,
            }}>
              Sahay (<span style={{ fontFamily: "'Noto Sans Devanagari', serif" }}>सहाय</span>) is an AI companion for Indian family caregivers of Alzheimer's patients — giving voice-first guidance in Hindi and English, 24 hours a day.
            </p>

            {/* Stats */}
            <div className="anim-fade-up" style={{ animationDelay: '0.24s', display: 'flex', gap: 32, marginBottom: 40 }}>
              <div>
                <div className="stat-number" style={{ fontSize: 36, color: 'var(--c-text-1)' }}>
                  <span ref={count1Ref}>0</span>
                  <span style={{ fontSize: 20, color: 'var(--c-accent)' }}>L+</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Dementia patients</div>
              </div>
              <div style={{ width: 1, background: 'var(--c-border)', flexShrink: 0 }} aria-hidden="true" />
              <div>
                <div className="stat-number" style={{ fontSize: 36, color: 'var(--c-text-1)' }}>
                  <span ref={count2Ref}>0</span>
                  <span style={{ fontSize: 20, color: 'var(--c-calm)' }}>K+</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Caregivers alone</div>
              </div>
            </div>

            {/* CTAs */}
            <div className="anim-fade-up" style={{ animationDelay: '0.3s', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link to="/setup" className="btn btn-primary" style={{ fontSize: 14 }}>
                Get Started <ArrowRight size={15} strokeWidth={2} />
              </Link>
              <Link to="/chat" className="btn btn-ghost" style={{ fontSize: 14 }}>
                <Mic size={15} strokeWidth={1.8} /> Try Voice Chat
              </Link>
            </div>
          </div>

          {/* Right: Floating app mockups */}
          <div className="hide-mobile" style={{ position: 'relative', width: 260, height: 380 }}>
            <div className="anim-float" style={{ position: 'absolute', top: 0, left: 20, animationDuration: '6s', animationDelay: '0s' }}>
              <PatientMockup />
            </div>
            <div className="anim-float-alt" style={{ position: 'absolute', top: 120, left: 0, animationDuration: '7s', animationDelay: '0.5s' }}>
              <ChatMockup />
            </div>
            <div className="anim-float" style={{ position: 'absolute', top: 200, left: 30, animationDuration: '8s', animationDelay: '1s' }}>
              <MemoryMockup />
            </div>
          </div>

        </div>
      </section>

      {/* ── Divider ─────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, var(--c-border) 30%, var(--c-border) 70%, transparent)' }} />
      </div>

      {/* ── Features ─────────────────────────────────────── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 24px' }}>
        <div style={{ marginBottom: 48 }}>
          <div className="section-label anim-fade-up" style={{ marginBottom: 12 }}>What Sahay does</div>
          <h2 className="font-display anim-fade-up" style={{ animationDelay: '0.08s', fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 300, letterSpacing: '-1px', color: 'var(--c-text-1)', lineHeight: 1.15 }}>
            Built for the realities<br />
            <em style={{ color: 'var(--c-text-2)', fontStyle: 'italic' }}>of Indian caregiving.</em>
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="glass-card anim-fade-up"
              style={{ animationDelay: `${0.1 + i * 0.07}s`, padding: 24, cursor: 'default' }}
            >
              {/* Icon */}
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: f.glow,
                border: `1px solid ${f.color}33`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 18,
              }}>
                <f.icon size={20} strokeWidth={1.5} style={{ color: f.color }} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--c-text-1)', marginBottom: 8, letterSpacing: '-0.2px' }}>{f.title}</h3>
              <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--c-text-2)' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA strip ────────────────────────────────────── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px' }}>
        <div style={{
          borderRadius: 20,
          padding: '48px 40px',
          background: 'linear-gradient(135deg, rgba(124,111,250,0.12) 0%, rgba(124,111,250,0.04) 60%, rgba(74,222,128,0.06) 100%)',
          border: '1px solid rgba(124,111,250,0.2)',
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 20,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Glow orb */}
          <div style={{
            position: 'absolute', top: -40, right: -40,
            width: 200, height: 200,
            background: 'radial-gradient(circle, rgba(124,111,250,0.15) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} aria-hidden="true" />
          <div>
            <div className="section-label" style={{ marginBottom: 10 }}>
              <Zap size={11} style={{ display: 'inline', marginRight: 5 }} />
              Ready in 2 minutes
            </div>
            <h2 className="font-display" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', fontWeight: 300, letterSpacing: '-1px', color: 'var(--c-text-1)', lineHeight: 1.2 }}>
              Set up once.<br />
              <em style={{ fontStyle: 'italic', color: 'var(--c-text-2)' }}>Sahay handles the rest.</em>
            </h2>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link to="/setup" className="btn btn-primary">
              Set Up Patient Profile <ArrowRight size={14} strokeWidth={2} />
            </Link>
            <Link to="/patient" className="btn btn-ghost">
              Open Patient Mode
            </Link>
          </div>
        </div>
      </section>

      {/* ── Disclaimer ────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 48px', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: 'var(--c-text-4)', lineHeight: 1.7 }}>
          Sahay is an AI companion, not a medical device. Not for clinical use. Always provide human escalation paths.<br />
          For emergencies: <strong style={{ color: 'var(--c-text-3)' }}>112</strong> (India) · ARDSI Helpline: <strong style={{ color: 'var(--c-text-3)' }}>1800-200-ARDSI</strong>
        </p>
      </div>

    </div>
  );
}
