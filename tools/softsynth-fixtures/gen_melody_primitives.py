"""Writes src/engine/uprough/__tests__/fixtures/melody_primitives.json: the Up Rough melody-voice DSP primitives
(synth_dsp noise(white) / bp / hp / _phase / chorus), several parameter sets each.

Every 13th sample is kept (float64 repr), plus the length and the RMS.
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_melody_primitives.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools src/engine/uprough/__tests__/fixtures/melody_primitives.json
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


def seq_rms(y):
    s = 0.0
    for v in np.asarray(y, dtype=np.float64).tolist():
        s += v * v
    return math.sqrt(s / len(y))


def pack(sig):
    sig = np.asarray(sig, dtype=np.float64)
    return {"length": int(sig.size), "rms": seq_rms(sig), "kept": [float(v) for v in sig[::KEEP]]}


sd = load("synth_dsp")
N = 4410
cases = {}


def add(name, params, sig):
    cases[name] = {"params": params, "signal": pack(sig)}


for i, (n, seed) in enumerate([(N, 0), (N, 7), (1000, 2 ** 32 + 5), (3, 1)]):
    add("noise_%d" % i, {"n": n, "seed": seed}, sd.noise("white", n, RATE, seed))

src = sd.noise("white", N, RATE, 9)
for i, (lo, hi, order) in enumerate([(300.0, 3000.0, 2), (1000.0, 2500.0, 2), (200.0, 5000.0, 3)]):
    add("bp_%d" % i, {"lo": lo, "hi": hi, "order": order}, sd.bp(src, lo, hi, RATE, order))
for i, (fc, poles) in enumerate([(200.0, 2), (3000.0, 2), (800.0, 4)]):
    add("hp_%d" % i, {"fc": fc, "poles": poles}, sd.hp(src, fc, RATE, poles))

fa = np.linspace(200.0, 400.0, N)
add("phase_scalar", {"freq": 440.0, "n": N}, sd._phase(440.0, N, RATE))
add("phase_p0", {"freq": 1234.5, "n": N, "phase0": 0.37}, sd._phase(1234.5, N, RATE, 0.37))
add("phase_sweep", {"freqLinspace": [200.0, 400.0], "n": N}, sd._phase(fa, N, RATE))
add("phase_drift", {"freq": 330.0, "n": N, "drift": {"n": N, "depthCents": 12.0, "hz": 2.0, "seed": 3}},
    sd._phase(330.0, N, RATE, 0.1, sd.drift_curve(N, RATE, 12.0, 2.0, 3)))

tone = sd.osc("saw", 220.0, N, RATE)
for name, kw in [("default", {}), ("mix1", {"mix": 1.0}), ("juno", {"kind": "juno"}), ("dimension", {"kind": "dimension", "mix": 0.5}),
                 ("ensemble", {"kind": "ensemble"}), ("delay", {"delay_ms": 12.5, "depth_ms": 9.0, "rate_hz": 3.0}),
                 ("phases", {"phase_offsets": [0.0, 1.5707963267948966, 3.141592653589793], "mix": 0.6}), ("voices3", {"voices": 3, "rate_hz": 5.0})]:
    add("chorus_" + name, {"kw": kw}, sd.chorus(tone, RATE, **kw))

with open(OUT, "w") as f:
    json.dump({"rate": RATE, "keep": KEEP, "cases": cases}, f)
print(len(cases), "cases")
