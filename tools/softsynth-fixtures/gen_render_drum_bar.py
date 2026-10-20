"""Writes src/engine/uprough/__tests__/fixtures/render_drum_bar.json: whole bars from tools/hiphop.py render_drum_bar,
for the null test of src/engine/uprough/renderDrumBar.ts. Each bar stores the float64 output as {n, sha (sha256 of the
little-endian float64 bytes), head (base64 of the first 300 samples)} and the sentinels: the hat stream position (the
next random() after the bar), ProbabilityMemory w/last, and the skipped-event count (bank voice missing).
A run is a list of bars sharing one bank, and either one shared pool + ProbabilityMemory built from the SONG seed the way
_render_song does (shared != null; bar seed = song seed + b) or a standalone call per bar (pool from the bar seed).
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_render_drum_bar.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools src/engine/uprough/__tests__/fixtures/render_drum_bar.json .
"""
import base64
import hashlib
import importlib.util
import json
import os
import random
import sys

import numpy as np

TOOLS, OUT = sys.argv[1], sys.argv[2]
sys.path.insert(0, TOOLS)


def load(name):
    sp = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


hh = load("hiphop")
pe = load("phrase_engine")


def arr(a):
    b = np.asarray(a, dtype=np.float64).astype("<f8").tobytes()
    return {"n": len(b) // 8, "sha": hashlib.sha256(b).hexdigest(), "head": base64.b64encode(b[:300 * 8]).decode()}


_banks = {}


def bank_for(style, rate, bseed, drop):
    k = (style, rate, bseed)
    if k not in _banks:
        _banks[k] = hh.drum_bank(style, rate, bseed)
    return {v: s for v, s in _banks[k].items() if v not in drop}


def host_events(evs):
    """JSON event -> the host's input: a list is a tuple, a dict is a phrase_engine Note."""
    out = []
    for e in evs:
        if isinstance(e, list):
            out.append(tuple(e))
        else:
            out.append(pe.Note(step=e["step"], voice=e["voice"], kind=e["kind"], vel=e["vel"],
                               micro_ms=e.get("micro_ms", 0.0), sub=[tuple(x) if isinstance(x, list) else x for x in e.get("sub", [])]))
    return out


class Spy:
    rngs = []
    pms = []


class SpyRandom(random.Random):
    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        Spy.rngs.append(self)


class SpyPM(pe.ProbabilityMemory):
    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        Spy.pms.append(self)


def run_bar(style, evs, bpm, rate, bank, seed, pool, pm):
    Spy.rngs, Spy.pms = [], []
    real_random, real_pm = random.Random, hh.ProbabilityMemory
    random.Random, hh.ProbabilityMemory = SpyRandom, SpyPM
    try:
        buf = hh.render_drum_bar(style, host_events(evs), bpm, rate, bank, seed=seed, hat_pool=pool, hat_pm=pm)
    finally:
        random.Random, hh.ProbabilityMemory = real_random, real_pm
    rng = Spy.rngs[-1]  # created after the pool: the bar's hat stream
    assert len(buf) == int(rate * 60.0 / (bpm * 4)) * 16
    use_pm = pm if pm is not None else Spy.pms[-1]
    skipped = sum(1 for e in evs if (e[0] if isinstance(e, list) else e["voice"]) not in bank)
    return {"seed": seed, "events": evs, "buf": arr(buf), "next": rng.random(), "w": list(use_pm.w), "last": use_pm.last,
            "skipped": skipped, "peak": float(np.max(np.abs(buf)))}


def run(name, style, bpm, rate, bars, bseed=3, drop=(), shared=None):
    bank = bank_for(style, rate, bseed, drop)
    pool = pm = None
    if shared:
        pool = hh.build_hat_pool(style, rate, shared["song_seed"], n=shared["n"])
        pm = hh.ProbabilityMemory(len(pool))
    out = []
    for b, (seed, evs) in enumerate(bars):
        out.append(run_bar(style, evs, bpm, rate, bank, seed, pool, pm))
    return {"name": name, "style": style, "bpm": bpm, "rate": rate, "bank_seed": bseed, "drop": list(drop),
            "shared": shared, "bars": out}


def N(voice, step, vel, kind="single", micro_ms=0.0, sub=None):
    return {"voice": voice, "step": step, "vel": vel, "kind": kind, "micro_ms": micro_ms, "sub": sub or []}


KIT = [["kick", 0, 1.0, "downbeat"], ["snare", 4, 1.0, "backbeat"], ["kick", 6, 0.8, "single"],
       ["snare", 3, 0.4, "ghost"], ["snare", 7, 0.5, "single"], ["clap", 6, 0.7, "single"], ["rim", 11, 0.5, "single"],
       ["tom", 13, 0.8, "single"], ["perc", 9, 0.6, "roll"], ["perc", 9, 0.6, "roll"], ["kick", 8, 0.9, "single"],
       ["snare", 12, 0.95, "backbeat"], ["snare", 15, 0.5, "accent"], ["tom", 15, 0.9, "single"],
       ["conga", 10, 0.6, "single"], ["shaker", 2, 0.5, "single"]]
CH16 = [["ch", s, 0.6 + 0.02 * (s % 4), "single"] for s in range(16)]
HAT_NOTES = [N("ch", 0, 100), N("ch", 2, 90, micro_ms=7.5), N("ch", 3, 80, sub=[[40.0, 0.5], [80.0, 0.4]]),
             N("ch", 5, 85, sub=[[30.0, 0.7], [60.0, 0.6], [90.0, 0.5]]),
             N("ch", 8, 95, sub=[["choke_at_ms", 50.0, False]]),                 # stray choke on ch: ignored
             N("ch", 9, 70, sub=[[10.0, 0.5, 1]]),                               # 3-entry non-choke: ignored
             N("ch", 14, 90, micro_ms=-3.0, sub=[[3000.0, 0.5], [20.0, 0.6]]),   # first roll hit lands past the buffer end
             N("ch", 15, 100, micro_ms=12.0, sub=[[400.0, 0.5], [900.0, 0.3]]),  # rolls past the buffer end
             N("oh", 6, 100, sub=[["choke_at_ms", 90.0, False]]),                # full choke
             N("oh", 10, 100, sub=[["choke_at_ms", 120.0, True]]),               # partial choke
             N("oh", 12, 90), N("oh", 13, 90, sub=[["choke_at_ms", 3.0], [25.0, 0.5]])]
MIXED = [KIT[0], KIT[1], N("ch", 0, 100), N("kick", 8, 110, "downbeat"), N("snare", 4, 120, "backbeat"),
         N("ch", 1, 90, micro_ms=6.0, sub=[[35.0, 0.5]]), N("oh", 2, 100, sub=[["choke_at_ms", 70.0, True]]),
         N("snare", 3, 50, "ghost", 2.0), N("perc", 11, 70, "roll"), ["kick", 7, 0.7, "single"],
         N("ch", 4, 80), ["ch", 6, 0.7, "single"], N("clap", 12, 100), N("oh", 14, 95), N("zzz", 5, 80)]

cases = []
for style in ("boom_bap", "trap", "golden_era", "lofi", "miami_bass"):
    cases.append(run("kit-" + style, style, 90, 22050, [(7, KIT)]))
cases.append(run("kit-boom_bap-44100", "boom_bap", 84, 44100, [(7, KIT)]))
cases.append(run("hats-ch16-trap", "trap", 90, 22050, [(11, CH16)]))
cases.append(run("hats-notes-boom_bap", "boom_bap", 90, 22050, [(5, HAT_NOTES)]))
cases.append(run("hats-notes-44100", "lofi", 84, 44100, [(5, HAT_NOTES)]))
for style in ("golden_era", "trap", "lofi"):
    cases.append(run("mixed-" + style, style, 92, 22050, [(21, MIXED), (22, MIXED)]))
# missing voices: oh and zzz absent (skipped before any draw), then a hat after them
cases.append(run("missing-oh", "boom_bap", 90, 22050, [(9, MIXED)], drop=("oh",)))
cases.append(run("missing-kick-snare", "trap", 90, 22050, [(9, MIXED)], drop=("kick", "snare", "clap")))
# three consecutive bars: song-seed pool + memory vs standalone (bar-seed pool, fresh memory)
three = [(40 + b, MIXED if b != 1 else HAT_NOTES + KIT[:4]) for b in range(3)]
cases.append(run("shared-3bars", "boom_bap", 90, 22050, three, shared={"song_seed": 40, "n": 8}))
cases.append(run("shared-3bars-n12", "trap", 90, 22050, three, shared={"song_seed": 40, "n": 12}))
cases.append(run("standalone-3bars", "boom_bap", 90, 22050, three))
# seed edges
for sd in (0, 2 ** 28 + 3, 2 ** 31 + 5):
    try:
        cases.append(run("seed-%d" % sd, "boom_bap", 90, 22050, [(sd, MIXED)]))
    except Exception as ex:  # a host failure here is a fact about the host, not a case
        print("seed", sd, "host raises:", repr(ex)[:80])
# bar end: step 15 with swing and a long tom, an event late in a fast bar
cases.append(run("bar-end", "boom_bap", 140, 22050, [(3, [["tom", 15, 1.0, "single"], N("ch", 15, 127, micro_ms=30.0, sub=[[500.0, 0.5]]),
                                                         ["kick", 14, 1.0, "single"]])]))
# empty and hat-only-no-pool-use
cases.append(run("empty", "trap", 90, 22050, [(1, [])]))

with open(os.path.join(OUT) if os.path.isabs(OUT) else OUT, "w") as f:
    json.dump({"cases": cases}, f, separators=(",", ":"))
print(len(cases), "cases", os.path.getsize(OUT), "bytes")
