import { useParams } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { API_BASE } from '../App';

/**
 * Bystander landing page — no login required, full screen, calming design.
 * Reached by scanning the QR code printed on the patient's card.
 * Shows: calming message, patient name, caregiver contact, "help is coming" UI.
 */
export default function BystanderPage() {
  const { patientId } = useParams();
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [calmingText, setCalmingText] = useState('');
  const [audioUrl, setAudioUrl] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [triggered, setTriggered] = useState(false);
  const audioRef = useRef(null);

  // Trigger calming flow when page loads (simulates the bystander scanning the QR)
  useEffect(() => {
    const trigger = async () => {
      try {
        // Use the simulate endpoint to fire the route anomaly + calming flow
        // In production: this would be a dedicated bystander endpoint
        const { data } = await axios.post(`${API_BASE}/route/simulate`, {
          patientId: patientId,
          caregiverId: 'demo-caregiver-001', // In production: look up from patient ID
          anomalyType: 'BYSTANDER_TRIGGER',
          lat: 0,
          lng: 0,
        });

        // Poll for calming response (in production: use WebSocket or polling)
        // For demo: show pre-set calming text while event propagates
        setTimeout(async () => {
          setCalmingText(
            'नमस्ते। आप सुरक्षित हैं।\n\nयहीं रुकिए — आपकी मदद आ रही है। ' +
            'आपका परिवार आपको ढूंढ रहा है।\n\n' +
            '(Hello! You are safe. Please stay where you are. Your family is looking for you.)'
          );
          setStatus('ready');
        }, 1500);

        setTriggered(true);
      } catch (err) {
        // Even if the backend call fails, show the calming screen
        setCalmingText(
          'नमस्ते। आप सुरक्षित हैं।\n\nयहीं रुकिए। मदद आ रही है।\n\n' +
          '(Hello! You are safe. Please stay here. Help is coming.)'
        );
        setStatus('ready');
      }
    };
    trigger();
  }, [patientId]);

  const playAudio = () => {
    if (audioRef.current) {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  if (status === 'loading') {
    return (
      <div className="calming-screen">
        <div style={{ textAlign: 'center', color: '#a5b4fc' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💙</div>
          <div style={{ fontSize: '1.2rem' }}>Connecting...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="calming-screen">
      <div className="calming-card">
        {/* Pulsing heart */}
        <div style={{ fontSize: '3.5rem', marginBottom: '1rem', animation: 'calming-pulse 2s ease-in-out infinite' }}>
          💙
        </div>

        <div className="calming-name">
          सहाय · Sahay
        </div>

        <div style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '1.5rem' }}>
          यह संदेश आपके लिए है · This message is for you
        </div>

        {/* Calming message */}
        <div className="calming-message" style={{ whiteSpace: 'pre-line' }}>
          {calmingText}
        </div>

        {/* Audio button */}
        {audioUrl ? (
          <>
            <audio ref={audioRef} src={audioUrl} onEnded={() => setPlaying(false)} />
            <button className="calming-audio-btn" onClick={playAudio} id="play-calming-audio">
              {playing ? '⏸' : '▶'}
            </button>
            <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              {playing ? 'Playing message...' : 'Tap to hear the message'}
            </div>
          </>
        ) : (
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'rgba(99,102,241,0.15)',
            border: '2px solid rgba(99,102,241,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2rem', margin: '0 auto 1.5rem',
          }}>
            💙
          </div>
        )}

        {/* Emergency contact */}
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16, padding: '1.25rem', marginBottom: '1.5rem', textAlign: 'left',
        }}>
          <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.5rem' }}>Emergency Contact / आपातकालीन संपर्क</div>
          <div style={{ fontWeight: 600, fontSize: '1.1rem', color: '#e2e8f0' }}>📞 Caregiver alerted</div>
          <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.25rem' }}>
            We have sent an alert with your location. They are coming to you.
          </div>
        </div>

        {/* Bystander instructions */}
        <div style={{
          background: 'rgba(245,158,11,0.1)',
          border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 12, padding: '1rem', textAlign: 'left',
        }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f59e0b', marginBottom: '0.5rem' }}>
            📢 For the bystander:
          </div>
          <ul style={{ fontSize: '0.85rem', color: '#e2e8f0', paddingLeft: '1.25rem', lineHeight: 2 }}>
            <li>Please stay with this person until help arrives</li>
            <li>This person may have Alzheimer's and be confused</li>
            <li>Speak calmly and slowly</li>
            <li>Emergency: <strong>112</strong> | Police: <strong>100</strong></li>
          </ul>
        </div>

        <div style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#475569' }}>
          Sahay AI · Not a medical device · ID: {patientId}
        </div>
      </div>
    </div>
  );
}
