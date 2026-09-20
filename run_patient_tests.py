import urllib.request, json, sys

API = 'https://m4fcfzmsa7.execute-api.ap-south-1.amazonaws.com/prod/patient/voice'
PROFILE = {
    'patientName': 'Shyamala Devi', 'patientAge': '72', 'dementiaStage': 'moderate',
    'homeAddress': '12 Lalbagh Road, Bangalore',
    'scheduledDestination': 'City Hospital, MG Road, Bangalore',
    'emergencyContactName': 'Ravi', 'emergencyContactPhone': '+91-9876543210',
    'keyRelationships': 'Son: Ravi, Daughter: Priya',
    'dailyRoutine': 'Morning walk at 7am, lunch at 1pm',
}

TESTS = [
    # (transcript,                                 exp_intent,          isDistress, shouldAlert, dist_min, dist_max)
    ('What is my name?',                           'name_query',        None,       None,        None,     5),
    ('Who am I? I cannot remember.',               'name_query',        None,       None,        None,     None),
    ('Where do I need to go today?',               'destination_query', None,       None,        None,     None),
    ('How do I get home?',                         'destination_query', None,       None,        None,     None),
    ('I am lost, I dont know where I am.',         'lost',              True,       None,        5,        None),
    ('Where am I?',                                'lost',              True,       None,        None,     None),
    ('I am scared, I dont feel safe here.',        'scared',            True,       None,        7,        None),
    ('I fell down and I cannot get up.',           None,                True,       True,        8,        None),
    ('Hello Sahay',                                'greeting',          None,       None,        None,     3),
    ('Who are you?',                               'greeting',          None,       None,        None,     2),
    ('Hey Ravi please pass the salt.',             'ignore',            None,       None,        None,     None),
    ('help',                                       None,                True,       None,        None,     None),
]

passed = failed = 0
print()
print('  Sahay Patient AI - Live Test Results')
print('  ' + '='*60)

for (tx, exp_intent, exp_distress, exp_alert, dist_min, dist_max) in TESTS:
    payload = json.dumps({'transcript': tx, 'patientProfile': PROFILE, 'sessionHistory': []}).encode()
    req = urllib.request.Request(API, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            raw = json.loads(resp.read())
    except Exception as e:
        print(f'  [ERROR] [{tx[:40]}]: {e}')
        failed += 1
        continue

    body = json.loads(raw['body']) if isinstance(raw.get('body'), str) else raw
    intent    = body.get('intent', '?')
    score     = body.get('distressScore', '?')
    is_d      = body.get('isDistress', False)
    alert     = body.get('shouldAlertCaregiver', False)
    resp_text = (body.get('response') or '')[:70]
    has_audio = bool(body.get('audioBase64'))
    groq_err  = 'GROQ_API_KEY not configured' in str(body)

    issues = []
    if groq_err:                                        issues.append('GROQ key still missing!')
    if exp_intent and intent != exp_intent:             issues.append(f'intent={intent} want={exp_intent}')
    if exp_distress is not None and is_d != exp_distress: issues.append(f'isDistress={is_d} want={exp_distress}')
    if exp_alert is not None and alert != exp_alert:    issues.append(f'shouldAlert={alert} want={exp_alert}')
    if dist_min and isinstance(score, int) and score < dist_min: issues.append(f'score={score} want>={dist_min}')
    if dist_max and isinstance(score, int) and score > dist_max: issues.append(f'score={score} want<={dist_max}')
    if not resp_text.strip() and exp_intent != 'ignore': issues.append('empty response')

    mark = '[PASS]' if not issues else '[FAIL]'
    print(f'\n  {mark}  "{tx[:45]}"')
    print(f'         intent={intent}  score={score}  isDistress={is_d}  alert={alert}  audio={has_audio}')
    if resp_text:
        print(f'         response: "{resp_text}"')
    if issues:
        for i in issues:
            print(f'         !! {i}')

    if not issues:
        passed += 1
    else:
        failed += 1

print()
print('  ' + '='*60)
print(f'  TOTAL: {passed}/{passed+failed} passed,  {failed} failed')
print()
sys.exit(0 if failed == 0 else 1)
