"""Writes src/engine/uprough/__tests__/fixtures/melody_bar.json: whole melody bars from the host's own
hiphop.render_melody_bar, one per voice (piano, epiano, bell, fmbell, darkbell, whistle, lead, and an unknown
name that falls to the pluck) and two seed / chord_root combos. The bar's notes are the host's own
melody_bar_notes(gen_melody(...)) decision, handed to render_melody_bar (and to the test) as `notes`.

Every 13th sample is kept (float64 repr), plus the length and the RMS.
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_melody_bar.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools src/engine/uprough/__tests__/fixtures/melody_bar.json
"""
import importlib.util
import json
import math
import os
import sys

import numpy as np

TOOLS, OUT = sys.argv[1], sys.argv[2]
RATE = 22050
KEEP = 13
BPM = 96.0
STYLE = "boom_bap"
sys.path.insert(0, TOOLS)


def load(name):
    sp = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


hh = load("hiphop")
VOICES = ["piano", "epiano", "bell", "fmbell", "darkbell", "whistle", "lead", "zzunknown"]
COMBOS = [(3, 0), (11, 5)]  # (seed, chord_root)


def seq_rms(y):
    s = 0.0
    for v in np.asarray(y, dtype=np.float64).tolist():
        s += v * v
    return math.sqrt(s / len(y))


cases = []
for voice in VOICES:
    for seed, root in COMBOS:
        ev = [tuple(x) for x in hh.gen_melody(STYLE, 0, "minor", seed=seed)]
        notes = hh.melody_bar_notes(STYLE, ev, 0, root, "minor", 0)
        sig = np.asarray(hh.render_melody_bar(STYLE, ev, BPM, RATE, 0, seed, root, "minor", 0, voice, notes=notes), dtype=np.float64)
        cases.append({"voice": voice, "bpm": BPM, "seed": seed, "chordRoot": root, "notes": [list(n) for n in notes],
                      "sig": {"length": int(sig.size), "rms": seq_rms(sig), "kept": [float(v) for v in sig[::KEEP]]}})
with open(OUT, "w") as f:
    json.dump({"rate": RATE, "keep": KEEP, "cases": cases}, f)
print(len(cases), "cases")
