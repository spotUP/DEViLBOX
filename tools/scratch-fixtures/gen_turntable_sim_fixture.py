"""Generates src/engine/turntable/__tests__/fixtures/turntableSim.json from the Up Rough demo's
turntable.simulate (the reference the TS port replays). Run:
  /opt/homebrew/bin/python3.11 gen_tt_fixture.py /Users/spot/Code/Up_Rough_Demo_System/tools OUT.json"""
import sys, json
sys.path.insert(0, sys.argv[1])
import numpy as np
import turntable as tt
RATE = 22050
A = 1500.0
out = {"rand": [float(x) for x in np.random.RandomState(0).rand(5)], "cases": []}
amp = 0.55 + 0.70 * 0.7
baby = [(0, 0, 1), (0.25, A, 1), (0.5, 0, 1), (0.75, -A, 1), (1, 0, 1)]
dur = 2 * 60.0 / (92 * 4)
cases = [
  ("baby_render_gesture", [(t, a * amp, g) for (t, a, g) in baby], dur, dict(warp=0.4, eccentricity=0.3, seed=0)),
  ("baby_selfcheck", [(0.0, 0.0, 1.0), (0.25, 1600, 1.0), (0.5, 0.0, 1.0), (0.75, -1600, 1.0), (1.0, 0.0, 1.0)], 0.4, dict()),
  ("release_worn", [(0, 0, 1), (0.3, -2.0 * A, 1), (0.35, -2.0 * A, 0), (1, -2.0 * A, 0)], 0.8,
   dict(deck="worn_club_deck", slipmat="felt_standard", record="12inch", performer="loose_old_school", seed=7)),
]
for name, hand, d, kw in cases:
    sim = tt.simulate(hand, d, RATE, **kw)
    n = len(sim["record_vel"])
    idx = [int(round(i * (n - 1) / 63)) for i in range(64)]
    out["cases"].append(dict(name=name, hand=[list(map(float, p)) for p in hand], dur=d, opts=kw, n=n, idx=idx,
                             record_vel=[float(sim["record_vel"][i]) for i in idx],
                             platter_vel=[float(sim["platter_vel"][i]) for i in idx],
                             issues=tt.validate_motion(sim)))
json.dump(out, open(sys.argv[2], "w"), indent=1)
print("ok", [ (c["name"], c["n"]) for c in out["cases"]])
