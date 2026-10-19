"""Writes src/engine/uprough/__tests__/fixtures/bass_pluck.json: the per-note synthesis of the Up Rough
sampled / electric / warmsub bass voices (hiphop.render_bass_bar's dispatch branch, up to but NOT including the
per-note tail: mean removal, humanize resample, fades, groove offset, 0.85 * vel).

The note comes from the host's own hiphop.bass_voice_note (the function render_bass_bar calls per event); nothing
of the voice mix is spelled out here.

Every 13th sample is kept (float64 repr), plus the length and the RMS.
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_bass_pluck.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools src/engine/uprough/__tests__/fixtures/bass_pluck.json
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


def seq_rms(y):
    s = 0.0
    for v in np.asarray(y, dtype=np.float64).tolist():
        s += v * v
    return math.sqrt(s / len(y))


def pack(sig):
    sig = np.asarray(sig, dtype=np.float64)
    return {"length": int(sig.size), "rms": seq_rms(sig), "kept": [float(v) for v in sig[::KEEP]]}


def host_note(voice, semi, dur, glide, seed, bcut):
    """The host's own per-voice dispatch (hiphop.bass_voice_note); `seed` is the pluck seed (seed + step)."""
    return hh.bass_voice_note(voice, semi, dur, glide, seed, bcut, RATE)


# (semi, dur, glide, seed, bcut): low / high pitch, short / long, with and without glide, two seeds, two bass_cut values
NOTES = [
    (36, 0.12, None, 3, 1.0), (36, 0.60, None, 3, 1.0), (36, 0.45, 31, 7, 1.0),
    (60, 0.12, None, 7, 1.0), (60, 0.60, 55, 3, 1.0), (60, 0.30, None, 11, 0.7),
    (48, 0.25, 43, 11, 0.7), (45, 0.08, None, 3, 1.3),
]
cases = []
for voice in ("sampled", "electric", "warmsub"):
    for semi, dur, glide, seed, bcut in NOTES:
        cases.append({"voice": voice, "semi": semi, "dur": dur, "glide": glide, "seed": seed, "bcut": bcut,
                      "sig": pack(host_note(voice, semi, dur, glide, seed, bcut))})
with open(OUT, "w") as f:
    json.dump({"rate": RATE, "keep": KEEP, "cases": cases}, f)
print(len(cases), "cases")
