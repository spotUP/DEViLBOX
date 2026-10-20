"""Writes src/engine/uprough/__tests__/fixtures/bass_bar.json: whole bass bars from the host's own
hiphop.render_bass_bar (per-note tail, groove offset, bar tail), one per voice style and two bpm/seed combos.
Nothing of the tail is spelled out here; the groove row is tools/song_file.style_groove(style).

Every 13th sample is kept (float64 repr), plus the length and the RMS.
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_bass_bar.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools src/engine/uprough/__tests__/fixtures/bass_bar.json
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
sys.path.insert(0, TOOLS)


def load(name):
    sp = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


hh = load("hiphop")
sf = load("song_file")

# (semi, step, dur_steps, glide, vel): glide, vel < 1, odd steps, a note running past the bar end (step 15, 6 steps)
EVENTS = [
    (36, 0, 3, None, 1.0), (43, 3, 2, 36, 0.6), (38, 5, 1, None, 0.35), (41, 7, 4, 38, 1.0),
    (36, 10, 2, None, 0.8), (46, 13, 1, 36, 1.0), (34, 15, 6, 46, 0.9),
]
COMBOS = [(90.0, 3), (96.0, 11)]
STYLES = ["boom_bap", "jazz_rap", "lofi", "g_funk", "miami_bass", "industrial", "trap"]


def seq_rms(y):
    s = 0.0
    for v in np.asarray(y, dtype=np.float64).tolist():
        s += v * v
    return math.sqrt(s / len(y))


cases = []
for style in STYLES:
    st = hh.STYLES[style]
    for bpm, seed in COMBOS:
        sig = np.asarray(hh.render_bass_bar(style, [tuple(e) for e in EVENTS], bpm, RATE, seed=seed), dtype=np.float64)
        cases.append({"style": style, "voice": st["bass_voice"], "bcut": st.get("bass_cut", 1.0), "bpm": bpm, "seed": seed,
                      "groove": sf.style_groove(style), "events": [list(e) for e in EVENTS],
                      "sig": {"length": int(sig.size), "rms": seq_rms(sig), "kept": [float(v) for v in sig[::KEEP]]}})
with open(OUT, "w") as f:
    json.dump({"rate": RATE, "keep": KEEP, "cases": cases}, f)
print(len(cases), "cases")
