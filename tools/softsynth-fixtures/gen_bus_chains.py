"""Writes src/engine/uprough/__tests__/fixtures/bus_chains.json: the per-lane bus chains of render_section (plan
2026-10-19 O6i), for the null test of src/engine/uprough/songBuses.ts.

Per section the capture records the lane BEFORE the chain (the argument of trim_drums_to_peak, of the bass
sampler.process call and of sampler.apply_macros, taken from the calls made by render_section itself) and AFTER it (the
arguments of balance_buses, copied before it scales them in place; nothing touches the drums, bass or melody buffers
between the end of the chain and that call). A layer whose chain did not run has no pre lane: its post lane IS the
input. "on" is the host's own layer verdict (did the chain run), "calls" the host's call census for the section, and
"seed" the seed the host passed. Sections outside "keep" store only their length: the test feeds zeros of that length
and compares nothing, which still runs the section-seed advance and the gating over the whole song.

"dirt" is the runtime DIRT table (hiphop_subgenre.apply patches it in place) for all 19 styles, as the chains read it,
and "clean" its _clean_dc form. Lanes sit in bus_chains.lanes.br like song_melody.lanes.br (little-endian float64,
byte-shuffled into eight planes, brotli 11); each lane is {n, off, sha, peak}.
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_bus_chains.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools src/engine/uprough/__tests__/fixtures/bus_chains.json
"""
import brotli
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
sm = hh._sm

LANES = []
LANES_OUT = OUT[:-len(".json")] + ".lanes.br"


def arr(a):
    v = np.asarray(a, dtype=np.float64).astype("<f8")
    off = sum(len(x) for x in LANES)
    LANES.append(v)
    return {"n": len(v), "off": off, "sha": hashlib.sha256(v.tobytes()).hexdigest(),
            "peak": float(np.max(np.abs(v))) if len(v) else 0.0}


def caller_is_render_section():
    return sys._getframe(2).f_code.co_name == "render_section"


def capture(events):
    secs, cur = [], {"calls": {"trim": 0, "drum_bus": 0, "parallel": 0, "process": 0, "macros": 0},
                     "seed": {}, "pre": {}, "args": {}}
    reals = {k: getattr(sm, k) for k in ("drum_bus", "parallel_dirt", "process", "apply_macros")}
    real_trim, real_bal = hh.trim_drums_to_peak, hh.balance_buses
    real_yields = hh.melody_yields

    def melody_yields(view):
        r = real_yields(view)
        cur["yields"] = cur.get("yields", False) or r
        return r

    def trim(drums):
        if sys._getframe(1).f_code.co_name == "render_section":
            cur["calls"]["trim"] += 1
            cur["pre"]["drums"] = np.array(drums, dtype=np.float64)
        return real_trim(drums)

    def drum_bus(x, rate, **kw):
        if caller_is_render_section():
            cur["calls"]["drum_bus"] += 1
            cur["seed"]["drums"] = kw.get("seed")
            cur["args"]["drum_bus"] = {"drive": kw.get("drive"), "resample": kw.get("resample")}
        return reals["drum_bus"](x, rate, **kw)

    def parallel_dirt(x, rate, **kw):
        if caller_is_render_section():
            cur["calls"]["parallel"] += 1
            cur["args"]["parallel"] = kw.get("wet")
        return reals["parallel_dirt"](x, rate, **kw)

    def process(x, profile="mpc60", rate=sm.RATE, *a, **kw):
        if sys._getframe(1).f_code.co_name == "render_section":
            cur["calls"]["process"] += 1
            cur["pre"]["bass"] = np.array(x, dtype=np.float64)
            cur["seed"]["bass"] = kw.get("seed")
            cur["args"]["bass_profile"] = profile
        return reals["process"](x, profile, rate, *a, **kw)

    def apply_macros(x, rate, profile="mpc60", **kw):
        # render_section also ages the scratch lane through apply_macros (line ~7025); only the melody call
        # (6772) is this chain.
        f = sys._getframe(1)
        if f.f_code.co_name == "render_section" and 6765 <= f.f_lineno <= 6780:
            cur["calls"]["macros"] += 1
            cur["pre"]["melody"] = np.array(x, dtype=np.float64)
            cur["seed"]["melody"] = kw.get("seed")
            cur["args"]["melody_profile"] = profile
            cur["args"]["melody_dust"] = kw.get("dust")
        return reals["apply_macros"](x, rate, profile, **kw)

    def balance(drums, bass, sample, melody, *a, **kw):
        post = {"drums": np.array(drums, dtype=np.float64), "bass": np.array(bass, dtype=np.float64),
                "melody": np.array(melody, dtype=np.float64)}
        secs.append(dict(cur, calls=dict(cur["calls"]), post=post))
        for k in cur["calls"]:
            cur["calls"][k] = 0
        cur["seed"], cur["pre"], cur["args"] = {}, {}, {}
        return real_bal(drums, bass, sample, melody, *a, **kw)

    sm.drum_bus, sm.parallel_dirt, sm.process, sm.apply_macros = drum_bus, parallel_dirt, process, apply_macros
    hh.trim_drums_to_peak, hh.balance_buses, hh.melody_yields = trim, balance, melody_yields
    try:
        hh.render_events(events)
    finally:
        for k, v in reals.items():
            setattr(sm, k, v)
        hh.trim_drums_to_peak, hh.balance_buses, hh.melody_yields = real_trim, real_bal, real_yields
    return secs, cur.get("yields", False)


def run(name, style, seed, bars, keep=None, rate=22050, edit=None, yields=False, **kw):
    saved = hh.STYLES[style].get("melody_yields")
    if yields:
        hh.STYLES[style]["melody_yields"] = True
    try:
        events = hh.generate_events(style, seed, bars=bars, rate=rate, **kw)
        doc = None
        if events.get("arrangement"):
            doc = sf.export(events)
            sf.validate(doc)
            events = sf.to_events(doc)
        if edit:
            edit(events)
            doc = None      # the edited events are the case; the test reads them as they are
        secs, view_yields = capture(events)
    finally:
        if yields:
            if saved is None:
                del hh.STYLES[style]["melody_yields"]
            else:
                hh.STYLES[style]["melody_yields"] = saved
    assert len(secs) == len(events["sections"]), (name, len(secs), len(events["sections"]))
    keep = range(len(secs)) if keep is None else keep
    out = []
    bseed = seed
    for i, (s, es) in enumerate(zip(secs, events["sections"])):
        nb = len(es["drums"])
        on = {"drums": s["calls"]["trim"] > 0 or s["calls"]["drum_bus"] > 0, "bass": s["calls"]["process"] > 0,
              "melody": s["calls"]["macros"] > 0}
        for lane, k in (("drums", "drum_bus"), ("bass", "process"), ("melody", "macros")):
            if on[lane]:
                assert s["seed"][lane] == bseed, (name, i, lane, s["seed"][lane], bseed)
        sec = {"bars": nb, "on": on, "calls": dict(s["calls"]), "args": s["args"], "keep": i in keep, "lanes": {}}
        for lane in ("drums", "bass", "melody"):
            post = s["post"][lane]
            pre = s["pre"].get(lane, post)
            if i in keep:
                a = arr(post)           # a layer whose chain did not run: pre IS post, stored once
                sec["lanes"][lane] = {"pre": arr(pre) if on[lane] else a, "post": a}
            else:
                sec["lanes"][lane] = {"n": len(post)}
        out.append(sec)
        bseed += nb
    dc = hh.DIRT.get(style, hh.DIRT["golden_era"])
    return {"name": name, "style": style, "rate": rate, "bpm": hh.STYLES[style]["tempo"],
            "bass_voice": hh.STYLES[style]["bass_voice"], "melody_yields": bool(view_yields), "vintage": bool(events["params"].get("vintage", True)),
            "doc": doc, "events": None if doc else events, "sections": out}


def null_melody(events):
    for sec in events["sections"]:
        sec["melody"] = [None] * len(sec["melody"])


dirt, clean = {}, {}
for st in hh.STYLES:
    dc = hh.DIRT.get(st, hh.DIRT["golden_era"])
    row = {"sample_prof": dc["sample_prof"], "bass_prof": dc["bass_prof"], "drum_drive": dc["drum_drive"],
           "drum_resample": dc["drum_resample"], "parallel": dc["parallel"], "melody_rev": dc.get("melody_rev", "short_plate"),
           "melody_rev_mix": dc.get("melody_rev_mix", 0.18), "melody_echo_mix": dc.get("melody_echo_mix", 0.16),
           "bass_voice": hh.STYLES[st]["bass_voice"], "in_dirt": st in hh.DIRT}
    dirt[st] = row
    c = hh._clean_dc(dc)
    clean[st] = {k: c[k] for k in ("drum_drive", "drum_resample", "parallel", "dust")}

cases = [
    run("trap-hook-808", "trap", 6, 1, section="hook"),                               # amiga bass, 808 lp 1600
    run("golden_era-hook", "golden_era", 3, 1, section="hook"),                       # s950, sampled lp 3200, drive .12
    run("golden_era-hook-clean", "golden_era", 3, 1, section="hook", vintage=False),  # _clean_dc
    run("g_funk-hook", "g_funk", 5, 1, section="hook"),                               # mpc60 bass_prof, gfunk lp 1600
    run("industrial-hook", "industrial", 2, 1, section="hook"),                       # parallel 0.15, reese
    run("lofi-hook", "lofi", 9, 1, section="hook"),                                   # lofi_cassette, warmsub, room 0.48
    run("jazz_rap-hook", "jazz_rap", 4, 1, section="hook"),                           # electric lp 3200
    run("trap-hook-melody-null", "trap", 6, 1, section="hook", edit=null_melody),     # layer on, every bar null
    run("boom_bap-stem-melody", "boom_bap", 3, 1, section="hook", stem="melody"),
    run("boom_bap-stem-bass", "boom_bap", 3, 1, section="hook", stem="bass"),
    run("boom_bap-stem-drums", "boom_bap", 3, 1, section="hook", stem="drums"),
    run("boom_bap-breakdown", "boom_bap", 3, 1, section="breakdown"),                 # drums and bass off
    run("boom_bap-24bars", "boom_bap", 3, 24, keep=[3]),                              # arrangement rows, seeds 3..22, stored breakdown
    run("trap-24bars-yields", "trap", 6, 24, keep=[3], yields=True),               # melody_windows >= bars
]

planes = np.concatenate(LANES).view(np.uint8).reshape(-1, 8).T.copy().tobytes()
with open(LANES_OUT, "wb") as f:
    f.write(brotli.compress(planes, quality=11, lgwin=24))
with open(OUT, "w", encoding="utf-8") as f:
    json.dump({"dirt": dirt, "clean": clean, "cases": cases}, f, separators=(",", ":"), allow_nan=False)
for c in cases:
    print(c["name"], c["bass_voice"], [(s["on"]["drums"], s["on"]["bass"], s["on"]["melody"]) for s in c["sections"]])
print(len(cases), "cases", os.path.getsize(OUT), "bytes", os.path.getsize(LANES_OUT), "lane bytes")
