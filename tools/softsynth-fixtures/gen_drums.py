"""Writes src/engine/uprough/__tests__/fixtures/drums.json: tools/drummachine.py's drum voices rendered at
the voice defaults and at two non-default parameter sets each, for the null test of the TypeScript port
(src/engine/uprough/voices/drums.ts, which is src/engine/dj/scratch/demoDrums.ts behind ParameterDefs).

Each case: voice id, the params as the SoftsynthVoice takes them (machine is 808 / 909), the render seed,
the sample count, every 13th sample (float64 repr) and the RMS. The test renders midi 60, velocity 1.

hatPedal has no Python twin: it is hat(open_hat=False) with decay 35, rendered here the same way.
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_drums.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools src/engine/uprough/__tests__/fixtures/drums.json
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
sys.path.insert(0, TOOLS)  # the synth modules import their portable_* siblings
RATE = 22050
KEEP = 13


def load(name):
    sp = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


dm = load("drummachine")
assert dm.RATE == RATE

KICK = dm.VOICE_PARAMS["kick808"]
KICK_KEYS = ["tune", "pitch_start", "pitch_decay", "amp_decay", "click", "drive", "pitch_tail_ms",
             "pitch_tail_amt", "amp_punch", "amp_punch_ms", "body_h3", "click_ms", "click_len_ms", "click_hp"]
SNARE_KEYS = ["tune", "noise_amt", "body_decay", "noise_decay", "drive"]
CLAP_NUM = ["bright", "tap_ms", "tap_decay_ms", "tail_decay_ms", "tail_level", "band_lo", "band_hi",
            "lp_stages", "hp_stages", "room_wet", "room_decay", "room_tail_ms", "drive", "body"]


def machine(p):
    return "808" if int(p["machine"]) == 808 else "909"


def clap(p, seed):
    base = dm.VOICE_PARAMS["clap808" if machine(p) == "808" else "clap909"]
    kw = {k: p[k] for k in CLAP_NUM if k != "body"}
    kw["lp_stages"], kw["hp_stages"] = int(p["lp_stages"]), int(p["hp_stages"])
    return dm.clap(taps=base["taps"], room_kind=base["room_kind"], body=p["body"],
                   _vpkey="clap808" if machine(p) == "808" else "clap909", **kw)


def hat(open_hat):
    def f(p, seed):
        return dm.hat(open_hat, tune=p["tune"], machine=machine(p), seed=seed, noise=p["noise"], decay=p["decay"],
                      start_ms=p["start_ms"], pcm_bits=int(p["pcm_bits"]), dirt=p["dirt"], lp=p["lp"], hp=p["hp"])
    return f


VOICES = {
    "kick": lambda p, s: dm.kick808(**{k: p[k] for k in KICK_KEYS}),
    "snare808": lambda p, s: dm.snare808(**{k: p[k] for k in SNARE_KEYS}),
    "snare909": lambda p, s: dm.snare909(**{k: p[k] for k in SNARE_KEYS}),
    "clap": clap,
    "hatClosed": hat(False), "hatOpen": hat(True), "hatPedal": hat(False),
    "tom": lambda p, s: dm.tom(p["tune"], p["pitch_drop"], p["decay"], p["drive"], machine=machine(p)),
    "rim": lambda p, s: dm.rim(machine=machine(p), seed=s),
    "cowbell": lambda p, s: dm.cowbell(tune=p["tune"], dirt=p["dirt"]),
    "conga": lambda p, s: dm.conga(tune=p["tune"], decay=p["decay"], dirt=p["dirt"]),
    "ride": lambda p, s: dm.ride(seed=s, machine=machine(p), pcm_bits=int(p["pcm_bits"]), dirt=p["dirt"]),
}

HAT_D = dict(machine=909, tune=1.0, noise=1.0, start_ms=0, lp=0, hp=0, pcm_bits=-1, dirt=0)
CLAP_D = dict(machine=909, **{k: dm.VOICE_PARAMS["clap909"][k] for k in CLAP_NUM if k != "body"}, body=0.0)
CLAP_808 = dict(machine=808, **{k: dm.VOICE_PARAMS["clap808"][k] for k in CLAP_NUM if k != "body"}, body=0.0)

# (voice, seed, params): the first case of each voice is its defaults.
CASES = [
    ("kick", 1, {k: KICK[k] for k in KICK_KEYS}),
    ("kick", 1, {**{k: KICK[k] for k in KICK_KEYS}, "tune": 5, "amp_decay": 520, "click": 0.6, "drive": 3.5, "body_h3": 0.2, "pitch_tail_amt": 0.4}),
    ("kick", 1, {**{k: KICK[k] for k in KICK_KEYS}, "amp_punch": 0.0, "click_hp": 0, "pitch_start": 36, "pitch_decay": 90, "click_len_ms": 14}),
]
for v in ("snare808", "snare909"):
    d = {k: dm.VOICE_PARAMS[v][k] for k in SNARE_KEYS}
    CASES += [(v, 2, d), (v, 2, {**d, "tune": 36, "noise_amt": 0.3, "drive": 1.0}), (v, 2, {**d, "body_decay": 200, "noise_decay": 60, "noise_amt": 0.9})]
CASES += [
    ("clap", 9, CLAP_D), ("clap", 9, CLAP_808),
    ("clap", 9, {**CLAP_D, "body": 0.5, "bright": 0.8, "room_wet": 0.0, "drive": 2.0}),
]
for v, dec in (("hatClosed", 70), ("hatOpen", 420), ("hatPedal", 35)):
    d = {**HAT_D, "decay": dec}
    CASES += [(v, 4, d), (v, 11, {**d, "machine": 808, "decay": 120 if v != "hatOpen" else 500, "tune": 1.3, "noise": 0.5, "dirt": 1.0}),
              (v, 4, {**d, "start_ms": 6, "lp": 5000, "hp": 4000, "pcm_bits": 8})]
CASES += [
    ("tom", 0, dict(machine=909, tune=20, pitch_drop=8, decay=250, drive=0.1)),
    ("tom", 0, dict(machine=808, tune=26, pitch_drop=12, decay=400, drive=0.5)),
    ("tom", 0, dict(machine=909, tune=8, pitch_drop=3, decay=150, drive=2.0)),
    ("rim", 8, dict(machine=909)), ("rim", 8, dict(machine=808)), ("rim", 21, dict(machine=909)),
    ("cowbell", 0, dict(tune=1.0, dirt=0)), ("cowbell", 0, dict(tune=1.4, dirt=1.5)), ("cowbell", 0, dict(tune=0.7, dirt=0)),
    ("conga", 0, dict(tune=32, decay=140, dirt=0)), ("conga", 0, dict(tune=40, decay=300, dirt=1.0)), ("conga", 0, dict(tune=24, decay=80, dirt=0)),
    ("ride", 6, dict(machine=909, pcm_bits=-1, dirt=0)), ("ride", 13, dict(machine=808, pcm_bits=-1, dirt=1.0)),
    ("ride", 6, dict(machine=909, pcm_bits=8, dirt=0)),
]

cases = []
for voice, seed, params in CASES:
    y = np.asarray(VOICES[voice](params, seed), dtype=np.float64)
    cases.append({
        "voice": voice, "seed": seed, "params": params, "length": int(len(y)),
        "rms": seq_rms(y),
        "samples": [float(v) for v in y[::KEEP]],
    })

with open(OUT, "w") as f:
    json.dump({"rate": RATE, "keep": KEEP, "cases": cases}, f, separators=(",", ":"))
print("wrote", OUT, len(cases), "cases", os.path.getsize(OUT), "bytes")
