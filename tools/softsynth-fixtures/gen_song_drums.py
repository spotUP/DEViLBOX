"""Writes src/engine/uprough/__tests__/fixtures/song_drums.json: the drums lane of whole songs, for the null test of
src/engine/uprough/songDrums.ts (plan 2026-10-19 O6e-w).

Each case is a song file doc (song_file.export of hiphop.generate_events) and, per section, the host's drums_buf as
render_section hands it to trim_drums_to_peak: the sum of MIX_GAINS["drums"] * render_drum_bar over the bars, length
bars * bar_len + rate. The capture wraps hiphop.trim_drums_to_peak, which render_section calls once per section and
only when HIPHOP_DRUM_BUS_HEADROOM and lay["drums"] (and not decide_only); a section with no call is all zeros, and
the generator asserts that against the section's layers (arrangement lay, or the stem / section fast-path rules)
instead of assuming it. A case is either a song file doc (the TS input is songFileToBarEvents(doc)) or, for the params.section fast path that
a song file cannot hold, the host's events themselves. Each lane is stored as {n, sha (sha256 of the little-endian float64 bytes), head (base64 of
the first 300 samples), peak}; "called" says whether the host ran the drums for that section.
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_song_drums.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools src/engine/uprough/__tests__/fixtures/song_drums.json
"""
import base64
import hashlib
import importlib.util
import json
import os
import sys

import numpy as np

TOOLS, OUT = sys.argv[1], sys.argv[2]
sys.path.insert(0, TOOLS)


def load(name):
    sp = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


sf = load("song_file")
hh = load("hiphop")


def arr(a):
    b = np.asarray(a, dtype=np.float64).astype("<f8").tobytes()
    return {"n": len(b) // 8, "sha": hashlib.sha256(b).hexdigest(), "head": base64.b64encode(b[:300 * 8]).decode(),
            "peak": float(np.max(np.abs(a))) if len(a) else 0.0}


def expected_layers(events):
    """The drums flag of each section as render_section sees it, from the events alone."""
    p = events["params"]
    if p["section"]:
        return [0 if p["section"] == "breakdown" else 1]
    return [lay["drums"] for _, _, lay in events["arrangement"]]


def capture(events):
    """render_events with a recording trim_drums_to_peak: the drums_buf of every section that ran its drums."""
    seen = []
    real = hh.trim_drums_to_peak

    def spy(buf):
        seen.append(np.array(buf, dtype=np.float64))
        return real(buf)

    hh.trim_drums_to_peak = spy
    try:
        hh.render_events(events)
    finally:
        hh.trim_drums_to_peak = real
    return seen


def run(name, style, seed, bars, rate=22050, **kw):
    events = hh.generate_events(style, seed, bars=bars, rate=rate, **kw)
    doc = None
    if events["arrangement"] if "arrangement" in events else False:
        doc = sf.export(events)                       # a song file; the section fast path has no arrangement to export
        sf.validate(doc)
        events = sf.to_events(doc)
    seen = capture(events)
    flags = expected_layers(events)
    if events["params"]["stem"]:
        flags = [1 if events["params"]["stem"] == "drums" else 0] * len(flags)
    assert len(seen) == sum(flags), (name, len(seen), flags)
    it = iter(seen)
    lanes = []
    for i, on in enumerate(flags):
        nb = len(events["sections"][i]["drums"])
        if on:
            buf = next(it)
            bar_len = int(rate * 60.0 / (hh.STYLES[style]["tempo"] * 4)) * 16
            assert len(buf) == nb * bar_len + int(1.0 * rate), (name, i, len(buf))
        else:
            buf = np.zeros(nb * (int(rate * 60.0 / (hh.STYLES[style]["tempo"] * 4)) * 16) + int(1.0 * rate))
        lanes.append({"called": bool(on), "bars": nb, "drops": [d["drop"] for d in events["sections"][i]["drums"]],
                      "buf": arr(buf)})
    return {"name": name, "style": style, "rate": rate, "bpm": hh.STYLES[style]["tempo"], "doc": doc, "events": None if doc else events, "lanes": lanes}


cases = [
    run("trap-8bars", "trap", 6, 8),
    run("golden_era-8bars", "golden_era", 3, 8),
    run("lofi-8bars", "lofi", 7, 8),
    run("trap-16bars-drop-drums", "trap", 2, 16),     # bar 2 of section 0 drops the drums layer
    run("boom_bap-section-hook", "boom_bap", 9, 2, section="hook"),
    run("boom_bap-section-breakdown", "boom_bap", 9, 1, section="breakdown"),
]
try:
    cases.append(run("miami_bass-stem-bass", "miami_bass", 4, 4, stem="bass"))
except Exception as ex:  # a host or song-file refusal here is a fact about them, not a case
    print("stem case skipped:", repr(ex)[:120])

with open(OUT, "w", encoding="utf-8") as f:
    json.dump({"cases": cases}, f, separators=(",", ":"), allow_nan=False)
for c in cases:
    print(c["name"], [(l["called"], l["bars"], [d for d in l["drops"] if d]) for l in c["lanes"]])
print(len(cases), "cases", os.path.getsize(OUT), "bytes")
