import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { API_BASE } from '../App';
import { Volume2, Phone, CheckCircle } from 'lucide-react';

interface BystanderInfo {
  patientName?: string;
  caregiverName?: string;
  caregiverPhone?: string;
  calmedMessage?: string;
}

export default function BystanderPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const [info, setInfo] = useState<BystanderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [called, setCalled] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${API_BASE}/bystander/${patientId}`);
        if (r.ok) setInfo(await r.json());
        else {
          const raw = localStorage.getItem('sahay_patient_profile');
          if (raw) {
            const p = JSON.parse(raw);
            setInfo({ patientName: p.patientName, caregiverName: p.emergencyContactName, caregiverPhone: p.emergencyContactPhone });
          }
        }
      } catch {
        const raw = localStorage.getItem('sahay_patient_profile');
        if (raw) {
          const p = JSON.parse(raw);
          setInfo({ patientName: p.patientName, caregiverName: p.emergencyContactName, caregiverPhone: p.emergencyContactPhone });
        }
      } finally { setLoading(false); }
    };
    load();
  }, [patientId]);

  const calm = () => {
    if (!window.speechSynthesis) return;
    const msg = info?.calmedMessage || `${info?.patientName || 'This person'} is safe. Their family has been notified and is on the way. Please stay calm and speak gently.`;
    const u = new SpeechSynthesisUtterance(msg);
    u.lang = 'en-IN'; u.rate = 0.75;
    window.speechSynthesis.speak(u);
    setCalled(true);
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  );

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 50% 20%, rgba(213,162,70,0.12) 0%, rgba(12,12,20,1) 65%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px',
      fontFamily: 'Manrope, sans-serif',
      textAlign: 'center',
    }}>

      {/* Ambient glow */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: '35vh',
        background: 'radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.1) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} aria-hidden="true" />

      {/* Wordmark */}
      <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', marginBottom: 32, fontWeight: 700 }}>
        Sahay · <span style={{ fontFamily: "'Noto Sans Devanagari', serif" }}>सहाय</span>
      </div>

      {/* Context */}
      <p style={{ fontSize: 14, color: 'var(--c-text-2)', marginBottom: 12, fontWeight: 500 }}>
        You scanned the emergency card of
      </p>

      {/* Patient name — large serif */}
      <h1 className="font-display" style={{
        fontSize: 'clamp(3rem, 12vw, 6rem)',
        fontWeight: 300,
        color: 'var(--c-text-1)',
        letterSpacing: '-3px',
        lineHeight: 1,
        marginBottom: 32,
      }}>
        {info?.patientName || 'This person'}
      </h1>

      {/* Guidance */}
      <div style={{
        maxWidth: 400, marginBottom: 40,
        padding: '20px 24px',
        background: 'rgba(245,158,11,0.07)',
        border: '1px solid rgba(245,158,11,0.2)',
        borderRadius: 16,
      }}>
        <p style={{ fontSize: 15, color: 'rgba(240,240,248,0.75)', lineHeight: 1.75 }}>
          This person may have Alzheimer's and could be disoriented. <strong style={{ color: 'var(--c-text-1)' }}>They are not in danger.</strong> Please stay with them calmly while their family is alerted.
        </p>
      </div>

      {/* Action buttons */}
      <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Calm button */}
        <button
          onClick={calm}
          className="btn"
          aria-label="Play calming message"
          style={{
            width: '100%', fontSize: 16, padding: '18px 24px',
            background: called ? 'rgba(74,222,128,0.12)' : 'var(--c-amber)',
            border: called ? '1px solid rgba(74,222,128,0.3)' : '1px solid transparent',
            color: called ? 'var(--c-calm)' : '#0c0c14',
            fontWeight: 700, borderRadius: 14,
            boxShadow: called ? 'none' : '0 4px 24px rgba(245,158,11,0.4)',
          }}
        >
          {called
            ? <><CheckCircle size={18} strokeWidth={2} /> Playing calm message…</>
            : <><Volume2 size={18} strokeWidth={2} /> Play Calming Message</>
          }
        </button>

        {/* Call caregiver */}
        {info?.caregiverPhone && (
          <a
            href={`tel:${info.caregiverPhone}`}
            aria-label={`Call ${info.caregiverName || 'caregiver'}`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              width: '100%', padding: '16px 24px', borderRadius: 14,
              border: '1px solid var(--c-border-hi)',
              color: 'var(--c-text-1)', fontSize: 15, fontWeight: 600,
              textDecoration: 'none', background: 'rgba(255,255,255,0.04)',
              transition: 'background 0.18s',
            }}
          >
            <Phone size={17} strokeWidth={1.8} />
            Call {info.caregiverName || 'Caregiver'}: {info.caregiverPhone}
          </a>
        )}
      </div>

      {/* Emergency */}
      <p style={{ fontSize: 12, color: 'var(--c-text-4)', marginTop: 36, lineHeight: 1.7 }}>
        For medical emergencies call <strong style={{ color: 'var(--c-text-3)' }}>112</strong>
      </p>
    </div>
  );
}
