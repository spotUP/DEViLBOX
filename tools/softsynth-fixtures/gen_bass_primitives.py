"""Writes src/engine/uprough/__tests__/fixtures/bass_primitives.json: the Up Rough bass DSP primitives
(synth_dsp osc / drift_curve / moog_ladder / distort / fm_2op / karplus, synth_factory _env), several parameter sets each.

Every 13th sample is kept (float64 repr), plus the length and the RMS.
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_bass_primitives.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools src/engine/uprough/__tests__/fixtures/bass_primitives.json
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
    """RMS with a left-to-right sum, the order the TypeScript test sums in."""
    s = 0.0
    for v in np.asarray(y, dtype=np.float64).tolist():
        s += v * v
    return math.sqrt(s / len(y))


def pack(sig):
    sig = np.asarray(sig, dtype=np.float64)
    return {"length": int(sig.size), "rms": seq_rms(sig), "kept": [float(v) for v in sig[::KEEP]]}


sd = load("synth_dsp")
sf = load("synth_factory")
N = 4410
cases = {}


def add(name, params, sig):
    cases[name] = {"params": params, "signal": pack(sig)}


# Oscillators: every kind, band-limited, plus detune/pw/fold/drift variants.
for kind in ["saw", "square", "pulse", "pwm", "tri", "sine", "halfsine", "supersaw", "sub", "impulse", "noise", "unknown"]:
    p = {"kind": kind, "freq": 110.0, "n": N}
    add("osc_" + kind, p, sd.osc(kind, 110.0, N, RATE, seed=7))
add("osc_saw_naive", {"kind": "saw", "freq": 331.5, "n": N, "bandLimit": False}, sd.osc("saw", 331.5, N, RATE, band_limit=False))
add("osc_square_naive_pw", {"kind": "square", "freq": 331.5, "n": N, "pw": 0.3, "bandLimit": False}, sd.osc("square", 331.5, N, RATE, pw=0.3, band_limit=False))
add("osc_saw_hi_detune_phase", {"kind": "saw", "freq": 3500.0, "n": N, "detune": 17.0, "phase0": 0.37}, sd.osc("saw", 3500.0, N, RATE, detune=17.0, phase0=0.37))
add("osc_square_pw", {"kind": "square", "freq": 220.0, "n": N, "pw": 0.2}, sd.osc("square", 220.0, N, RATE, pw=0.2))
pwarr = np.linspace(0.1, 0.9, N)
add("osc_pwm_array", {"kind": "pwm", "freq": 220.0, "n": N, "pwLinspace": [0.1, 0.9]}, sd.osc("pwm", 220.0, N, RATE, pw=pwarr))
add("osc_saw_fold", {"kind": "saw", "freq": 110.0, "n": N, "fold": 0.4}, sd.osc("saw", 110.0, N, RATE, fold=0.4))
dr = sd.drift_curve(N, RATE, 12.0, 2.0, 3)
add("osc_saw_drift", {"kind": "saw", "freq": 110.0, "n": N, "drift": {"n": N, "depthCents": 12.0, "hz": 2.0, "seed": 3}}, sd.osc("saw", 110.0, N, RATE, drift=dr))
fr = np.linspace(80.0, 160.0, N)
add("osc_saw_sweep", {"kind": "saw", "n": N, "freqLinspace": [80.0, 160.0]}, sd.osc("saw", fr, N, RATE))
add("osc_supersaw_hi", {"kind": "supersaw", "freq": 440.0, "n": N, "detune": 5.0}, sd.osc("supersaw", 440.0, N, RATE, detune=5.0))

# Drift curve.
for i, (n, dc, hz, seed) in enumerate([(N, 4.0, 0.3, 0), (N * 3, 25.0, 1.5, 11), (2000, 8.0, 5.0, 99)]):
    add("drift_%d" % i, {"n": n, "depthCents": dc, "hz": hz, "seed": seed}, sd.drift_curve(n, RATE, dc, hz, seed))

# Envelope.
for i, (n, a, d, s, r) in enumerate([(5000, 0.003, 0, 0.7, 0.05), (8000, 0.01, 0.2, 0.5, 0.15), (300, 0.05, 0, 0.2, 0.05), (1, 0.01, 0, 0.5, 0.01), (4000, 0.0, 0, 1.0, 0.0), (4000, 0.1, 0, 0.3, 0.0)]):
    add("env_%d" % i, {"n": n, "a": a, "d": d, "sus": s, "r": r}, sf._env(n, a, d, s, r, RATE))

# Moog ladder on a saw and on noise, scalar and swept cutoff.
saw = sd.osc("saw", 110.0, N, RATE)
nz = sd.osc("noise", 110.0, N, RATE, seed=5)
add("moog_scalar_lo", {"src": "saw110", "n": N, "fc": 300.0, "res": 0.3}, sd.moog_ladder(saw, 300.0, 0.3, RATE))
add("moog_scalar_res", {"src": "saw110", "n": N, "fc": 1200.0, "res": 0.95}, sd.moog_ladder(saw, 1200.0, 0.95, RATE))
add("moog_clamped_hi", {"src": "noise5", "n": N, "fc": 20000.0, "res": 0.5}, sd.moog_ladder(nz, 20000.0, 0.5, RATE))
fc = np.linspace(200.0, 4000.0, N)
add("moog_sweep", {"src": "saw110", "n": N, "fcLinspace": [200.0, 4000.0], "res": 0.6}, sd.moog_ladder(saw, fc, 0.6, RATE))

# Distortions: every kind, a default-drive and a hot-drive set on a sine+noise mix.
mix = 0.8 * sd.osc("sine", 140.0, N, RATE) + 0.3 * nz
for kind in ["soft", "hard", "tape", "tube", "diode", "asym", "wavefold", "rat", "tubescreamer", "bigmuff", "ds1", "bitcrush", "unknown"]:
    for tag, drive in [("def", None), ("hot", 7.3), ("low", 0.6)]:
        y = sd.distort(mix, kind) if drive is None else sd.distort(mix, kind, drive)
        add("distort_%s_%s" % (kind, tag), {"kind": kind, "drive": drive}, y)

# FM.
for i, kw in enumerate([{}, {"ratio": 3.5, "index": 6.0}, {"feedback": 0.7}, {"ratio": 1.0, "index": 2.0, "feedback": 1.3, "car_decay": 0.8, "mod_decay": 0.15}]):
    add("fm_%d" % i, {"freq": 98.0, "n": N, "kw": kw}, sd.fm_2op(98.0, N, RATE, **kw))

# Karplus, integer path, every excitation kind.
for kind in ["pluck", "mallet", "metal", "bell", "wood"]:
    add("karplus_" + kind, {"freq": 196.0, "dur": 0.4, "damp": 0.5, "kind": kind, "seed": 4}, sd.karplus(196.0, 0.4, RATE, 0.5, kind, 4))
add("karplus_pluck_damp", {"freq": 82.4, "dur": 0.6, "damp": 0.9, "kind": "pluck", "seed": 1}, sd.karplus(82.4, 0.6, RATE, 0.9, "pluck", 1))

# Karplus, fractional (allpass-tuned) path. Host fixed in Up Rough e24a13d29: the allpass z is
# built from portable cos/sin, as allpassPhaseDelay does.
for kind in ["pluck", "mallet", "metal", "wood"]:
    add("karplus_frac_" + kind, {"freq": 196.3, "dur": 0.4, "damp": 0.5, "kind": kind, "seed": 4, "fractional": True},
        sd.karplus(196.3, 0.4, RATE, 0.5, kind, 4, True))

with open(OUT, "w") as f:
    json.dump({"rate": RATE, "keep": KEEP, "cases": cases}, f)
print(len(cases), "cases")
