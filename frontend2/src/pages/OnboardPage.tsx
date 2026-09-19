import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, ArrowRight, CheckCircle, Info } from 'lucide-react';

interface FieldMeta {
  key: string;
  label: string;
  type: string;
  placeholder?: string;
  options?: string[];
  hint?: string;
}

const FIELD_META: FieldMeta[] = [
  { key: 'patientName',           label: 'Patient Name',              type: 'text',     placeholder: 'e.g. Meera Sharma', hint: 'Full name as the patient recognises it' },
  { key: 'patientAge',            label: 'Age',                       type: 'number',   placeholder: 'e.g. 74' },
  { key: 'homeAddress',           label: 'Home Address',              type: 'text',     placeholder: 'Full address for route guidance' },
  { key: 'emergencyContactName',  label: 'Caregiver / Contact Name',  type: 'text',     placeholder: 'e.g. Priya Sharma' },
  { key: 'emergencyContactPhone', label: 'Caregiver Phone',           type: 'tel',      placeholder: '+91 98765 43210' },
  { key: 'patientLanguage',       label: 'Primary Language',          type: 'select',   options: ['English', 'Hindi', 'Bengali', 'Tamil', 'Telugu', 'Kannada', 'Marathi', 'Gujarati'] },
  { key: 'memories',              label: 'Personal Notes & Memories', type: 'textarea', placeholder: 'e.g. Loves morning chai, used to teach school, favourite song is Lag Ja Gale…', hint: 'Sahay uses this to personalise responses' },
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
      setTimeout(() => setSaved(false), 2400);
    } catch {}
  };

  const filledCount = FIELD_META.filter(f => form[f.key]?.trim()).length;
  const progress = Math.round((filledCount / FIELD_META.length) * 100);

  return (
    <div className="font-ui page-container" style={{ maxWidth: 600 }}>

      {/* Header */}
      <div className="anim-fade-up" style={{ marginBottom: 36 }}>
        <div className="section-label" style={{ marginBottom: 12 }}>02 / Patient Setup</div>
        <h1 className="font-display" style={{
          fontSize: 'clamp(2rem, 5vw, 3rem)',
          fontWeight: 300,
          lineHeight: 1.1,
          color: 'var(--c-text-1)',
          letterSpacing: '-1.5px',
          marginBottom: 12,
        }}>
          Set up once.<br />
          <em style={{ color: 'var(--c-text-2)', fontStyle: 'italic' }}>Sahay handles the rest.</em>
        </h1>
        <p style={{ fontSize: 14, color: 'var(--c-text-2)', lineHeight: 1.7, maxWidth: 460 }}>
          This information stays on your device. Sahay uses it to personalise care responses and alert the right person in emergencies.
        </p>
      </div>

      {/* Progress bar */}
      <div className="anim-fade-up glass-card" style={{ animationDelay: '0.07s', padding: '16px 20px', marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--c-text-2)', fontWeight: 600 }}>Profile completeness</span>
          <span style={{ fontSize: 12, color: filledCount === FIELD_META.length ? 'var(--c-calm)' : 'var(--c-accent)', fontWeight: 700 }}>{progress}%</span>
        </div>
        <div style={{ height: 4, background: 'var(--c-border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${progress}%`,
            background: progress === 100 ? 'var(--c-calm)' : 'linear-gradient(90deg, var(--c-accent), var(--c-accent-2))',
            borderRadius: 2,
            transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1)',
          }} />
        </div>
      </div>

      {/* Form */}
      <div className="anim-fade-up" style={{ animationDelay: '0.12s', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {FIELD_META.map(f => (
          <div key={f.key} className="glass-card" style={{ padding: '18px 20px' }}>
            {/* Label row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <label
                htmlFor={`field-${f.key}`}
                style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}
              >
                {f.label}
              </label>
              {form[f.key]?.trim() && (
                <CheckCircle size={11} strokeWidth={2} style={{ color: 'var(--c-calm)', flexShrink: 0 }} />
              )}
            </div>

            {f.type === 'select' ? (
              <select
                id={`field-${f.key}`}
                className="input-field"
                value={form[f.key]}
                onChange={e => set(f.key, e.target.value)}
              >
                <option value="">Select language…</option>
                {f.options!.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea
                id={`field-${f.key}`}
                className="input-field"
                value={form[f.key]}
                onChange={e => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                rows={3}
              />
            ) : (
              <input
                id={`field-${f.key}`}
                className="input-field"
                type={f.type}
                value={form[f.key]}
                onChange={e => set(f.key, e.target.value)}
                placeholder={f.placeholder}
              />
            )}

            {f.hint && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8 }}>
                <Info size={10} strokeWidth={1.5} style={{ color: 'var(--c-text-4)', flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'var(--c-text-4)', lineHeight: 1.5 }}>{f.hint}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="anim-fade-up" style={{ animationDelay: '0.2s', display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
        <button
          onClick={save}
          className="btn"
          style={{
            background: saved ? 'rgba(74,222,128,0.15)' : 'var(--c-accent)',
            border: saved ? '1px solid rgba(74,222,128,0.35)' : '1px solid transparent',
            color: '#fff',
            boxShadow: saved ? 'none' : '0 2px 16px rgba(124,111,250,0.35)',
          }}
        >
          {saved ? (
            <><CheckCircle size={15} strokeWidth={2} style={{ color: 'var(--c-calm)' }} /> Saved!</>
          ) : (
            <><Save size={14} strokeWidth={1.8} /> Save Profile</>
          )}
        </button>
        <button
          onClick={() => { save(); nav('/patient'); }}
          className="btn btn-ghost"
        >
          Open Patient Mode <ArrowRight size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Disclaimer */}
      <div className="anim-fade-up" style={{ animationDelay: '0.25s', marginTop: 32, padding: '14px 18px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--c-border)', borderRadius: 8 }}>
        <p style={{ fontSize: 12, color: 'var(--c-text-4)', lineHeight: 1.65 }}>
          <strong style={{ color: 'var(--c-text-3)' }}>Privacy:</strong> All data is stored locally on this device and never sent to external servers without your action. Sahay is an AI companion, not a medical device. For emergencies call <strong style={{ color: 'var(--c-text-3)' }}>112</strong>. ARDSI Helpline: <strong style={{ color: 'var(--c-text-3)' }}>1800-200-ARDSI</strong>.
        </p>
      </div>
    </div>
  );
}
