"""Writes src/engine/dj/scratch/__tests__/fixtures/deck_c_motion.json (ledger D1): three_deck.render's viz capture
(:397-436, 470) for a run of strokes on the demo's Deck C - each stroke's render_gesture(collect_viz=True) record
velocity, slip and fade, overwritten into a nominal-forward track at its start sample, a needle opening the fader -
and dj_viz's 50 Hz sampling of the cumulative angle (revolutions at 33 1/3 rpm), the fader and the slip.

  /opt/homebrew/bin/python3.11 -I tools/scratch-fixtures/gen_deck_c_motion.py \
    /Users/spot/Code/Up_Rough_Demo_System/tools src/engine/dj/scratch/__tests__/fixtures/deck_c_motion.json
"""
import importlib.util
import json
import os
import sys

import numpy as np

TOOLS, OUT = sys.argv[1], sys.argv[2]
RATE = 22050


def load(name):
    sp = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


sc = load("scratch")
sb = load("scratch_bank")
tt = load("turntable")
viz = load("dj_viz")
bank = sb.load_bank(rate=RATE, with_audio=True)
prof = sc.PROFILES["boombap"]["deck"]
step_sec = 60.0 / (92 * 4)
# (record, gesture, velocity, seed, start second); overlapping strokes overwrite in order, as three_deck's loop does
EVENTS = [
    ("ALRIGHT_STOP", "drop", 0.81, 3, 0.30),
    ("A_YEAH", "crab", 0.93, 7, 0.90),
    ("BOY", "transformer4", 0.62, 9, 1.32),
    ("LONG_AH_YEAH", "scribble", 0.71, 11, 1.40),
    (None, "needle_lift", 0.5, 0, 2.20),
    ("AH_YEAH", "brake", 0.66, 13, 2.50),
    ("BOY", "chirp", 0.40, 17, 3.40),
]
n = int(4.6 * RATE)
rv_c = np.ones(n)
slip_tr = np.zeros(n)
fader_tr = np.zeros(n)
strokes = []
for rec, gesture, vel, seed, at in EVENTS:
    o = int(at * RATE)
    if gesture == "needle_lift":
        g = tt.needle_lift(RATE, seed=seed)
        gviz = None
    else:
        steps = sc._GESTURE_STEPS.get(gesture, 2)
        g, gviz = sc.render_gesture(bank[rec]["source"], gesture, steps * step_sec, RATE, velocity=vel, profile=prof,
                                    seed=seed, collect_viz=True)
    eo = min(n, o + len(g))
    L = eo - o
    if gviz is not None:
        rv_c[o:eo] = gviz["record_vel"][:L]
        slip_tr[o:eo] = gviz["slip_vel"][:L]
        fader_tr[o:eo] = np.maximum(fader_tr[o:eo], gviz["fade"][:L])
        strokes.append(dict(record=rec, gesture=gesture, velocity=vel, seed=seed, steps=steps, start=o, n=len(g),
                            recordVel=[float(v) for v in gviz["record_vel"][::7]],
                            slipVel=[float(v) for v in gviz["slip_vel"][::7]],
                            fade=[float(v) for v in gviz["fade"][::7]]))
    else:
        fader_tr[o:eo] = np.maximum(fader_tr[o:eo], 1.0)
        strokes.append(dict(record=None, gesture=gesture, seed=seed, start=o, n=len(g)))
angle = np.cumsum(rv_c)
n_ticks = int(n / RATE * viz.FPS)
idx = np.clip(viz._tick_sample_index(n_ticks, RATE), 0, n - 1)
rev = RATE * 60.0 / viz.PLATTER_RPM
out = dict(rate=RATE, stepSec=step_sec, n=n, strokes=strokes, ticks=[int(i) for i in idx],
           revolutions=[float(angle[i] / rev) for i in idx], fader=[float(fader_tr[i]) for i in idx],
           slip=[float(slip_tr[i]) for i in idx], angleBytes=[int(b) for b in viz._angle_to_bytes(angle, n_ticks, RATE)])
with open(OUT, "w") as f:
    json.dump(out, f, separators=(",", ":"))
print("wrote", OUT, os.path.getsize(OUT))
