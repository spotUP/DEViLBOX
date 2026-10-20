"""Writes src/engine/uprough/__tests__/fixtures/py_random.json: CPython random.Random and numpy RandomState.randn
streams for the null test of src/engine/uprough/pyRandom.ts (plan 2026-10-19 O6d-0). Seeds are decimal strings
(they exceed 2^53). No hiphop import needed.
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_py_random.py \
    src/engine/uprough/__tests__/fixtures/py_random.json
"""
import json
import random
import sys

import numpy as np

OUT = sys.argv[1]
SEEDS = [0, 1, 42, -7, 2**31 - 1, 2**32, 2**32 + 5, 2**64 + 3, (123456789 << 4) ^ 3, 0x4A77 ^ (2**40 + 99)]
BITS = (1, 13, 30, 31, 32)

py = []
for s in SEEDS:
    r = random.Random(s)
    e = {"seed": str(s), "random": [r.random() for _ in range(20)]}
    r = random.Random(s)
    e["bits"] = [r.getrandbits(k) for k in BITS]
    r = random.Random(s)
    e["bits_wide"] = [str(r.getrandbits(k)) for k in (33, 64, 70)]
    r = random.Random(s)
    e["randrange30"] = [r.randrange(1 << 30) for _ in range(20)]
    r = random.Random(s)
    e["randrange_5_17"] = [r.randrange(5, 17) for _ in range(12)]
    e["randrange_7"] = [random.Random(s).randrange(7)]
    r = random.Random(s)
    e["uniform"] = [r.uniform(-1.5, 2.0) for _ in range(6)]
    r = random.Random(s)
    mix = []
    for i in range(12):
        mix.append(["r", r.random()])
        mix.append(["b", r.getrandbits(13)])
        mix.append(["g", r.randrange(1 << 30)])
        mix.append(["u", r.uniform(-0.04, 0.04)])
        mix.append(["n", r.randrange(1000)])
    e["mix"] = mix
    py.append(e)

npr = []
for s in [0, 1, 5, 42, 2**30 - 1, 123456, 2**31 - 1]:
    r = np.random.RandomState(s)
    seq = []
    for i in range(9):
        seq.append(["n", float(r.randn())])
        if i % 3 == 1:
            seq.append(["r", float(r.rand())])
    arr = np.random.RandomState(s).randn(64)
    odd = np.random.RandomState(s).randn(7)
    npr.append({"seed": s, "mix": seq, "randn64": [float(x) for x in arr], "randn7": [float(x) for x in odd]})

big = [float(x) for x in np.random.RandomState(2024).randn(1500)]
json.dump({"py": py, "numpy": npr, "randn1500_seed2024": big}, open(OUT, "w"), separators=(",", ":"))
