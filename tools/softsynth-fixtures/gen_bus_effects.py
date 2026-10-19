"""Writes src/engine/uprough/__tests__/fixtures/bus_effects.json: the Up Rough bus effects of tools/synth_dsp.py,
tools/sampler.py and tools/softsynth_engine.py run on one deterministic test signal at their defaults and at one
non-default option set each, for the null test of the TypeScript port (src/engine/uprough/effects/busEffects.ts).

The input is stored in the JSON (float64 repr) so the test needs no numpy. Each case: effect id, the options as
the TypeScript function takes them (camelCase), output length, every 13th output sample and the RMS.
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_bus_effects.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools src/engine/uprough/__tests__/fixtures/bus_effects.json
"""
import importlib.util
import json
import os
import sys

import numpy as np

TOOLS, OUT = sys.argv[1], sys.argv[2]
RATE = 22050
KEEP = 13
N = 8000

sys.path.insert(0, TOOLS)


def load(name):
    sp = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


sd = load("synth_dsp")
sm = load("sampler")
se = load("softsynth_engine")
assert sm.RATE == RATE

# A decaying two-tone burst with a click and low noise: loud enough to drive the compressors and clippers.
i = np.arange(N)
rs = np.random.RandomState(1234)
X = (0.7 * np.sin(2 * np.pi * 110.0 * i / RATE) * np.exp(-i / 3000.0)
     + 0.4 * np.sin(2 * np.pi * 1760.0 * i / RATE + 0.3) * np.exp(-i / 1500.0)
     + 0.15 * rs.uniform(-1, 1, N))
X[0] = 0.9
X = np.asarray(X, dtype=np.float64)

CASES = [
    ("softClip", {}, lambda o: sd.soft_clip(X)),
    ("softClip", {"drive": 5.5}, lambda o: sd.soft_clip(X, 5.5)),
    ("tapeSat", {}, lambda o: sd.tape_sat(X)),
    ("tapeSat", {"drive": 3.2}, lambda o: sd.tape_sat(X, 3.2)),
    ("tube", {}, lambda o: sd.tube(X)),
    ("tube", {"drive": 3.5, "bias": 0.35}, lambda o: sd.tube(X, 3.5, 0.35)),
]
DELAY_NONDEF = {
    "digital": dict(delay_s=0.05, fb=0.55, mix=0.5, damp=0.4),
    "tape": dict(delay_s=0.04, fb=0.5, mix=0.45, damp=0.2, sat=0.5, wow=1.0),
    "bbd": dict(delay_s=0.06, fb=0.45, mix=0.5, damp=0.1),
    "reverse": dict(delay_s=0.05, fb=0.4, mix=0.5),
    "multitap": dict(delay_s=0.03, mix=0.5),
}
CAMEL = {"delay_s": "delaySec"}
CASES.append(("delay", {}, lambda o: sd.delay(X, RATE)))
for kind, kw in DELAY_NONDEF.items():
    CASES.append(("delay", {"kind": kind, **{CAMEL.get(k, k): v for k, v in kw.items()}},
                  lambda o, kind=kind, kw=kw: sd.delay(X, RATE, kind=kind, **kw)))
CASES.append(("chorus", {}, lambda o: sd.chorus(X, RATE)))
CASES.append(("chorus", {"depthMs": 9.0, "rateHz": 1.3, "mix": 0.6, "voices": 3},
              lambda o: sd.chorus(X, RATE, depth_ms=9.0, rate_hz=1.3, mix=0.6, voices=3)))
for kind in ("juno", "dimension", "ensemble"):
    CASES.append(("chorus", {"kind": kind}, lambda o, kind=kind: sd.chorus(X, RATE, kind=kind)))
CASES.append(("chorus", {"delayMs": 12.0, "phaseOffsets": [0.0, 1.0, 4.0]},
              lambda o: sd.chorus(X, RATE, delay_ms=12.0, phase_offsets=[0.0, 1.0, 4.0])))
CASES.append(("schroederReverb", {}, lambda o: sd.reverb(X, RATE)))
for kind in ("plate", "hall", "gated", "spring"):
    CASES.append(("schroederReverb", {"kind": kind, "mix": 0.5, "decay": 0.7},
                  lambda o, kind=kind: sd.reverb(X, RATE, kind=kind, mix=0.5, decay=0.7)))
CASES.append(("samplerReverb", {}, lambda o: sm.reverb(X, RATE)))
for kind in ("dark_room", "short_plate", "gated", "spring", "warehouse", "reverse", "lofi_digital"):
    CASES.append(("samplerReverb", {"kind": kind, "mix": 0.4},
                  lambda o, kind=kind: sm.reverb(X, RATE, kind=kind, mix=0.4)))
CASES.append(("samplerReverb", {"kind": "lofi_digital", "mix": 0.6, "seed": 5},
              lambda o: sm.reverb(X, RATE, kind="lofi_digital", mix=0.6, seed=5)))
CASES += [
    ("drumBus", {"resample": "sp1200"}, lambda o: sm.drum_bus(X, RATE, resample="sp1200")),
    ("drumBus", {"resample": "cassette", "seed": 3}, lambda o: sm.drum_bus(X, RATE, resample="cassette", seed=3)),
    ("drumBus", {"resample": "vinyl", "comp": False}, lambda o: sm.drum_bus(X, RATE, resample="vinyl", comp=False)),
    ("drumBus", {"resample": "amiga"}, lambda o: sm.drum_bus(X, RATE, resample="amiga")),
    ("samplerProcess", {"profile": "mpc60"}, lambda o: sm.process(X, "mpc60", RATE)),
    ("samplerProcess", {"profile": "radio", "dither": False, "seed": 2}, lambda o: sm.process(X, "radio", RATE, dither=False, seed=2)),
    ("samplerProcess", {"profile": "clean"}, lambda o: sm.process(X, "clean", RATE)),
    ("paulaFilter", {"zoh": True}, lambda o: se.paula_filter(X, RATE, zoh=True)),
    ("paulaFilter", {"zoh": True, "model": "led", "replayRate": 16000}, lambda o: se.paula_filter(X, RATE, model="led", zoh=True, replay_rate=16000)),
    ("paulaZoh", {}, lambda o: se.paula_zoh(X, RATE)),
    ("paulaZoh", {"replayRate": 11025}, lambda o: se.paula_zoh(X, RATE, 11025)),
    ("drumBus", {}, lambda o: sm.drum_bus(X, RATE)),
    ("drumBus", {"drive": 0.5, "comp": False}, lambda o: sm.drum_bus(X, RATE, drive=0.5, comp=False)),
    ("drumBus", {"drive": 0.3, "compParams": {"ratio": 3.0, "thresh": 0.2}},
     lambda o: sm.drum_bus(X, RATE, drive=0.3, comp_params={"ratio": 3.0, "thresh": 0.2})),
    ("parallelDirt", {}, lambda o: sm.parallel_dirt(X, RATE)),
    ("parallelDirt", {"wet": 0.5}, lambda o: sm.parallel_dirt(X, RATE, wet=0.5)),
    ("mixerColor", {}, lambda o: sm.mixer_color(X, RATE)),
    ("mixerColor", {"drive": 0.5, "hfRolloff": 3000}, lambda o: sm.mixer_color(X, RATE, drive=0.5, hf_rolloff=3000)),
    ("vinylSurface", {"amount": 1.0}, lambda o: sd.add_vinyl_surface(X, RATE, amount=1.0)),
    ("vinylSurface", {"amount": 0.6, "seed": 7}, lambda o: sd.add_vinyl_surface(X, RATE, amount=0.6, seed=7)),
    ("vinylSurface", {"amount": 0.8, "seed": 3, "gain": 0.05}, lambda o: sd.add_vinyl_surface(X, RATE, amount=0.8, seed=3, gain=0.05)),
    ("vintageCharacter", {}, lambda o: sd.vintage_character(X, RATE)),
    ("vintageCharacter", {"tapeAge": 0.6, "dacNoise": 0.5, "jitter": 0.4, "aliasing": 0.5, "wear": 0.5, "seed": 5},
     lambda o: sd.vintage_character(X, RATE, tape_age=0.6, dac_noise=0.5, jitter=0.4, aliasing=0.5, wear=0.5, seed=5)),
    ("vintageCharacter", {"tapeAge": 0.2, "seed": 1}, lambda o: sd.vintage_character(X, RATE, tape_age=0.2, seed=1)),
    ("paulaFilter", {}, lambda o: se.paula_filter(X, RATE)),
    ("paulaFilter", {"model": "led"}, lambda o: se.paula_filter(X, RATE, model="led")),
    ("paulaFilter", {"model": "a1200", "cutoff": 5000}, lambda o: se.paula_filter(X, RATE, model="a1200", cutoff=5000)),
    ("masterBus", {}, lambda o: se.master_bus(X)),
    ("masterBus", {"dither": True}, lambda o: se.master_bus(X, dither=True)),
    ("masterBus", {"lowpassHz": 4000}, lambda o: se.master_bus(X, lowpass_hz=4000)),
]

cases = []
for eid, opts, fn in CASES:
    y = np.asarray(fn(opts), dtype=np.float64)
    cases.append({
        "effect": eid, "options": opts, "length": int(len(y)),
        "rms": float(np.sqrt(np.mean(y ** 2))),
        "samples": [float(v) for v in y[::KEEP]],
    })

with open(OUT, "w") as f:
    json.dump({"rate": RATE, "keep": KEEP, "input": [float(v) for v in X], "cases": cases}, f, separators=(",", ":"))
print("wrote", OUT, len(cases), "cases", os.path.getsize(OUT), "bytes")
