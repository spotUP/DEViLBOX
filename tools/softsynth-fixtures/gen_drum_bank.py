"""Writes src/engine/uprough/__tests__/fixtures/drum_bank.json: the bank tools/hiphop.py _render_song plays,
add_snare_ghost(add_snare_accent(drum_bank(style, rate, seed))), for every style, for the null test of
src/engine/uprough/drumBank.ts. Also _boombap_snare alone for each hard/dark combination.

The voices that do not depend on the style (clap, rim, tom, conga, cowbell, shaker, tamb, metal, ride) depend
only on the drum machine, so they are stored once per machine; the generator checks every bank against them.
Each voice: the sample count, every KEEP-th sample (float64 repr) and the RMS summed left to right.
Styles at seed 0 (what _render_song passes); jazz_rap and east_coast also at seed 3 (the seed reaches the snare).
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_drum_bank.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools src/engine/uprough/__tests__/fixtures/drum_bank.json
"""
import importlib.util
import json
import math
import os
import sys

import numpy as np

TOOLS, OUT = sys.argv[1], sys.argv[2]
sys.path.insert(0, TOOLS)
RATE = 22050
KEEP = 13


def load(name):
    sp = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


def seq_rms(y):
    s = 0.0
    for v in y.tolist():
        s += v * v
    return math.sqrt(s / len(y))


def pin(y):
    y = np.asarray(y, dtype=np.float64)
    return {"n": len(y), "kept": y[::KEEP].tolist(), "rms": seq_rms(y)}


hh = load("hiphop")
hk = load("hiphop_kit")

STYLE_VOICES = ("kick", "snare", "ch", "oh", hk.SNARE_ACCENT_VOICE, hk.SNARE_GHOST_VOICE)
banks, shared, raw = [], {}, {}
for style in hh.STYLES:
    machine = "808" if hh.STYLES[style]["kit"] in ("808", "electro") else "909"
    for seed in (0, 3) if style in ("jazz_rap", "east_coast") else (0,):
        bank = hk.add_snare_ghost(hk.add_snare_accent(hh.drum_bank(style, RATE, seed=seed)), RATE)
        rest = {k: v for k, v in bank.items() if k not in STYLE_VOICES}
        if machine not in raw:
            raw[machine] = rest
            shared[machine] = {k: pin(v) for k, v in rest.items()}
        elif list(rest) != list(raw[machine]) or not all(np.array_equal(v, raw[machine][k]) for k, v in rest.items()):
            raise SystemExit("%s: a shared voice differs from the %s set" % (style, machine))
        banks.append({"style": style, "seed": seed, "machine": machine, "keys": list(bank),
                      "voices": {k: pin(bank[k]) for k in STYLE_VOICES}})
snares = [{"hard": h, "dark": d, "seed": s, "y": pin(hh._boombap_snare(RATE, hard=h, dark=d, seed=s))}
          for h in (False, True) for d in (False, True) for s in (2, 9)]

with open(OUT, "w", encoding="utf-8") as f:
    json.dump({"rate": RATE, "keep": KEEP, "banks": banks, "shared": shared, "boombap_snares": snares}, f, separators=(",", ":"), allow_nan=False)
print("%d banks, %d snares -> %s (%d bytes)" % (len(banks), len(snares), OUT, os.path.getsize(OUT)))
