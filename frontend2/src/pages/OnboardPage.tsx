import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, ChevronRight } from 'lucide-react';

const FIELD_META = [
  { key: 'patientName',              label: 'Patient Name',              type: 'text',  placeholder: 'e.g. Meera Sharma' },
  { key: 'patientAge',               label: 'Age',                       type: 'number',placeholder: 'e.g. 74' },
  { key: 'homeAddress',              label: 'Home Address',              type: 'text',  placeholder: 'Full address for route guidance' },
  { key: 'emergencyContactName',     label: 'Caregiver Name',            type: 'text',  placeholder: 'e.g. Priya Sharma' },
  { key: 'emergencyContactPhone',    label: 'Caregiver Phone (with +91)',type: 'tel',   placeholder: '+91 98765 43210' },
  { key: 'patientLanguage',          label: 'Primary Language',          type: 'select',options: ['English', 'Hindi', 'Bengali', 'Tamil', 'Telugu', 'Kannada', 'Marathi', 'Gujarati'] },
  { key: 'memories',                 label: 'Personal Memories (optional)', type: 'textarea', placeholder: 'e.g. Loves morning tea, used to teach primary school, favourite song is...' },
];

const EMPTY: Record<string, string> = FIELD_META.reduce((a, f) => ({ ...a, [f.key]: '' }), {});

export default function OnboardPage() {
  const nav = useNavigate();
  const [form, setForm] = useState<Record<string, string>>(() => {
    try { return { ...EMPTY, ...JSON.parse(localStorage.getItem('sahay_patient_profile') || '{}') }; }
    catch { return EMPTY; }
  });
  const [saved, setSaved] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = () => {
    try {
      localStorage.setItem('sahay_patient_profile', JSON.stringify(form));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  };

  return (
    <div className="font-ui" style={{ maxWidth: 560, margin: '0 auto', padding: '40px 20px' }}>

      {/* Section label */}
      <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(99,102,241,0.8)', marginBottom: 20, fontWeight: 600 }}>
        02 / Patient Setup
      </div>

      <h1 className="font-display" style={{ fontSize: 'clamp(1.8rem, 5vw, 2.8rem)', fontWeight: 400, lineHeight: 1.1, color: '#fff', marginBottom: 10, letterSpacing: '-1px' }}>
        Set up once.<br />
        <em style={{ color: 'rgba(255,255,255,0.45)', fontStyle: 'italic' }}>Sahay handles the rest.</em>
      </h1>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.65, marginBottom: 36 }}>
        This information stays on your device. It helps Sahay personalise responses and contact the right person in an emergency.
      </p>

      {/* Form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {FIELD_META.map(f => (
          <div key={f.key}>
            <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 8, fontWeight: 600 }}>
              {f.label}
            </label>
            {f.type === 'select' ? (
              <select className="input-field" value={form[f.key]} onChange={e => set(f.key, e.target.value)}>
                <option value="">Select language</option>
                {f.options!.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea className="input-field" value={form[f.key]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} rows={3} />
            ) : (
              <input className="input-field" type={f.type} value={form[f.key]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} />
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, marginTop: 32, flexWrap: 'wrap' }}>
        <button
          onClick={save}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: saved ? 'rgba(74,222,128,0.15)' : '#6366f1',
            border: saved ? '1px solid rgba(74,222,128,0.4)' : '1px solid transparent',
            color: '#fff', padding: '11px 20px',
            fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
            cursor: 'pointer', fontFamily: 'Manrope, sans-serif',
            transition: 'background 0.25s',
          }}
        >
          <Save size={15} strokeWidth={1.8} />
          {saved ? 'Saved ✓' : 'Save Profile'}
        </button>
        <button
          onClick={() => { save(); nav('/patient'); }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.18)',
            color: 'rgba(255,255,255,0.7)', padding: '11px 20px',
            fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
            cursor: 'pointer', fontFamily: 'Manrope, sans-serif',
          }}
        >
          Open Patient Mode
          <ChevronRight size={15} strokeWidth={1.8} />
        </button>
      </div>

      {/* Disclaimer */}
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', marginTop: 28, lineHeight: 1.6 }}>
        Sahay is an AI companion, not a medical device. For emergencies call 112. ARDSI Helpline: 1800-200-ARDSI.
      </p>
    </div>
  );
}
