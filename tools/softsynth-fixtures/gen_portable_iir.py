"""Writes src/engine/uprough/__tests__/fixtures/portable_iir.json: tools/portable_iir.py's tan, sin / cos, tools/portable_math.py's exp / expm1 / tanh / sin / cos
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
sys.modules["portable_iir"] = piir
sp = importlib.util.spec_from_file_location("portable_math", os.path.join(TOOLS, "portable_math.py"))
pm = importlib.util.module_from_spec(sp)
sp.loader.exec_module(pm)

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

# portable_math: every branch of exp / expm1 / tanh, and sin / cos up to oscillator phases (2 pi f t, minutes long)
def _span(*parts):
    return [float(v) for p in parts for v in p]
math_x = {
    "exp": _span(rng.uniform(-745.0, 709.7, 300), rng.uniform(-2.0, 2.0, 300), rng.uniform(-1e-8, 1e-8, 20),
                 [0.0, -0.0, 0.25, 0.3465735902799726, 0.5, 1.0397207708399179, 709.78, -745.1, -708.5, -720.0]),
    "expm1": _span(rng.uniform(-60.0, 60.0, 300), rng.uniform(-1.2, 1.2, 300), rng.uniform(-1e-9, 1e-9, 20),
                   [0.0, 1e-17, 0.3, -0.3, 0.5, -0.5, -0.26, 13.0, 30.0, 40.0, 45.0, 700.0]),
    "tanh": _span(rng.uniform(-25.0, 25.0, 300), rng.uniform(-1.5, 1.5, 300), rng.uniform(-1e-8, 1e-8, 20),
                  [0.0, -0.0, 1.0, -1.0, 22.0, -22.0, 0.999999, 21.9]),
    "sin": _span(rng.uniform(-4.0, 4.0, 300), rng.uniform(-3e3, 3e3, 200), rng.uniform(-2e7, 2e7, 200),
                 rng.uniform(-1e10, 1e10, 50), [0.0, -0.0, 1e-9, math.pi / 4, math.pi, 2 * math.pi, 1e5 * math.pi]),
}
math_x["cos"] = math_x["sin"]
# asin: every fdlibm branch (tiny, |x| < 0.5, 0.5 .. 0.975, 0.975 .. 1, +-1, outside) plus triangle-oscillator inputs
math_x["asin"] = _span(rng.uniform(-1.0, 1.0, 400), rng.uniform(0.5, 1.0, 100), rng.uniform(0.97, 1.0, 50),
                       rng.uniform(-1e-8, 1e-8, 20),
                       [0.0, -0.0, 1e-9, 0.5, -0.5, 0.49999999, 0.975, 0.9749999, -0.975, 0.9999999999, 1.0, -1.0])

# portable_resample: the cephes I0, the Kaiser firwin and the polyphase sum (refDsp besselI0 / firwinKaiser / resamplePoly)
import portable_resample as pres  # noqa: E402
i0_x = _span(rng.uniform(0.0, 8.0, 100), rng.uniform(8.0, 40.0, 50), [0.0, 5.0, 8.0, 8.000001])
resample_in = [float(v) for v in rng.uniform(-1.0, 1.0, 700)]
resample = [{"up": u, "down": d, "y": pres.resample_poly(np.array(resample_in), u, d).tolist()}
            for u, d in ((1, 2), (2, 1), (1, 3), (1000, 1059), (1999, 1000), (147, 160), (3, 3))]
firwin = [{"numtaps": nt, "cutoff": c, "h": pres.firwin_kaiser(nt, c, 5.0).tolist()} for nt, c in ((21, 0.5), (41, 0.5), (601, 1.0 / 30))]

out = {
    "tan": [[x, piir.tan(x)] for x in tan_x],
    "sin": [[x, piir._kernel_sin(x)] for x in kern_x],
    "cos": [[x, piir._kernel_cos(x)] for x in kern_x],
    "butter": cases,
    "i0": [[x, float(pres.bessel_i0(np.array([x]))[0])] for x in i0_x],
    "resample_in": resample_in,
    "resample": resample,
    "firwin": firwin,
    "math": {name: [[x, float(getattr(pm, name)(x))] for x in xs] for name, xs in math_x.items()},
}
with open(OUT, "w") as f:
    json.dump(out, f)
print("tan %d kernels %d butter %d math %d" % (len(out["tan"]), len(kern_x), len(cases),
                                              sum(len(v) for v in out["math"].values())))
