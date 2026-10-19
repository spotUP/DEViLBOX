"""Writes src/engine/uprough/__tests__/fixtures/portable_iir.json: tools/portable_iir.py's tan, sin / cos
kernels and butter() coefficients, for the bit-exact test of src/engine/dj/scratch/portableIir.ts.
Values are float64 repr (round-trips exactly through JSON).
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_portable_iir.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools src/engine/uprough/__tests__/fixtures/portable_iir.json
"""
import importlib.util
import json
import math
import os
import sys

import numpy as np

TOOLS, OUT = sys.argv[1], sys.argv[2]
sys.path.insert(0, TOOLS)
sp = importlib.util.spec_from_file_location("portable_iir", os.path.join(TOOLS, "portable_iir.py"))
piir = importlib.util.module_from_spec(sp)
sp.loader.exec_module(piir)

rng = np.random.RandomState(11)
# tan over the whole supported range plus both branch edges; kernels over [-pi/4, pi/4]
tan_x = sorted(set([0.0, 1e-9, 0.6744, 0.7853981633974483, 0.7853981633974484, 1.5]
                   + [float(v) for v in rng.uniform(0.0, piir.TAN_MAX * 0.9999, 400)]))
kern_x = [float(v) for v in rng.uniform(-math.pi / 4, math.pi / 4, 200)]
cases = []
for n in range(1, 9):
    for wn in (0.001, 0.0123, 0.05, 0.25, 0.5, 0.75, 0.99):
        for kind in ("low", "high"):
            b, a = piir.butter(n, wn, kind)
            cases.append({"N": n, "Wn": wn, "btype": kind, "b": b.tolist(), "a": a.tolist()})
    for lo, hi in ((0.001, 0.01), (0.02, 0.3), (0.1, 0.9), (0.4, 0.42)):
        b, a = piir.butter(n, (lo, hi), "band")
        cases.append({"N": n, "Wn": [lo, hi], "btype": "band", "b": b.tolist(), "a": a.tolist()})
# the synth_dsp corners the song path actually designs (44.1 / 22.05 / 28.6 kHz rates)
for rate in (44100.0, 22050.0, 28603.0):
    for fc in (40.0, 120.0, 900.0, 3500.0, 7000.0):
        wn = min(0.99, max(0.001, fc / (rate / 2.0)))
        for n, kind in ((2, "low"), (2, "high"), (4, "high")):
            b, a = piir.butter(n, wn, kind)
            cases.append({"N": n, "Wn": wn, "btype": kind, "b": b.tolist(), "a": a.tolist()})

out = {
    "tan": [[x, piir.tan(x)] for x in tan_x],
    "sin": [[x, piir._kernel_sin(x)] for x in kern_x],
    "cos": [[x, piir._kernel_cos(x)] for x in kern_x],
    "butter": cases,
}
with open(OUT, "w") as f:
    json.dump(out, f)
print("tan %d kernels %d butter %d" % (len(out["tan"]), len(kern_x), len(cases)))
