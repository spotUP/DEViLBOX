"""Writes src/engine/turntable/__tests__/fixtures/pg_k.json: the Up Rough demo's model and fader options (ledger
PG-K: T6 cartridge_response + _lp, T8 GRIP_STATES, T10 the needle skip in simulate, F5 fader_curve with cut_in and
the hamster flip, F6 fader_from_pattern's contact bounce, lag and left-deck assignment).

  /opt/homebrew/bin/python3.11 -I tools/scratch-fixtures/gen_pg_k.py \
    /Users/spot/Code/Up_Rough_Demo_System/tools src/engine/turntable/__tests__/fixtures/pg_k.json
"""
import importlib.util
import json
import os
import sys

import numpy as np

TOOLS, OUT = sys.argv[1], sys.argv[2]
sys.path.insert(0, TOOLS)
spec = importlib.util.spec_from_file_location('turntable', os.path.join(TOOLS, 'turntable.py'))
tt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tt)
RATE = 22050
f = lambda a: [float(x) for x in a]

out = {'grip_states': tt.GRIP_STATES, 'skip': [], 'fader': [], 'curve': [], 'cartridge': []}

# T10: a hard scribble-like hand (the hand over-accelerates) with the skip on, seeds 0..3, and the same with it off
A = 1500.0
hand = [(0.0, 0.0, 1.0), (0.1, 3 * A, 1.0), (0.2, -3 * A, 1.0), (0.3, 3 * A, 1.0), (0.4, -3 * A, 1.0), (0.5, 3 * A, 1.0),
        (0.6, -3 * A, 1.0), (0.7, 3 * A, 1.0), (0.8, -3 * A, 1.0), (1.0, 0.0, 1.0)]
for seed in range(4):
    for skip in (1.0, 0.0):
        sim = tt.simulate(hand, 0.5, RATE, skip=skip, seed=seed, warp=0.4, eccentricity=0.3)
        n = len(sim['record_vel'])
        idx = [int(round(i * (n - 1) / 255)) for i in range(256)]
        out['skip'].append(dict(seed=seed, skip=skip, hand=[list(p) for p in hand], dur=0.5, n=n, idx=idx,
                                record_vel=f(sim['record_vel'][idx]), record_angle=f(sim['record_angle'][idx])))

# F6: fader_from_pattern with the options render_gesture never passes
pats = {'transform4': tt.cut_pattern('transform', 4), 'flare2': tt.cut_pattern('flare2')}
cases = []
for pname, pat in pats.items():
    for seed in range(4):
        cases.append((pname, dict(contact_bounce=0.3, seed=seed)))
    cases += [(pname, dict(lag_ms=2.0)), (pname, dict(deck='left')), (pname, dict(hamster=True)),
              (pname, dict(hamster=True, deck='left')), (pname, dict(contact_bounce=0.3, lag_ms=2.0, deck='left', hamster=True, seed=5, ramp_ms=2.0, offset_ms=1.5, curve='sharp'))]
for pname, kw in cases:
    g = tt.fader_from_pattern(pats[pname], 4000, RATE, **kw)
    out['fader'].append(dict(pattern=[list(w) for w in pats[pname]], name=pname, n=4000, opts=kw, out=f(g)))

# F5: fader_curve on a grid
pos = np.linspace(0, 1, 41)
for mode in ('battle', 'sharp', 'smooth', 'nope'):
    for cut_in in (0.03, 0.1, 0.0):
        for ham in (False, True):
            out['curve'].append(dict(mode=mode, cut_in=cut_in, hamster=ham, pos=f(pos), out=f(tt.fader_curve(pos, mode, cut_in=cut_in, hamster=ham))))

# T6: cartridge_response on a fixed signal
rs = np.random.RandomState(1)
x = 0.6 * np.sin(2 * np.pi * 440 * np.arange(2000) / RATE) + 0.3 * rs.uniform(-1, 1, 2000)
out['cartridge_in'] = f(x)
for c in tt.CARTRIDGES:
    out['cartridge'].append(dict(name=c, out=f(tt.cartridge_response(x, RATE, c))))

with open(OUT, 'w') as fh:
    json.dump(out, fh)
skipped = [(c['seed'], c['skip'], round(c['record_angle'][-1], 3)) for c in out['skip']]
print('ok', skipped)
