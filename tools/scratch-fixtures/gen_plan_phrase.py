"""Generates src/engine/dj/scratch/__tests__/fixtures/plan_phrase.json from the Up Rough reference
(/Users/spot/Code/Up_Rough_Demo_System/tools/scratch.py) with numpy stubbed (only the placement brain runs).

The reference ranks gestures with its own `gesture_activity`; DEViLBOX ranks its catalogue ids by level, then activity (`effortKey`)
(`gestureActivity`). The fixture therefore feeds the reference the DEViLBOX ids and activity table
(passed in `activity.json`), so a mismatch can only come from the port of the brain itself.
Run: python3 tools/scratch-fixtures/gen_plan_phrase.py <activity.json> <out.json>
"""
import json, sys
from unittest.mock import MagicMock

np = MagicMock(); np.clip = lambda x, a, b: max(a, min(b, x))
sys.modules['numpy'] = np
for m in ['scipy', 'scipy.signal', 'scipy.io', 'scipy.io.wavfile']:
    sys.modules[m] = MagicMock()
sys.path.insert(0, '/Users/spot/Code/Up_Rough_Demo_System/tools')
import scratch

spec = json.load(open(sys.argv[1]))
activity = spec['activity']
for name in activity:
    scratch.GESTURES.setdefault(name, {})
scratch.gesture_activity = lambda n: float(activity.get(n, 0.0))
scenarios = []
for case in spec['cases']:
    scratch.PROFILES[case['profile']]['gestures'] = case['gestures']
    bars = []
    for bar in range(case['bars']):
        placed = scratch.plan_phrase(case['hhStyle'], case['section'], bar, case['bars'], case['seed'])
        bars.append([[s, g, v, r] for (s, g, v, r) in placed])
    scenarios.append({**case, 'plan': bars,
                      'density': scratch.section_density(case['hhStyle'], case['section'])})
json.dump(scenarios, open(sys.argv[2], 'w'), indent=1)
