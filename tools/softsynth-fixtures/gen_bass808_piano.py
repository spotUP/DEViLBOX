"""Writes src/engine/uprough/__tests__/fixtures/bass808_piano.json: the Up Rough 808 bass (trap808.render_808_note)
and piano (synth_factory.piano) at two pitches x two lengths with defaults, plus one non-default param set each.

Every 13th sample is kept (float64 repr), plus the length and the RMS.
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_bass808_piano.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools src/engine/uprough/__tests__/fixtures/bass808_piano.json
"""
import importlib.util
import json
import os
import sys

import math

import numpy as np


def seq_rms(y):
    """RMS with a left-to-right sum, the order the TypeScript test sums in (np.mean is pairwise)."""
    s = 0.0
    for v in np.asarray(y, dtype=np.float64).tolist():
        s += v * v
    return math.sqrt(s / len(y))

TOOLS, OUT = sys.argv[1], sys.argv[2]
RATE = 22050
KEEP = 13
sys.path.insert(0, TOOLS)


def load(name):
    sp = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


t8 = load("trap808")
sf = load("synth_factory")


def pack(sig):
    sig = np.asarray(sig, dtype=np.float64)
    return {"length": int(sig.size), "rms": seq_rms(sig),
            "kept": [float(v) for v in sig[::KEEP]]}


cases = []
# bass808: params are registry keys (the TS voice maps them onto the profile), midi - 24 = semi.
BASS_ALT = {"sine_mix": 0.6, "tri_mix": 0.4, "click_amt": 0.2, "click_ms": 6.0, "pitch_start_semi": 7.0,
            "pitch_drop_ms": 80.0, "attack_ms": 12.0, "release_ms": 90.0, "drive_amt": 0.5,
            "cleanup_lp_hz": 1800.0, "drive_kind": "tube"}
for midi, dur in ((28, 0.25), (28, 0.9), (40, 0.25), (40, 0.9)):
    cases.append({"voice": "bass808", "params": {}, "midi": midi, "durSec": dur, "velocity": 0.8, "seed": 3,
                  "sig": pack(t8.render_808_note(midi - 24, dur, RATE, velocity=0.8, seed=3))})
prof = dict(t8.DEFAULT_PROFILE, **BASS_ALT)
cases.append({"voice": "bass808",
              "params": {**{k: v for k, v in BASS_ALT.items() if k != "drive_kind"}, "drive_kind": 1,
                         "decay_ms": 700.0, "accent": 1, "parallel": 1},
              "midi": 33, "durSec": 0.6, "velocity": 0.95, "seed": 9,
              "sig": pack(t8.render_808_note(33 - 24, 0.6, RATE, profile=prof, velocity=0.95, seed=9,
                                             decay_ms=700.0, accent=True, parallel=True))})

# piano: note.midi is the semitone (hz(semi) = 440 * 2^((semi-69)/12)); velocity scales in the TS voice.
for midi, dur in ((48, 0.25), (48, 0.9), (72, 0.25), (72, 0.9)):
    cases.append({"voice": "piano", "params": {}, "midi": midi, "durSec": dur, "velocity": 1.0, "seed": 0,
                  "sig": pack(sf.piano(midi, dur, RATE))})
cases.append({"voice": "piano", "params": {"bright": 0.9, "detune_cents": 6.0}, "midi": 60, "durSec": 0.7,
              "velocity": 1.0, "seed": 5, "sig": pack(sf.piano(60, 0.7, RATE, bright=0.9, seed=5, detune_cents=6.0))})

# render_mono_sequence: a choked pair, a slide pair (legato) and an octave slide, default profile
SEQ = [(0.0, 0.30, 4, False), (0.20, 0.30, 7, False), (0.50, 0.25, 7, False), (0.70, 0.25, 11, True),
       (1.00, 0.25, 2, False), (1.15, 0.25, 14, True)]
seq = t8.render_mono_sequence(SEQ, RATE, seed=11)
seq_alt = t8.render_mono_sequence(SEQ[:4], RATE, profile=dict(t8.DEFAULT_PROFILE, drive_amt=0.4, attack_ms=9.0), seed=2)
sequences = [{"events": [list(e) for e in SEQ], "profile": {}, "seed": 11, "sig": pack(seq)},
             {"events": [list(e) for e in SEQ[:4]], "profile": {"drive_amt": 0.4, "attack_ms": 9.0}, "seed": 2,
              "sig": pack(seq_alt)}]

with open(OUT, "w") as f:
    json.dump({"rate": RATE, "keep": KEEP, "cases": cases, "sequences": sequences}, f)
print("wrote", OUT, os.path.getsize(OUT), "bytes", len(cases), "cases")
