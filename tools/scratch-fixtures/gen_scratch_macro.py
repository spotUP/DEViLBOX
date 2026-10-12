"""Writes src/engine/dj/scratch/__tests__/fixtures/scratch_macro.json: the Up Rough demo's macro language
(scratch.py `parse_macro` / `render_macro`, crossfader s.40; ledger G11) on a crate record, for the
DEViLBOX port's null test.

  For each script: parse_macro's segments, cut, anchor and skipped lines, and render_macro's output
  (the default battle deck, offline physics, the fader from the open windows or the transform cut)
  on the record as the demo's bank reads it (`bank_sources`: 22,050 Hz, the S950), every KEEP-th
  sample (float64 repr).

  /opt/homebrew/bin/python3.11 -I tools/scratch-fixtures/gen_scratch_macro.py \
    /Users/spot/Code/Up_Rough_Demo_System/tools src/engine/dj/scratch/__tests__/fixtures/scratch_macro.json
"""
import importlib.util
import json
import os
import sys

TOOLS, OUT = sys.argv[1], sys.argv[2]
RATE = 22050
KEEP = 3
RECORD = "AH_YEAH"


def load(name):
    sp = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


sc = load("scratch")
src = sc.bank_sources(RATE, [RECORD])[RECORD]

CASES = [
    dict(text="ANCHOR 440\nMOVE_FWD 1 2\nMOVE_REV 1 2\nCUT 4 2", tempo=92, velocity=1.0),
    dict(text="FADER_CLOSE\nMOVE_FWD 0.5 1\nFADER_OPEN\nmove_rev 2 1\n\n  MOVE_FWD 1 4  ", tempo=92, velocity=1.0),
    dict(text="MOVE_FWD 1.5 3\nCUT 0.5 2\nbogus 1\nANCHOR\nMOVE_REV x 2\nANCHOR 1.5\nMOVE_REV 1 1_0", tempo=100, velocity=0.6),
    dict(text="", tempo=92, velocity=1.0),
    dict(text="ANCHOR 2000\nMOVE_FWD 2 1\nMOVE_REV 2 1\nMOVE_FWD 2 1\nMOVE_REV 2 1\nCUT 3 4", tempo=88, velocity=0.9),
]

out = dict(rate=RATE, keep=KEEP, record=RECORD, cases=[])
for c in CASES:
    p = sc.parse_macro(c["text"], tempo=c["tempo"], anchor=src["anchor"], rate=RATE)
    y = sc.render_macro(src, c["text"], RATE, tempo=c["tempo"], velocity=c["velocity"])
    out["cases"].append(dict(
        text=c["text"], tempo=c["tempo"], velocity=c["velocity"],
        segs=[[float(d), float(a), bool(o)] for d, a, o in p["segs"]],
        cut=None if p["cut"] is None else [int(p["cut"][0]), float(p["cut"][1])],
        anchor=int(p["anchor"]), errors=p["errors"], stepS=float(p["step_s"]),
        n=len(y), out=[float(v) for v in y[::KEEP]],
    ))
json.dump(out, open(OUT, "w"))
print("ok", [(len(c["segs"]), c["errors"], c["n"]) for c in out["cases"]])
