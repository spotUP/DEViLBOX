"""Writes src/engine/uprough/__tests__/fixtures/song_bass.json: the bass lane of whole songs, for the null test of
src/engine/uprough/songBass.ts (plan 2026-10-19 O6f, O6g).

Each case is a song file doc (song_file.export of hiphop.generate_events) or, for the params.section fast path, the
host's events. Per section the lane is the host's bass_buf as the whole-808 block of render_section leaves it: the
capture wraps hiphop._t8.render_808 (called once per section that renders the 808 line, only when whole_808 and
lay["bass"] and there are events) and hiphop.bass_gain (the gain render_section uses), then rebuilds the lane with the
host's own two lines: sig - mean(sig), and bass_buf[:n] += g * sig[:n] into zeros of bars * bar_len + rate. A section
with no call is all zeros; the generator asserts that against the section's layers instead of assuming it.
A section that is not whole-808 (render.use_trap808 false) renders render_bass_bar per bar instead; the capture wraps
hiphop.render_bass_bar too and rebuilds those lanes with the host's line bass_buf[o:o + len(bs)] += g * bs at
o = b * bar_len, one call per bar whose bass layer plays. bass_voice is the style's bass_voice, which the song file
carries as bar.bass.voice.
Also dumps hiphop.style_808_profile for every style (profiles) and plan_kick_relationship at the classifier
boundaries (plans). Each lane is {n, off, sha, peak}: the lane's samples sit at sample offset off in the companion file
song_bass.lanes.br (every lane of every case, concatenated as little-endian float64, byte-shuffled into eight planes
of one byte per sample, brotli quality 11; full float64 lanes are 34 MB raw, 13.6 MB this way), sha is the sha256 of the
lane's float64 bytes, so the test proves the decode before it compares. "layered" is the number of notes the host's
plan softens.
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_song_bass.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools src/engine/uprough/__tests__/fixtures/song_bass.json
"""
import brotli
import dataclasses
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
t8 = hh._t8


LANES = []
LANES_OUT = OUT[:-len(".json")] + ".lanes.br"


def arr(a):
    v = np.asarray(a, dtype=np.float64).astype("<f8")
    off = sum(len(x) for x in LANES)
    LANES.append(v)
    return {"n": len(v), "off": off, "sha": hashlib.sha256(v.tobytes()).hexdigest(),
            "peak": float(np.max(np.abs(v))) if len(v) else 0.0}


def expected_flags(events):
    p = events["params"]
    if p["stem"]:
        return [1 if p["stem"] == "bass" else 0] * len(events["sections"])
    if p["section"]:
        return [0 if p["section"] == "breakdown" else 1]
    return [lay["bass"] for _, _, lay in events["arrangement"]]


def capture(events):
    calls, bars, gains = [], [], []
    real_r, real_g, real_b = t8.render_808, hh.bass_gain, hh.render_bass_bar

    def spy_b(*a, **k):
        bs = real_b(*a, **k)
        bars.append(np.array(bs, dtype=np.float64))
        return bs

    def spy_r(ev, *a, **k):
        sig, info = real_r(ev, *a, **k)
        calls.append({"sig": np.array(sig, dtype=np.float64), "plan": k.get("kick_plan"), "n_events": len(ev)})
        return sig, info

    def spy_g(view):
        g = real_g(view)
        gains.append(g)
        return g

    t8.render_808, hh.bass_gain, hh.render_bass_bar = spy_r, spy_g, spy_b
    try:
        hh.render_events(events)
    finally:
        t8.render_808, hh.bass_gain, hh.render_bass_bar = real_r, real_g, real_b
    return calls, bars, gains


def run(name, style, seed, bars, rate=22050, **kw):
    events = hh.generate_events(style, seed, bars=bars, rate=rate, **kw)
    doc = None
    if events.get("arrangement"):
        doc = sf.export(events)
        sf.validate(doc)
        events = sf.to_events(doc)
    calls, bar_calls, gains = capture(events)
    assert len(set(gains)) == 1, (name, gains)
    g = gains[0]
    assert g == hh.MIX_GAINS["bass"], (name, g)         # bass_bus_level is 1.0 on this path; the TS option defaults to it
    bpm = hh.STYLES[style]["tempo"]
    bar_len = int(rate * 60.0 / (bpm * 4)) * 16
    flags = expected_flags(events)
    whole808 = hh._resolve_use_trap808(style, events["params"].get("use_trap808")) and hh.is_808_style(style)
    it, bit = iter(calls), iter(bar_calls)
    lanes, layered_total, per_bar_total = [], 0, 0
    for i, on in enumerate(flags):
        sec = events["sections"][i]
        nb = len(sec["drums"])
        buf = np.zeros(nb * bar_len + int(1.0 * rate))
        called, per_bar = False, 0
        has_ev = any(d["drop"] != "bass" and sec["bass"][b] for b, d in enumerate(sec["drums"]))
        if on and not whole808:
            for b, d in enumerate(sec["drums"]):
                if d["drop"] == "bass" or not sec["bass"][b]:
                    continue
                bs = next(bit)
                o = b * bar_len
                buf[o:o + len(bs)] += g * bs
                per_bar += 1
            per_bar_total += per_bar
        elif on and has_ev:
            c = next(it)
            called = True
            sig = c["sig"] - np.mean(c["sig"])
            n = min(len(buf), len(sig))
            buf[:n] += g * sig[:n]
            layered = sum(1 for r in (c["plan"] or []) if r["soften_attack"])
            layered_total += layered
        lanes.append({"called": called, "per_bar": per_bar, "bars": nb, "drops": [d["drop"] for d in sec["drums"]],
                      "layered": layered if called else 0, "buf": arr(buf)})
    assert next(it, None) is None, (name, "render_808 called more often than the layers say")
    assert next(bit, None) is None, (name, "render_bass_bar called more often than the layers say")
    song = doc["song"] if doc else None
    return {"name": name, "style": style, "rate": rate, "bpm": bpm, "doc": doc, "events": None if doc else events,
            "groove": song["groove"] if song else sf.style_groove(style), "bass_cut": song["bass_cut"] if song else hh.STYLES[style].get("bass_cut", 1.0),
            "use_trap808": events["params"].get("use_trap808"), "whole808": bool(whole808),
            "bass_voice": hh.STYLES[style]["bass_voice"], "lanes": lanes, "layered": layered_total, "per_bar": per_bar_total}


cases = [
    run("trap-8bars", "trap", 6, 8),
    run("drill-8bars", "drill", 5, 8),
    run("golden_era-8bars", "golden_era", 3, 8),
    run("miami_bass-8bars", "miami_bass", 4, 8),
    run("g_funk-8bars", "g_funk", 2, 8),
    run("industrial-8bars", "industrial", 8, 8),
    run("trap-16bars", "trap", 2, 16),
    run("trap-16bars-drop-bass", "trap", 10, 16),   # a bar of section drops the bass layer: its 808 events leave the merged line
    run("lofi-8bars", "lofi", 7, 8),
    run("trap-stem-drums", "trap", 6, 4, stem="drums"),
    run("boom_bap-section-hook", "boom_bap", 9, 2, section="hook"),
    run("boom_bap-section-breakdown", "boom_bap", 9, 1, section="breakdown"),
    # use_trap808 false: render_bass_bar per bar, one case per bass_voice
    run("golden_era-legacy-sampled", "golden_era", 3, 8, use_trap808=False),
    run("jazz_rap-legacy-electric", "jazz_rap", 4, 8, use_trap808=False),
    run("lofi-legacy-warmsub", "lofi", 7, 8, use_trap808=False),
    run("g_funk-legacy-gfunk", "g_funk", 2, 8, use_trap808=False),
    run("trap-legacy-808-drop-bass", "trap", 10, 16, use_trap808=False),
    run("miami_bass-legacy-electro", "miami_bass", 4, 8, use_trap808=False),
    run("industrial-legacy-reese", "industrial", 8, 8, use_trap808=False),
    run("lofi-legacy-stem-drums", "lofi", 7, 4, stem="drums", use_trap808=False),
    run("boom_bap-legacy-section-hook", "boom_bap", 9, 2, section="hook", use_trap808=False),
]

profiles = {}
for s in hh.STYLE_808_PROFILE:
    for cut in sorted({1.0, hh.STYLES[s].get("bass_cut", 1.0) or 1.0}):
        pass
    prof = hh.style_808_profile(s)
    profiles[s] = {"bass_cut": hh.STYLES[s].get("bass_cut", 1.0), "profile": {k: v for k, v in (dataclasses.asdict(prof) if dataclasses.is_dataclass(prof) else dict(prof)).items()
                                                                                if isinstance(v, (int, float, bool, str))}}

# plan_kick_relationship at the classifier boundaries: one kick at step 4, notes at a delta (ms) from it
BPM = 90.0
sps = (60.0 / BPM) * 4.0 / 16.0
kick_t = 4 * sps
plans = []
for d_ms in [-181.0, -180.0, -179.9, -15.0, -3.1, -3.0, -2.9, 0.0, 2.9, 3.0, 3.1, 3.5, 10.0, 14.9, 15.0, 15.1, 100.0, 179.9, 180.0, 180.1, 400.0]:
    t = kick_t + d_ms * 1e-3
    ev = [{"start_s": t, "dur_s": 0.2, "semi": 36.0, "slide": False}]
    rec = t8.plan_kick_relationship(ev, [4], bpm=BPM, steps_per_bar=16, rate=22050)[0]
    plans.append({"d_ms": d_ms, "start_s": t, "rel": rec["kick_relationship"], "soften": rec["soften_attack"], "soften_ms": rec["soften_attack_ms"],
                  "offset_ms": rec["attack_offset_ms"]})
# two kicks equidistant from a note, and an unsorted kick list (the tie takes the earlier kick)
tie_t = (4 * sps + 8 * sps) / 2.0
tie = t8.plan_kick_relationship([{"start_s": tie_t, "dur_s": 0.2, "semi": 36.0}], [8, 4], bpm=BPM, steps_per_bar=16, rate=22050)[0]
plans.append({"d_ms": None, "start_s": tie_t, "kicks": [8, 4], "rel": tie["kick_relationship"], "soften": tie["soften_attack"], "soften_ms": tie["soften_attack_ms"], "offset_ms": tie["attack_offset_ms"]})

planes = np.concatenate(LANES).view(np.uint8).reshape(-1, 8).T.copy().tobytes()
with open(LANES_OUT, "wb") as f:
    f.write(brotli.compress(planes, quality=11, lgwin=24))
with open(OUT, "w", encoding="utf-8") as f:
    json.dump({"cases": cases, "profiles": profiles, "plans": plans, "plan_bpm": BPM}, f, separators=(",", ":"), allow_nan=False)
for c in cases:
    print(c["name"], c["layered"], c["per_bar"], [(l["called"], l["per_bar"], l["bars"], l["layered"], [d for d in l["drops"] if d]) for l in c["lanes"]])
print(len(cases), "cases", os.path.getsize(OUT), "bytes")
