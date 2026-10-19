"""Writes src/engine/uprough/__tests__/fixtures/bass_pluck.json: the per-note synthesis of the Up Rough
sampled / electric / warmsub bass voices (hiphop.render_bass_bar's dispatch branch, up to but NOT including the
per-note tail: mean removal, humanize resample, fades, groove offset, 0.85 * vel).

Every host function used is the real one (synth_factory.pluck, hiphop._sub808, synth_dsp lp / hp / moog_ladder /
tube / distort, sampler.process); only the 20-line mix of the dispatch branch is spelled out here, because the host
has it inline in render_bass_bar and no function to import. Keep it in step with hiphop.py ~3640-3750.

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
fac, dsp, sm = hh._fac, hh._dsp, hh._sm


def seq_rms(y):
    s = 0.0
    for v in np.asarray(y, dtype=np.float64).tolist():
        s += v * v
    return math.sqrt(s / len(y))


def pack(sig):
    sig = np.asarray(sig, dtype=np.float64)
    return {"length": int(sig.size), "rms": seq_rms(sig), "kept": [float(v) for v in sig[::KEEP]]}


def host_note(voice, semi, dur, glide, seed, bcut):
    """render_bass_bar's sampled / electric / warmsub branch for one event; `seed` is the pluck seed (seed + step)."""
    lo = semi - 12
    n_note = max(1, int(dur * RATE))
    string = np.asarray(fac.pluck(lo, dur, RATE, kind="pluck", seed=seed, damp=0.04, in_tune=True), float)[:n_note]
    sub = np.asarray(hh._sub808(semi, dur, RATE, glide_from=glide, drive=0.18), float)[:n_note]
    string = dsp.lp(string, int(2600 * bcut), RATE)
    if voice == "sampled":
        string = sm.process(string, "sp1200", RATE, dither=True)
        return 0.55 * sub + 0.80 * string
    if voice == "electric":
        string = dsp.moog_ladder(string, int(2400 * bcut), 0.46, RATE)
        string = dsp.tube(string, drive=3.6, bias=0.20)
        string = dsp.distort(string, "rat", 1.8)
        return 0.70 * sub + 0.70 * string
    h = dsp.hp(dsp.tube(sub, drive=3.2, bias=0.22), 180, RATE)
    return 0.80 * sub + 0.45 * h + 0.42 * dsp.lp(string, 1200, RATE)


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
