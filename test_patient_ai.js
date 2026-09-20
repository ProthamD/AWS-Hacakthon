/**
 * test_patient_ai.js — Patient Page AI Test Suite
 *
 * Tests the /patient/voice endpoint (voiceCompanionHandler) for:
 *  - Correct intent classification
 *  - Distress score accuracy
 *  - Non-empty spoken responses
 *  - Fallback / edge cases
 *
 * Run: node test_patient_ai.js
 */

const API_BASE = 'https://m4fcfzmsa7.execute-api.ap-south-1.amazonaws.com/prod';
const ENDPOINT = `${API_BASE}/patient/voice`;

const DEMO_PROFILE = {
  patientName: 'Shyamala Devi',
  patientAge: '72',
  dementiaStage: 'moderate',
  homeAddress: '12 Lalbagh Road, Bangalore',
  scheduledDestination: 'City Hospital, MG Road, Bangalore',
  emergencyContactName: 'Ravi',
  emergencyContactPhone: '+91-9876543210',
  keyRelationships: 'Son: Ravi, Daughter: Priya',
  dailyRoutine: 'Morning walk at 7am, lunch at 1pm, nap at 3pm',
};

/* ── ANSI colours ─────────────────────────────────────── */
const green  = (s) => `\x1b[32m${s}\x1b[0m`;
const red    = (s) => `\x1b[31m${s}\x1b[0m`;
const cyan   = (s) => `\x1b[36m${s}\x1b[0m`;
const bold   = (s) => `\x1b[1m${s}\x1b[0m`;

/* ── Test runner ──────────────────────────────────────── */
let passed = 0, failed = 0;
const results = [];

async function callVoiceAI(transcript, extraProfile = {}) {
  const profile = { ...DEMO_PROFILE };
  // Apply overrides, allowing removal via undefined
  for (const [k, v] of Object.entries(extraProfile)) {
    if (v === undefined) delete profile[k];
    else profile[k] = v;
  }
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, patientProfile: profile, sessionHistory: [] }),
  });
  const raw = await res.json();
  // API Gateway wraps in body string; Lambda direct returns plain object
  return (raw.body && typeof raw.body === 'string') ? JSON.parse(raw.body) : raw;
}

async function test(label, transcript, checks, extraProfile = {}) {
  process.stdout.write(`  ${cyan('►')} ${label}... `);
  try {
    const body = await callVoiceAI(transcript, extraProfile);
    const failures = [];

    for (const [key, expected] of Object.entries(checks)) {
      const actual = body[key];
      if (key === 'intent' && actual !== expected) {
        failures.push(`intent: got "${actual}", want "${expected}"`);
      } else if (key === 'distressScore_gte' && actual < expected) {
        failures.push(`distressScore: got ${actual}, want >= ${expected}`);
      } else if (key === 'distressScore_lte' && actual > expected) {
        failures.push(`distressScore: got ${actual}, want <= ${expected}`);
      } else if (key === 'isDistress' && actual !== expected) {
        failures.push(`isDistress: got ${actual}, want ${expected}`);
      } else if (key === 'hasResponse' && expected === true && (!body.response || body.response.length < 3)) {
        failures.push(`response: got empty or too short: "${body.response}"`);
      } else if (key === 'shouldAlertCaregiver' && actual !== expected) {
        failures.push(`shouldAlertCaregiver: got ${actual}, want ${expected}`);
      }
    }

    if (failures.length === 0) {
      console.log(green('PASS'));
      console.log(`    intent="${body.intent}" | distress=${body.distressScore} | alert=${body.shouldAlertCaregiver}`);
      console.log(`    response: "${(body.response || '').slice(0, 90)}"`);
      passed++;
      results.push({ label, status: 'PASS' });
    } else {
      console.log(red('FAIL'));
      for (const f of failures) console.log(`    ${red('✗')} ${f}`);
      console.log(`    intent="${body.intent}" | distress=${body.distressScore}`);
      console.log(`    response: "${(body.response || '').slice(0, 90)}"`);
      failed++;
      results.push({ label, status: 'FAIL', failures });
    }
  } catch (err) {
    console.log(red('ERROR'));
    console.log(`    ${red(err.message)}`);
    failed++;
    results.push({ label, status: 'ERROR', error: err.message });
  }
}

/* ── Test Cases ───────────────────────────────────────── */
async function runAll() {
  console.log(bold('\n🧠 Sahay Patient AI Test Suite'));
  console.log(`   Endpoint: ${ENDPOINT}`);
  console.log(`   Patient:  ${DEMO_PROFILE.patientName}, ${DEMO_PROFILE.patientAge}y, ${DEMO_PROFILE.dementiaStage} stage\n`);

  // ── GROUP 1: Identity / Name ──────────────────────────
  console.log(bold('─── Group 1: Identity / Name Queries ───'));
  await test('Asks own name', 'What is my name?', { intent: 'name_query', hasResponse: true, distressScore_lte: 5 });
  await test('Who am I', 'Who am I? I cannot remember.', { intent: 'name_query', hasResponse: true });

  // ── GROUP 2: Navigation / Destination ────────────────
  console.log(bold('\n─── Group 2: Navigation / Destination ───'));
  await test('Where do I go', 'Where do I need to go today?', { intent: 'destination_query', hasResponse: true });
  await test('How do I get home', 'How do I get home?', { intent: 'destination_query', hasResponse: true });
  await test('Show me the route', 'Show me the route home please.', { intent: 'destination_query', hasResponse: true });
  await test('Which way should I go', 'Which way should I go?', { intent: 'destination_query', hasResponse: true });

  // ── GROUP 3: Lost ─────────────────────────────────────
  console.log(bold('\n─── Group 3: Lost / Disorientation ───'));
  await test("I am lost", "I am lost, I don't know where I am.", { intent: 'lost', hasResponse: true, distressScore_gte: 5, isDistress: true });
  await test('Where am I', 'Where am I?', { intent: 'lost', hasResponse: true, isDistress: true });

  // ── GROUP 4: Scared / Distress ────────────────────────
  console.log(bold('\n─── Group 4: Fear / Distress ───'));
  await test("I am scared", "I am scared, I don't feel safe here.", { intent: 'scared', hasResponse: true, distressScore_gte: 7, isDistress: true });
  await test('Emergency - fell down', 'I fell down and I cannot get up.', { distressScore_gte: 8, hasResponse: true, isDistress: true, shouldAlertCaregiver: true });

  // ── GROUP 5: Greeting ─────────────────────────────────
  console.log(bold('\n─── Group 5: Greetings ───'));
  await test('Hello Sahay', 'Hello Sahay', { intent: 'greeting', hasResponse: true, distressScore_lte: 3 });
  await test('Who are you', 'Who are you?', { intent: 'greeting', hasResponse: true, distressScore_lte: 2 });

  // ── GROUP 6: Noise / Ignore ───────────────────────────
  console.log(bold('\n─── Group 6: Background Noise / Ignore ───'));
  await test('Irrelevant chatter', 'Hey Ravi, please pass the salt.', { intent: 'ignore' });

  // ── GROUP 7: Edge Cases ───────────────────────────────
  console.log(bold('\n─── Group 7: Edge Cases ───'));
  await test(
    'Lost with empty profile',
    "I am lost, where am I?",
    { hasResponse: true, isDistress: true },
    { patientName: undefined, homeAddress: undefined, emergencyContactName: undefined }
  );
  await test('Single word - help', 'help', { hasResponse: true, isDistress: true });

  /* ── Summary ────────────────────────────────────────── */
  const total = passed + failed;
  const pct   = Math.round((passed / total) * 100);

  console.log(bold(`\n${'═'.repeat(55)}`));
  console.log(bold(`  Results: ${passed}/${total} passed  (${pct}%)`));
  if (failed > 0) {
    console.log(red(`  ${failed} test(s) FAILED:`));
    results.filter(r => r.status !== 'PASS').forEach(r => {
      console.log(red(`    ✗ ${r.label}`));
      if (r.failures) r.failures.forEach(f => console.log(red(`      └─ ${f}`)));
      if (r.error) console.log(red(`      └─ ${r.error}`));
    });
  } else {
    console.log(green('  ✅  All tests passed!'));
  }
  console.log(bold(`${'═'.repeat(55)}\n`));
  process.exit(failed > 0 ? 1 : 0);
}

runAll().catch(e => {
  console.error(red('\nFatal error running tests:'), e);
  process.exit(1);
});
