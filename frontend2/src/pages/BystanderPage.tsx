import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { API_BASE } from '../App';

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
          // Fallback: read local profile
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
    const msg = info?.calmedMessage || `${info?.patientName || 'This person'} is safe. Their family has been notified and is on the way. Please stay calm.`;
    const u = new SpeechSynthesisUtterance(msg);
    u.lang = 'en-IN'; u.rate = 0.78;
    window.speechSynthesis.speak(u);
    setCalled(true);
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0a0a12', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontFamily: 'Manrope, sans-serif' }}>
      Loading…
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a12', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', fontFamily: 'Manrope, sans-serif', textAlign: 'center' }}>

      <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', marginBottom: 24 }}>SAHAY · सहाय</div>

      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>You scanned the emergency card of</div>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 'clamp(2.5rem, 10vw, 5rem)', fontWeight: 400, color: '#fff', letterSpacing: '-2px', lineHeight: 1, marginBottom: 32 }}>
        {info?.patientName || 'This person'}
      </div>

      <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, maxWidth: 380, marginBottom: 40 }}>
        This person may have Alzheimer's and could be disoriented. They are not in danger. Please stay with them calmly while their family is alerted.
      </p>

      {/* Calm button */}
      <button
        onClick={calm}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          width: '100%', maxWidth: 380, padding: '18px 24px', marginBottom: 16,
          background: called ? 'rgba(74,222,128,0.1)' : '#6366f1',
          border: called ? '1px solid rgba(74,222,128,0.4)' : '1px solid transparent',
          color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'Manrope, sans-serif', transition: 'all 0.2s',
        }}
      >
        {called ? '✓ Playing calming message…' : '▶ Play Calming Message'}
      </button>

      {/* Call caregiver */}
      {info?.caregiverPhone && (
        <a
          href={`tel:${info.caregiverPhone}`}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            width: '100%', maxWidth: 380, padding: '16px 24px',
            border: '1px solid rgba(255,255,255,0.18)', color: '#fff',
            fontSize: 15, fontWeight: 600, textDecoration: 'none',
            fontFamily: 'Manrope, sans-serif',
          }}
        >
          📞 Call {info.caregiverName || 'Caregiver'}: {info.caregiverPhone}
        </a>
      )}

      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', marginTop: 32 }}>
        For medical emergencies call 112
      </p>
    </div>
  );
}
