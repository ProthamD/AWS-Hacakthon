import { Link } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import caregiverHero from '../assets/caregiver-hero.png';

function useCountUp(target, duration = 1800) {
  const [val, setVal] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const steps = 60;
    const increment = target / steps;
    let current = 0;
    const t = setInterval(() => {
      current += increment;
      if (current >= target) { setVal(target); clearInterval(t); }
      else setVal(current);
    }, duration / steps);
    return () => clearInterval(t);
  }, [target, duration]);
  return val;
}

function Waveform({ active, variant = '' }) {
  return (
    <div className={`waveform${!active ? ' waveform--idle' : ''} ${variant ? `waveform--${variant}` : ''}`}>
      {[...Array(12)].map((_, i) => (
        <div key={i} className="waveform__bar" style={{ animationDelay: `${i * 0.08}s` }} />
      ))}
    </div>
  );
}

export default function HomePage() {
  const stat1 = useCountUp(8.8);
  const stat2 = useCountUp(200);
  const [waveActive, setWaveActive] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setWaveActive(true), 800);
    return () => clearTimeout(t);
  }, []);

  return (
    <main className="page" style={{ paddingTop: 'calc(64px + 3rem)' }}>

      {/* ─── HERO ─────────────────────────────────────── */}
      <section className="home-hero">
        <div className="home-hero__copy">
          <div className="section-label section-label--signal animate-fade-up">
            ◉ AWS Hackathon 2026 · Ship It Track
          </div>
          <h1 className="display-xl animate-fade-up animate-delay-1">
            Memory never<br />
            fades. <span className="gradient-signal">We make</span><br />
            sure of it.
          </h1>
          <p className="body-lg animate-fade-up animate-delay-2">
            Voice-first AI companion for Alzheimer's patients and their families in India.
            No tech skills. No English required. Just speak.
          </p>
          <div className="flex gap-1 wrap animate-fade-up animate-delay-3">
            <Link to="/patient" className="btn btn--signal btn--lg">◉ Open Patient Mode</Link>
            <Link to="/onboard" className="btn btn--outline btn--lg">Set Up Profile →</Link>
          </div>
        </div>
        <div className="home-hero__image animate-fade-up animate-delay-2">
          <img src={caregiverHero} alt="A daughter sitting with and reassuring her mother at home" />
          <div className="home-hero__image-note">A little reassurance, whenever it’s needed.</div>
        </div>
      </section>

      {/* ─── STATS STRIP ─────────────────────────────── */}
      <section style={{ paddingTop: '0', paddingBottom: '0' }}>
        <div className="stat-strip">
          <div className="stat-strip__item">
            <div className="stat-strip__value">
              {stat1.toFixed(1)}<span style={{ fontSize: '2rem', color: 'var(--signal)' }}>M</span>
            </div>
            <div className="stat-strip__label">Indians living with dementia</div>
          </div>
          <div className="stat-strip__item">
            <div className="stat-strip__value">
              <span style={{ fontSize: '2rem', color: 'var(--mint)' }}>&lt;</span>{Math.floor(stat2)}
              <span style={{ fontSize: '1.5rem', color: 'var(--mint)' }}>ms</span>
            </div>
            <div className="stat-strip__label">Deepgram real-time response</div>
          </div>
          <div className="stat-strip__item">
            <div className="stat-strip__value">0</div>
            <div className="stat-strip__label">Tech skills required</div>
          </div>
        </div>
      </section>

      {/* ─── BENTO FEATURES ──────────────────────────── */}
      <section style={{ paddingTop: '5rem', paddingBottom: '5rem', borderBottom: '1px solid var(--line)' }}>
        <div className="section-label" style={{ marginBottom: '2rem' }}>
          02 / Capabilities
        </div>
        <div className="bento">
          {/* Voice AI — large hero tile */}
          <div className="bento__tile bento__tile--2x bento__tile--2y">
            <div className="section-label section-label--mint">🎙 Voice AI</div>
            <div className="display-md" style={{ marginBottom: '1.5rem', lineHeight: 1.2 }}>
              Listens continuously.<br />Responds only<br />when needed.
            </div>
            <Waveform active={waveActive} />
            <p className="body-sm" style={{ marginTop: '1.5rem', maxWidth: '280px' }}>
              Deepgram Nova-3 real-time streaming → LLaMA 3.3 reasoning → SpeechSynthesis calming voice.
            </p>
            <div className="flex gap-half wrap" style={{ marginTop: '1.5rem' }}>
              <span className="badge badge--mint">Deepgram Live</span>
              <span className="badge badge--signal">Groq Fallback</span>
            </div>
          </div>

          {/* AI Triage */}
          <div className="bento__tile">
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🧠</div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: '1rem', marginBottom: '0.5rem' }}>AI Panic Detection</div>
            <p className="body-sm">Distress score 1–10. Alerts caregiver only at 7+.</p>
          </div>

          {/* Memories */}
          <div className="bento__tile bento__tile--2y" style={{ borderLeft: '1px solid var(--line)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🎞️</div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: '1rem', marginBottom: '0.5rem' }}>Memory Theater</div>
            <p className="body-sm" style={{ marginBottom: '1.5rem' }}>Auto-played family photo slideshow with AI narration during confused episodes.</p>
            <Link to="/memories" className="btn btn--outline btn--sm" style={{ marginTop: 'auto' }}>Upload Memories →</Link>
          </div>

          {/* Route */}
          <div className="bento__tile">
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📍</div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: '1rem', marginBottom: '0.5rem' }}>Live Route</div>
            <p className="body-sm">Google Maps turn-by-turn when patient asks where to go.</p>
          </div>

          {/* QR card — full width bottom */}
          <div className="bento__tile bento__tile--2x bento__tile--signal">
            <div className="flex items-center gap-1">
              <div style={{ fontSize: '2.5rem' }}>🔲</div>
              <div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: '1.1rem', color: 'var(--signal)' }}>Bystander QR Card</div>
                <p className="body-sm" style={{ marginTop: '0.25rem' }}>Any stranger can scan to contact caregiver + play calming message instantly.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ────────────────────────────── */}
      <section style={{ paddingTop: '5rem', paddingBottom: '5rem', borderBottom: '1px solid var(--line)' }}>
        <div className="section-label" style={{ marginBottom: '3rem' }}>03 / How It Works</div>
        <div className="grid-3">
          {[
            { n: '01', title: 'Set Up Once', body: 'Fill in patient name, caregiver contact, home address, and a few personal memories. Takes 5 minutes.' },
            { n: '02', title: 'Sahay Listens', body: 'Opens in Patient Mode. Continuously listens via Deepgram. Stays silent for background chatter.' },
            { n: '03', title: 'AI Responds', body: 'Panic → calm instantly. Lost → show map. Question → answer with personal context. SMS caregiver if score 7+.' },
          ].map(step => (
            <div key={step.n} style={{ paddingTop: '2rem', borderTop: '1px solid var(--line)' }}>
              <div className="section-label section-label--signal" style={{ marginBottom: '1rem' }}>{step.n}</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: '1.25rem', marginBottom: '0.75rem' }}>{step.title}</div>
              <p className="body-sm">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── CTA ─────────────────────────────────────── */}
      <section style={{ paddingTop: '5rem', paddingBottom: '5rem', textAlign: 'center' }}>
        <div className="section-label" style={{ marginBottom: '2rem' }}>04 / Get Started</div>
        <h2 className="display-lg" style={{ marginBottom: '1.5rem' }}>
          The caregiver<br />
          <span className="gradient-signal">deserves rest too.</span>
        </h2>
        <p className="body-lg" style={{ marginBottom: '3rem', maxWidth: '400px', margin: '0 auto 3rem' }}>
          Set up a profile in 5 minutes. Sahay handles the rest, day and night.
        </p>
        <div className="flex gap-1 justify-center wrap">
          <Link to="/onboard" className="btn btn--signal btn--lg">Start Setup →</Link>
          <Link to="/patient" className="btn btn--outline btn--lg">◉ Patient Mode</Link>
        </div>
      </section>

      {/* ─── TECH STACK ──────────────────────────────── */}
      <section style={{ paddingTop: '2rem', paddingBottom: '4rem', borderTop: '1px solid var(--line)' }}>
        <div className="section-label" style={{ marginBottom: '1.5rem' }}>05 / Built On</div>
        <div className="flex gap-half wrap">
          {['Lambda', 'API Gateway', 'DynamoDB', 'S3', 'SNS', 'EventBridge', 'Amplify', 'CDK', 'Groq Whisper', 'LLaMA 3.3', 'Deepgram Nova-3'].map(s => (
            <span key={s} className="badge badge--muted">{s}</span>
          ))}
        </div>
        <p className="body-sm" style={{ marginTop: '2rem', fontSize: '0.75rem', color: 'var(--text-3)' }}>
          Sahay is an AI companion, not a medical device. Always contact emergency services (112) for life-threatening situations.
          ARDSI Helpline: 1800-200-ARDSI
        </p>
      </section>

    </main>
  );
}
