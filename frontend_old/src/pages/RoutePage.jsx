import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { API_BASE, DEMO_CAREGIVER_ID, DEMO_PATIENT_ID } from '../App';
import { useToast } from '../components/Toast';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';

const STATUS_COLORS = {
  OK: 'var(--color-safe)',
  ANOMALY_DETECTED: 'var(--color-danger)',
  NO_ACTIVE_ROUTE: 'var(--color-text-3)',
  NO_ROUTE_CONFIGURED: 'var(--color-text-3)',
};

export default function RoutePage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [routeStatus, setRouteStatus] = useState(null);
  const [configuring, setConfiguring] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [bystanderUrl, setBystanderUrl] = useState(null);
  const [generatingQr, setGeneratingQr] = useState(false);
  const qrCanvasRef = useRef(null);

  const [routeForm, setRouteForm] = useState({
    routeDescription: '12B Bus — Home to Market',
    originLat: '22.5726',
    originLng: '88.3639',
    destinationLat: '22.5800',
    destinationLng: '88.3700',
    expectedArrivalISO: '',
    maxDeviationMeters: '500',
    maxStationaryMinutes: '10',
  });

  const [pingForm, setPingForm] = useState({
    lat: '22.5726',
    lng: '88.3639',
  });

  const setRoute = (k, v) => setRouteForm(f => ({ ...f, [k]: v }));
  const setPing = (k, v) => setPingForm(f => ({ ...f, [k]: v }));

  const configureRoute = async (e) => {
    e.preventDefault();
    setConfiguring(true);
    try {
      await axios.post(`${API_BASE}/route/configure`, {
        patientId: DEMO_PATIENT_ID,
        caregiverId: DEMO_CAREGIVER_ID,
        ...routeForm,
        originLat: parseFloat(routeForm.originLat),
        originLng: parseFloat(routeForm.originLng),
        destinationLat: parseFloat(routeForm.destinationLat),
        destinationLng: parseFloat(routeForm.destinationLng),
        maxDeviationMeters: parseInt(routeForm.maxDeviationMeters),
        maxStationaryMinutes: parseInt(routeForm.maxStationaryMinutes),
        expectedArrivalISO: routeForm.expectedArrivalISO || undefined,
      });
      toast('Route configured! The system will now monitor for deviations.', 'success');
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to configure route', 'error');
    } finally {
      setConfiguring(false);
    }
  };

  const sendPing = async () => {
    setPinging(true);
    try {
      const { data } = await axios.post(`${API_BASE}/route/ping`, {
        patientId: DEMO_PATIENT_ID,
        lat: parseFloat(pingForm.lat),
        lng: parseFloat(pingForm.lng),
        timestamp: new Date().toISOString(),
      });
      setRouteStatus(data);
      if (data.status === 'ANOMALY_DETECTED') {
        toast('🚨 Route anomaly detected! Calming flow triggered + caregiver alerted.', 'error', 6000);
      } else {
        toast(`Location ping: ${data.status} — ${data.distFromDestinationM || 0}m from destination`, 'success');
      }
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to send location ping', 'error');
    } finally {
      setPinging(false);
    }
  };

  const generateQr = async () => {
    setGeneratingQr(true);
    try {
      const { data } = await axios.post(`${API_BASE}/qr/generate`, {
        patientId: DEMO_PATIENT_ID,
        caregiverId: DEMO_CAREGIVER_ID,
      });
      const url = data.bystanderUrl;
      setBystanderUrl(url);
      // Generate real QR code on the frontend
      const dataUrl = await QRCode.toDataURL(url, {
        width: 300,
        margin: 2,
        color: { dark: '#1c2440', light: '#ffffff' },
      });
      setQrDataUrl(dataUrl);
      toast('QR code generated! Print and attach to patient\'s ID.', 'success');
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to generate QR code', 'error');
    } finally {
      setGeneratingQr(false);
    }
  };

  return (
    <div className="page utility-page utility-page--route" style={{ maxWidth: 720 }}>
      <div className="mb-3">
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, letterSpacing: '-0.5px', marginBottom: '0.5rem' }}>
          Route Safety Monitor
        </h1>
        <p className="text-muted text-sm">
          Set an expected route for your patient. If they deviate, a calming voice message plays automatically
          and you get an alert.
        </p>
      </div>

      {/* Current status banner */}
      {routeStatus && (
        <div className="card mb-2" style={{
          borderColor: STATUS_COLORS[routeStatus.status] || 'var(--color-border)',
          marginBottom: '1.25rem',
        }}>
          <div className="flex items-center gap-1" style={{ gap: '0.75rem' }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: STATUS_COLORS[routeStatus.status], flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600 }}>Status: {routeStatus.status}</div>
              {routeStatus.anomalies?.map((a, i) => (
                <div key={i} className="text-sm text-muted">{a.type}: {a.detail}</div>
              ))}
              {routeStatus.distFromDestinationM !== undefined && (
                <div className="text-sm text-muted">{routeStatus.distFromDestinationM}m from destination</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Configure route */}
      <div className="card mb-2" style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1.25rem', color: 'var(--color-text-2)' }}>
          📍 Configure Expected Route
        </h2>
        <form onSubmit={configureRoute}>
          <div className="form-group">
            <label className="form-label">Route description</label>
            <input className="form-input" placeholder="e.g. 12B bus from home to market" value={routeForm.routeDescription} onChange={e => setRoute('routeDescription', e.target.value)} />
          </div>
          <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="form-group">
              <label className="form-label">Origin latitude</label>
              <input className="form-input" type="number" step="0.0001" value={routeForm.originLat} onChange={e => setRoute('originLat', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Origin longitude</label>
              <input className="form-input" type="number" step="0.0001" value={routeForm.originLng} onChange={e => setRoute('originLng', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Destination latitude</label>
              <input className="form-input" type="number" step="0.0001" value={routeForm.destinationLat} onChange={e => setRoute('destinationLat', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Destination longitude</label>
              <input className="form-input" type="number" step="0.0001" value={routeForm.destinationLng} onChange={e => setRoute('destinationLng', e.target.value)} />
            </div>
          </div>
          <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="form-group">
              <label className="form-label">Max deviation (meters)</label>
              <input className="form-input" type="number" value={routeForm.maxDeviationMeters} onChange={e => setRoute('maxDeviationMeters', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Max stationary (minutes)</label>
              <input className="form-input" type="number" value={routeForm.maxStationaryMinutes} onChange={e => setRoute('maxStationaryMinutes', e.target.value)} />
            </div>
          </div>
          <button id="configure-route-btn" type="submit" className="btn btn--primary" disabled={configuring}>
            {configuring ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Configuring...</> : 'Set Route'}
          </button>
        </form>
      </div>

      {/* Location ping */}
      <div className="card mb-2" style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1.25rem', color: 'var(--color-text-2)' }}>
          📡 Send Location Ping
        </h2>
        <p className="text-sm text-muted" style={{ marginBottom: '1rem' }}>
          In production, pings come from the patient's phone. Here, enter coordinates manually (or use Simulate page to inject anomalies).
        </p>
        <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Latitude</label>
            <input className="form-input" type="number" step="0.0001" value={pingForm.lat} onChange={e => setPing('lat', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Longitude</label>
            <input className="form-input" type="number" step="0.0001" value={pingForm.lng} onChange={e => setPing('lng', e.target.value)} />
          </div>
        </div>
        <button id="send-ping-btn" className="btn btn--secondary" onClick={sendPing} disabled={pinging}>
          {pinging ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Sending...</> : '📍 Send Ping'}
        </button>
      </div>

      {/* Patient Companion Mode */}
      <div className="card mb-2" style={{ marginBottom: '1.25rem', borderColor: 'var(--color-primary)', background: 'linear-gradient(135deg, var(--color-surface) 0%, rgba(99,102,241,0.08) 100%)' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--color-primary-light)' }}>
          🎤 Patient Companion Mode
        </h2>
        <p className="text-sm text-muted" style={{ marginBottom: '1rem' }}>
          Open the patient-facing app on the patient's phone or tablet. It listens in the background for distress phrases
          ("where am I", "help") and automatically records a 10-second clip and alerts you — without the patient needing to do anything.
        </p>
        <button
          id="open-patient-mode-btn"
          className="btn btn--primary"
          onClick={() => navigate('/patient')}
        >
          🎤 Open Patient Companion App
        </button>
      </div>

      {/* QR Code */}
      <div className="card">
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--color-text-2)' }}>
          🔲 Bystander QR Code
        </h2>
        <p className="text-sm text-muted" style={{ marginBottom: '1rem' }}>
          Generate a printable QR card. Any bystander who finds your patient can scan it to get caregiver contact and play a calming message.
        </p>
        <button id="generate-qr-btn" className="btn btn--secondary" onClick={generateQr} disabled={generatingQr}>
          {generatingQr ? 'Generating...' : '🔲 Generate QR Code'}
        </button>
        {qrDataUrl && (
          <div style={{ marginTop: '1rem' }}>
            <div className="text-sm text-muted mb-2" style={{ marginBottom: '0.75rem' }}>
              Bystander URL: <a href={bystanderUrl} target="_blank" rel="noopener noreferrer">{bystanderUrl}</a>
            </div>
            <img
              src={qrDataUrl}
              alt="Patient QR Code"
              style={{ width: 200, borderRadius: 12, border: '4px solid var(--color-border)', display: 'block' }}
            />
            <div className="text-xs text-muted mt-2" style={{ marginTop: '0.5rem' }}>Print this and attach to patient's ID card or bag</div>
            <a
              href={qrDataUrl}
              download="sahay-patient-qr.png"
              className="btn btn--secondary mt-2"
              style={{ marginTop: '0.75rem', display: 'inline-flex' }}
            >
              ⬇ Download QR
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
