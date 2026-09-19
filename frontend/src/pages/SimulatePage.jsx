import { useState } from 'react';
import axios from 'axios';
import { API_BASE, DEMO_CAREGIVER_ID, DEMO_PATIENT_ID } from '../App';
import { useToast } from '../components/Toast';

/**
 * Simulate page — test harness required by PROJECT_BRIEF.md §6.
 * Injects fake events to verify each gate without real hardware.
 */

const SCENARIOS = [
  {
    id: 'emergency-chat',
    icon: '🚨',
    title: 'Emergency Chat Message',
    desc: 'Sends an emergency phrase to /chat — should trigger Triage → Escalation → SNS alert',
    color: 'var(--color-danger)',
    action: async (api, caregiverId, toast) => {
      const { data } = await axios.post(`${api}/chat/orchestrate`, {
        caregiverId,
        message: 'She fell down and is not responding. I don\'t know what to do!',
        synthesizeAudio: false,
      });
      const result = data.escalated ? '✅ Escalated correctly! SNS alert fired.' : '❌ NOT escalated — check triage agent';
      toast(`Emergency test: ${result}. Agent: ${data.agentType || 'unknown'}`, data.escalated ? 'success' : 'error', 8000);
      return data;
    },
  },
  {
    id: 'routine-chat',
    icon: '💬',
    title: 'Routine Chat Message',
    desc: 'Normal question — should route to CareGuidanceAgent, NOT escalation',
    color: 'var(--color-safe)',
    action: async (api, caregiverId, toast) => {
      const { data } = await axios.post(`${api}/chat/orchestrate`, {
        caregiverId,
        message: 'She keeps asking me where her mother is. What should I say?',
        synthesizeAudio: false,
      });
      const ok = !data.escalated && data.agentType === 'CARE_GUIDANCE';
      toast(`Routine test: ${ok ? '✅ Correctly routed to Care Guidance' : '⚠️ Unexpected routing: ' + data.agentType}`, ok ? 'success' : 'error', 6000);
      return data;
    },
  },
  {
    id: 'self-harm-chat',
    icon: '💜',
    title: 'Self-Harm Signal',
    desc: 'Caregiver expresses distress — should escalate with SELF_HARM classification',
    color: 'var(--color-warning)',
    action: async (api, caregiverId, toast) => {
      const { data } = await axios.post(`${api}/chat/orchestrate`, {
        caregiverId,
        message: 'I can\'t take this anymore. I feel like I want to end it all.',
        synthesizeAudio: false,
      });
      toast(`Self-harm test: ${data.escalated ? '✅ Escalated (good)' : '❌ NOT escalated — check triage'}. Classification: ${data.classification || 'N/A'}`, data.escalated ? 'success' : 'error', 8000);
      return data;
    },
  },
  {
    id: 'route-deviation',
    icon: '📍',
    title: 'Route Anomaly Event',
    desc: 'Fires a RouteAnomalyDetected EventBridge event — should trigger calming response + SNS to caregiver',
    color: 'var(--color-accent)',
    action: async (api, caregiverId, toast) => {
      const { data } = await axios.post(`${api}/route/simulate`, {
        patientId: DEMO_PATIENT_ID,
        caregiverId,
        anomalyType: 'ROUTE_DEVIATION',
        lat: 22.5750,
        lng: 88.3580,
      });
      toast('Route anomaly event fired! Check EventBridge → calmingResponseAgent → SNS. May take 10-30s.', 'info', 8000);
      return data;
    },
  },
  {
    id: 'burnout-check',
    icon: '💙',
    title: 'Burnout Check (Seed + Trigger)',
    desc: 'Seeds 3 high-distress sessions then manually invokes burnoutChecker — should trigger wellbeing nudge',
    color: 'var(--color-primary)',
    action: async (api, caregiverId, toast) => {
      toast('Step 1: Seeding high-distress sessions via chat...', 'info', 3000);
      // Seed 3 high-distress messages
      const distressMessages = [
        'मैं बहुत थक गई हूँ, नींद नहीं आती, कोई मदद नहीं करता',
        'कभी-कभी लगता है मैं यह और नहीं कर सकती, बहुत मुश्किल है',
        'मुझे अब कोई उम्मीद नहीं दिखती, सब कुछ बहुत भारी लग रहा है',
      ];
      for (const msg of distressMessages) {
        await axios.post(`${api}/chat`, { caregiverId, message: msg, synthesizeAudio: false });
        await new Promise(r => setTimeout(r, 800));
      }
      toast('Step 2: 3 high-distress sessions seeded. In 6h the EventBridge rule will check for burnout. For demo, invoke burnoutChecker directly in the Lambda console.', 'success', 10000);
    },
  },
  {
    id: 'health',
    icon: '❤️',
    title: 'Health Check',
    desc: 'Verifies the API is reachable (Phase 0 gate)',
    color: 'var(--color-safe)',
    action: async (api, caregiverId, toast) => {
      const { data } = await axios.get(`${api}/health`);
      toast(`✅ API healthy! ${JSON.stringify(data)}`, 'success');
      return data;
    },
  },
];

export default function SimulatePage() {
  const toast = useToast();
  const [running, setRunning] = useState(null);
  const [results, setResults] = useState({});

  const run = async (scenario) => {
    setRunning(scenario.id);
    try {
      const data = await scenario.action(API_BASE, DEMO_CAREGIVER_ID, toast);
      setResults(r => ({ ...r, [scenario.id]: { ok: true, data } }));
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      toast(`${scenario.title} failed: ${msg}`, 'error', 6000);
      setResults(r => ({ ...r, [scenario.id]: { ok: false, error: msg } }));
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="page utility-page utility-page--simulator" style={{ maxWidth: 720 }}>
      <div className="mb-3">
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, letterSpacing: '-0.5px', marginBottom: '0.5rem' }}>
          ⚙ Event Simulator
        </h1>
        <p className="text-muted text-sm">
          Test harness required by the project's dependency graph. Inject fake events to verify each gate
          without real GPS hardware or real emergencies.
        </p>
        <div className="debug-panel" style={{ marginTop: '1rem' }}>
          <div className="debug-panel__title">⚠ Debug Mode — Demo / Development Only</div>
          <div className="text-sm text-muted">
            Current API: <code style={{ background: 'var(--color-surface-3)', padding: '0 6px', borderRadius: 4 }}>{API_BASE}</code>
            <br />
            Caregiver ID: <code style={{ background: 'var(--color-surface-3)', padding: '0 6px', borderRadius: 4 }}>{DEMO_CAREGIVER_ID}</code>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {SCENARIOS.map(s => {
          const result = results[s.id];
          const isRunning = running === s.id;

          return (
            <div key={s.id} className="card" style={{ borderLeft: `3px solid ${s.color}` }}>
              <div className="flex justify-between items-center" style={{ marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>{s.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.title}</div>
                    <div className="text-sm text-muted">{s.desc}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0, marginLeft: '1rem' }}>
                  {result && (
                    <span className={`badge badge--${result.ok ? 'safe' : 'danger'}`}>
                      {result.ok ? '✅ Passed' : '❌ Failed'}
                    </span>
                  )}
                  <button
                    id={`simulate-${s.id}`}
                    className="btn btn--secondary"
                    style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                    onClick={() => run(s)}
                    disabled={isRunning || !!running}
                  >
                    {isRunning ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Running...</> : 'Run Test'}
                  </button>
                </div>
              </div>

              {result?.data && (
                <pre style={{
                  background: 'var(--color-bg)', borderRadius: 8, padding: '0.75rem',
                  fontSize: '0.75rem', color: 'var(--color-text-2)', overflow: 'auto',
                  maxHeight: 120, marginTop: '0.75rem',
                }}>
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>

      {/* Gate Checklist */}
      <div className="card" style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
          ✅ Gate Verification Checklist
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[
            { gate: 'Phase 0', desc: 'Health check returns 200 with API URL', scenario: 'health' },
            { gate: '3.1', desc: 'Routine chat returns personalized RAG-grounded response', scenario: 'routine-chat' },
            { gate: '3.2', desc: 'Emergency phrase → Escalation → SNS fires; Routine → CareGuidance', scenario: 'emergency-chat' },
            { gate: '3.3', desc: '3 high-distress sessions → burnout nudge fires (verify in SNS + DynamoDB)', scenario: 'burnout-check' },
            { gate: '3.4a', desc: 'Route anomaly event published to EventBridge', scenario: 'route-deviation' },
            { gate: '3.4b', desc: 'Route anomaly → calming response + caregiver SNS (check CloudWatch + phone)', scenario: 'route-deviation' },
          ].map(item => {
            const r = results[item.scenario];
            return (
              <div key={item.gate} style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
                <span className={`badge badge--${r ? (r.ok ? 'safe' : 'danger') : 'info'}`} style={{ minWidth: 60, justifyContent: 'center' }}>
                  {r ? (r.ok ? '✅' : '❌') : '⬜'} {item.gate}
                </span>
                <span className="text-sm text-muted">{item.desc}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
