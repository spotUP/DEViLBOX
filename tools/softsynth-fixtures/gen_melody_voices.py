"""Writes src/engine/uprough/__tests__/fixtures/melody_voices.json: the per-note synthesis of the Up Rough melody
voices (hiphop.melody_voice_note, before the per-note tail), called directly on the real host module.

Every 13th sample is kept (float64 repr), plus the length and the RMS.
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_melody_voices.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools src/engine/uprough/__tests__/fixtures/melody_voices.json
"""
import importlib.util
import json
import math
import os
import sys

import numpy as np

TOOLS, OUT = sys.argv[1], sys.argv[2]
KEEP = 13
sys.path.insert(0, TOOLS)


def load(name):
    sp = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


hh = load("hiphop")


def seq_rms(y):
    s = 0.0
    for v in np.asarray(y, dtype=np.float64).tolist():
        s += v * v
    return math.sqrt(s / len(y))


def pack(sig):
    sig = np.asarray(sig, dtype=np.float64)
    return {"length": int(sig.size), "rms": seq_rms(sig), "kept": [float(v) for v in sig[::KEEP]]}


# (semi, dur, prev_semi, seed): low / high pitch, short / long, two seeds; prev_semi only matters to the whistle
NOTES = [
    (48, 0.12, None, 3), (48, 0.60, 43, 3), (60, 0.30, None, 7), (60, 0.60, 55, 11),
    (72, 0.12, 67, 7), (69, 0.25, 69, 11), (55, 0.45, None, 5), (64, 0.08, 60, 3),
]
VOICES = ("bell", "darkbell", "fmbell", "lead")
RATES = (22050, 44100)
cases = []
for rate in RATES:
    for voice in VOICES:
        for semi, dur, prev, seed in NOTES:
            cases.append({"voice": voice, "rate": rate, "semi": semi, "dur": dur, "prev": prev, "seed": seed,
                          "sig": pack(hh.melody_voice_note(voice, semi, dur, prev, seed, rate))})
with open(OUT, "w") as f:
    json.dump({"keep": KEEP, "cases": cases}, f)
print(len(cases), "cases")
