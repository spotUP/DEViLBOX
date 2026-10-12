"""Writes src/engine/dj/scratch/__tests__/fixtures/scratch_null.json: the Up Rough demo's own strokes and
scratch buses for the null test (owner 2026-10-12 "make the demo and devilbox scratch 1:1").

  strokes  scratch.render_gesture on bank records (the bank's S950 read, boom-bap deck), every gesture
           family: hand paths, glides under fader patterns, a throw, the echo's own FX, velocities under
           0.5 (low pass) and over 0.85 (the 3 kHz edge)
  buses    the strokes summed at their start samples, then three_deck's chain (deck_c_eq, scratch_channel
           room .42 delay .28 drive .09, + 0.22 dark room) and scratch_dj's (scratch_channel room .3
           delay .16 drive .10) - before the whole-render normalisation, which DEViLBOX applies as a level

Every 13th sample is kept (float64 repr).
  /opt/homebrew/bin/python3.11 -I tools/scratch-fixtures/gen_scratch_null.py \
    /Users/spot/Code/Up_Rough_Demo_System/tools src/engine/dj/scratch/__tests__/fixtures/scratch_null.json
"""
import importlib.util
import json
import os
import sys

import numpy as np

TOOLS, OUT = sys.argv[1], sys.argv[2]
RATE = 22050
KEEP = 13


def load(name):
    sp = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


sc = load("scratch")
sb = load("scratch_bank")
td = load("three_deck")
dsp = load("synth_dsp")

bank = sb.load_bank(rate=RATE, with_audio=True)
prof = sc.PROFILES["boombap"]["deck"]
step_sec = 60.0 / (130 * 4)
EVENTS = [
    ("ALRIGHT_STOP", "drop", 0.81, 27, 0.00),
    ("A_YEAH", "tear_fwd", 0.69, 31, 0.40),
    ("ALRIGHT_STOP", "transformer4", 0.76, 34, 0.62),
    ("BOY", "crab", 0.93, 41, 0.85),
    ("BOY", "chirp_double", 0.42, 44, 1.10),
    ("LONG_AH_YEAH", "scribble", 0.71, 50, 1.31),
    ("LONG_AH_YEAH", "orbit", 0.88, 52, 1.55),
    ("AH_YEAH", "echo", 0.66, 60, 1.80),
    ("AH_YEAH", "baby", 0.30, 63, 2.05),
]
n_bus = int(2.8 * RATE)
bus = np.zeros(n_bus)
out = dict(rate=RATE, keep=KEEP, stepSec=step_sec, events=[])
for rec, gesture, vel, seed, at in EVENTS:
    src = bank[rec]["source"]
    steps = sc._GESTURE_STEPS.get(gesture, 2)
    g = sc.render_gesture(src, gesture, steps * step_sec, RATE, velocity=vel, profile=prof, seed=seed)
    o = int(at * RATE)
    e = min(n_bus, o + len(g))
    bus[o:e] += g[:e - o]
    out["events"].append(dict(record=rec, gesture=gesture, velocity=vel, seed=seed, steps=steps, start=o, n=len(g),
                              out=[float(v) for v in g[::KEEP]]))


def channel(x, room, delay_mix, drive):
    """scratch_routine.scratch_channel without its final peak normalisation."""
    y = dsp.hp(np.asarray(x, float), 160, RATE)
    y = y + 0.22 * dsp.bp(y, 1500, 3000, RATE)
    y = np.tanh(y * (1.0 + 3.0 * drive))
    y = dsp.delay(y, RATE, kind="tape", delay_s=0.20, fb=0.32, mix=delay_mix, damp=0.5)
    wet = 0.6 * sc._sm.reverb(y, RATE, kind="short_plate", mix=1.0) + 0.4 * sc._sm.reverb(y, RATE, kind="dark_room", mix=1.0)
    m = min(len(y), len(wet))
    y = np.asarray(y, float)
    y[:m] = (1 - room) * y[:m] + room * wet[:m]
    return dsp.lp(y, 5000, RATE, poles=4)


three = channel(td.deck_c_eq(bus, RATE), 0.42, 0.28, 0.09)
tail = sc._sm.reverb(three, RATE, kind="dark_room", mix=1.0)
three = three + 0.22 * tail[:len(three)]
dj = channel(bus, 0.30, 0.16, 0.10)
out["busN"] = n_bus
out["threeDeck"] = [float(v) for v in three[:n_bus:KEEP]]
out["scratchDj"] = [float(v) for v in dj[:n_bus:KEEP]]
json.dump(out, open(OUT, "w"))
print("ok", len(EVENTS), "strokes,", n_bus, "bus samples")
