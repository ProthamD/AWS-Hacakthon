import { useState } from 'react';
import axios from 'axios';
import { API_BASE, DEMO_CAREGIVER_ID } from '../App';
import { useToast } from '../components/Toast';
import { useNavigate } from 'react-router-dom';

const STAGES = [
  { value: 'early', label: 'Early Stage', desc: 'Forgetfulness, some confusion, can do most things independently' },
  { value: 'moderate', label: 'Moderate Stage', desc: 'Significant memory loss, needs help with daily activities' },
  { value: 'severe', label: 'Severe Stage', desc: 'Full-time care needed, limited communication' },
];

export default function OnboardPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    patientName: '',
    patientAge: '',
    dementiaStage: 'moderate',
    keyRelationships: '',
    dailyRoutine: '',
    likesAndDislikes: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    homeAddress: '',
    language: 'hi',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.patientName.trim()) return toast('Patient name is required', 'error');

    setLoading(true);
    try {
      const payload = { caregiverId: DEMO_CAREGIVER_ID, ...form, patientAge: parseInt(form.patientAge) || 0 };
      await axios.post(`${API_BASE}/onboard`, payload);
      // Save profile to localStorage so PatientPage can use it for calming messages
      localStorage.setItem('sahay_patient_profile', JSON.stringify(payload));
      setSaved(true);
      toast('Patient profile saved! The AI will now personalise all advice to your patient.', 'success', 5000);
      setTimeout(() => navigate('/chat'), 2000);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to save profile';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page utility-page utility-page--setup" style={{ maxWidth: 680 }}>
      <div className="mb-3">
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, letterSpacing: '-0.5px', marginBottom: '0.5rem' }}>
          Patient Setup
        </h1>
        <p className="text-muted">
          Tell Sahay about your loved one. This information is stored securely and used to personalise
          all guidance — the AI will reference it specifically, not just give generic advice.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card mb-2">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1.25rem', color: 'var(--color-text-2)' }}>
            👤 Patient Information
          </h2>

          <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="form-group">
              <label className="form-label">Patient's full name *</label>
              <input
                id="patient-name"
                className="form-input"
                placeholder="e.g. Savitri Devi"
                value={form.patientName}
                onChange={e => set('patientName', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Age</label>
              <input
                id="patient-age"
                className="form-input"
                type="number"
                placeholder="e.g. 78"
                value={form.patientAge}
                onChange={e => set('patientAge', e.target.value)}
                min="1" max="120"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Dementia stage *</label>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {STAGES.map(s => (
                <label
                  key={s.value}
                  style={{
                    flex: 1, minWidth: 160, padding: '0.875rem',
                    borderRadius: 'var(--radius-md)',
                    border: `2px solid ${form.dementiaStage === s.value ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    background: form.dementiaStage === s.value ? 'var(--color-primary-glow)' : 'var(--color-surface-2)',
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                >
                  <input
                    type="radio" name="stage" value={s.value}
                    checked={form.dementiaStage === s.value}
                    onChange={() => set('dementiaStage', s.value)}
                    style={{ display: 'none' }}
                  />
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{s.label}</div>
                  <div className="text-xs text-muted">{s.desc}</div>
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Language preference</label>
            <select id="language-select" className="form-select" value={form.language} onChange={e => set('language', e.target.value)}>
              <option value="hi">हिन्दी (Hindi)</option>
              <option value="bn">বাংলা (Bengali)</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        <div className="card mb-2">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1.25rem', color: 'var(--color-text-2)' }}>
            🧩 Personal Context (helps AI personalise responses)
          </h2>

          <div className="form-group">
            <label className="form-label">Key relationships</label>
            <textarea
              id="key-relationships"
              className="form-textarea"
              placeholder="e.g. Her daughter is Priya (lives with her), her son Ravi is in Pune. She often calls Priya by her late sister Meena's name."
              value={form.keyRelationships}
              onChange={e => set('keyRelationships', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Daily routine</label>
            <textarea
              id="daily-routine"
              className="form-textarea"
              placeholder="e.g. Wakes at 6am, morning walk at 7am with Raju the dog, tea at 8am, watches serial at 11am. Sleeps after lunch."
              value={form.dailyRoutine}
              onChange={e => set('dailyRoutine', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Safe Destination / Home Address</label>
            <textarea
              id="home-address"
              className="form-textarea"
              placeholder="e.g. 123 Main St, Apartment 4B, Pune"
              value={form.homeAddress}
              onChange={e => set('homeAddress', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Likes and dislikes</label>
            <textarea
              id="likes-dislikes"
              className="form-textarea"
              placeholder="e.g. Loves classical music (Lata Mangeshkar), enjoys jasmine flowers, dislikes loud noise, gets agitated near traffic."
              value={form.likesAndDislikes}
              onChange={e => set('likesAndDislikes', e.target.value)}
            />
          </div>
        </div>

        <div className="card mb-2">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1.25rem', color: 'var(--color-text-2)' }}>
            🚨 Emergency Contact
          </h2>
          <p className="text-sm text-muted" style={{ marginBottom: '1rem' }}>
            This person receives an SMS/call alert if Sahay detects an emergency.
          </p>

          <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="form-group">
              <label className="form-label">Contact name</label>
              <input
                id="emergency-name"
                className="form-input"
                placeholder="e.g. Priya Sharma"
                value={form.emergencyContactName}
                onChange={e => set('emergencyContactName', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Phone number</label>
              <input
                id="emergency-phone"
                className="form-input"
                type="tel"
                placeholder="e.g. +91 98765 43210"
                value={form.emergencyContactPhone}
                onChange={e => set('emergencyContactPhone', e.target.value)}
              />
            </div>
          </div>
        </div>

        <button
          id="save-profile-btn"
          type="submit"
          className={`btn btn--primary btn--full btn--lg ${loading || saved ? '' : ''}`}
          disabled={loading || saved}
        >
          {loading ? <><div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /> Saving...</>
           : saved ? '✅ Saved! Redirecting to chat...'
           : 'Save Patient Profile →'}
        </button>
      </form>
    </div>
  );
}
