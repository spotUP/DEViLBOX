"""Writes src/engine/uprough/__tests__/fixtures/humanize.json: synth_dsp.humanize(seed) and hiphop._vary_hit
rendered on a fixed input (RandomState(7).uniform(-1, 1, 2600), regenerated in the test) for the null test of
src/engine/uprough/humanize.ts. Every 5th sample is kept (float64 repr of the float32/float64 result).
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_humanize.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools src/engine/uprough/__tests__/fixtures/humanize.json
"""
import importlib.util
import json
import os
import sys

import numpy as np

TOOLS, OUT = sys.argv[1], sys.argv[2]
KEEP = 5
sys.path.insert(0, TOOLS)


def load(name):
    sp = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


hh = load("hiphop")
x = np.random.RandomState(7).uniform(-1, 1, 2600)
cases = []
for seed in (1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233):
    for tighten in (1.0, 0.5, 1.6):
        h = hh._dsp.humanize(seed * 2311 + 17)
        y = hh._vary_hit(x.copy(), h, tighten=tighten)
        cases.append({"seed": seed * 2311 + 17, "tighten": tighten, "h": {k: float(v) for k, v in h.items()},
                      "dtype": str(np.asarray(y).dtype), "length": len(y), "samples": [float(v) for v in y[::KEEP]]})
with open(OUT, "w") as f:
    json.dump({"keep": KEEP, "cases": cases}, f, separators=(",", ":"))
print(len(cases), sorted({c["dtype"] for c in cases}), os.path.getsize(OUT))
