"""Writes src/engine/uprough/__tests__/fixtures/song_render.json: hiphop.render_track over song files whose locked
layers are absent (plan 2026-10-19 O6j), for the null test of src/engine/uprough/songRender.ts.

The cases drive the REAL song_file.render_doc. The locked layers are absent through song-file fields only: layers.sample
and layers.vocal are 0 in every section (no chops, no vocals) and the scratch plan is blank (no placed hits). Nothing
is monkeypatched in behaviour. The module-level wrappers below are pass-throughs that only count and copy:
balance_buses (once per section; its arguments are copied BEFORE it scales them in place), _apply_texture and
_se.master_bus (once per track). The sample and vocal lanes at balance_buses entry are asserted all zero.

Host behaviour with the locked layers absent (recorded in "locked_absent"): render_section does NOT skip the scratch bus.
render_scratch_section returns zeros of bars * bar_len for a blank plan, and the section still runs
sampler.apply_macros(dust = DIRT dust * scratch_dust_k), the dub echo, the scratch room, the active-RMS scale and the
voice duck, then adds the result to the section. "scratch" below holds, per style, the DIRT keys that chain reads.

Lanes sit in song_render.lanes.br like bus_chains.lanes.br (little-endian float64, byte-shuffled into eight planes,
brotli 11); each lane is {n, off, sha, peak}. A case with "lanes" true also stores the drums, bass and melody lanes at
balance_buses entry per section; every case stores the float64 final output.
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_song_render.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools src/engine/uprough/__tests__/fixtures/song_render.json
"""
import brotli
import hashlib
import json
import os
import sys

import numpy as np

TOOLS, OUT = sys.argv[1], sys.argv[2]
sys.path.insert(0, TOOLS)
import hiphop as hh      # the instance song_file.render_doc imports
import song_file as sf

LANES = []
LANES_OUT = OUT[:-len(".json")] + ".lanes.br"


def arr(a):
    v = np.asarray(a, dtype=np.float64).astype("<f8")
    off = sum(len(x) for x in LANES)
    LANES.append(v)
    return {"n": len(v), "off": off, "sha": hashlib.sha256(v.tobytes()).hexdigest(),
            "peak": float(np.max(np.abs(v))) if len(v) else 0.0}


REC = {"bal": [], "texture": 0, "master": 0, "scratch": []}
_real_bal, _real_tex, _real_master = hh.balance_buses, hh._apply_texture, hh._se.master_bus
_real_scr = hh.render_scratch_section


def balance_buses(drums, bass, sample, melody, vocal, reinforce, bass_g, has_drums):
    assert not np.any(sample) and not np.any(vocal), "a locked layer is not absent"
    REC["bal"].append({"drums": drums.copy(), "bass": bass.copy(), "melody": melody.copy(), "n": len(drums),
                       "reinforce": reinforce is not None and bool(np.any(reinforce)), "has_drums": bool(has_drums),
                       "bass_g": float(bass_g)})
    return _real_bal(drums, bass, sample, melody, vocal, reinforce, bass_g, has_drums)


def apply_texture(*a, **k):
    REC["texture"] += 1
    return _real_tex(*a, **k)


def master_bus(*a, **k):
    REC["master"] += 1
    return _real_master(*a, **k)


def scratch_section(*a, **k):
    r = _real_scr(*a, **k)
    REC["scratch"].append({"n": len(r), "peak": float(np.max(np.abs(r))) if len(r) else 0.0})
    return r


hh.balance_buses, hh._apply_texture, hh._se.master_bus = balance_buses, apply_texture, master_bus
hh.render_scratch_section = scratch_section


def make(style, seed, bars, vintage=True, drums_off=()):
    doc = sf.new(style, seed, bars=bars)
    for i, s in enumerate(doc["sections"]):
        lay = s["header"]["layers"]
        lay["sample"], lay["vocal"] = 0, 0
        if i in drums_off:
            lay["drums"] = 0
        n = s["header"]["bars"]
        s["locked"]["scratch"] = {"plan": {"source": s["locked"]["scratch"]["plan"]["source"], "routine": None,
                                           "placed": [[] for _ in range(n)]}, "offers": []}
    if not vintage:
        doc["song"].setdefault("render", {})["vintage"] = False
    sf.validate(doc)
    return doc


def run(name, style, seed, bars, lanes=False, **kw):
    doc = make(style, seed, bars, **kw)
    REC["bal"], REC["texture"], REC["master"], REC["scratch"] = [], 0, 0, []
    y = sf.render_doc(doc)
    n_sec = len(doc["sections"])
    assert len(REC["bal"]) == n_sec and REC["texture"] == 1 and REC["master"] == 1, (name, len(REC["bal"]), n_sec)
    assert len(REC["scratch"]) == n_sec
    secs = []
    for b in REC["bal"]:
        row = {"n": b["n"], "has_drums": b["has_drums"], "reinforce": b["reinforce"], "bass_g": b["bass_g"]}
        if lanes:
            row["drums"], row["bass"], row["melody"] = arr(b["drums"]), arr(b["bass"]), arr(b["melody"])
        secs.append(row)
    return {"name": name, "style": style, "bpm": doc["song"]["bpm"], "vintage": kw.get("vintage", True), "doc": doc,
            "calls": {"balance": len(REC["bal"]), "texture": REC["texture"], "master": REC["master"]},
            "scratch_sections": REC["scratch"], "sections": secs, "final": arr(y)}


cases = [
    run("boom_bap-drums-off", "boom_bap", 3, 4, drums_off=(1, 3), lanes=True),   # + the default breakdown (section 3)
    run("lofi-a500", "lofi", 9, 4),
    run("g_funk", "g_funk", 5, 4),
    run("trap", "trap", 6, 4),
    run("dirty_south-a500", "dirty_south", 2, 4),
    run("east_coast-use-scratch", "east_coast", 4, 4),
    run("boom_bap-clean", "boom_bap", 3, 4, vintage=False),
]

scratch = {}
for st in hh.STYLES:
    dc = hh.DIRT.get(st, hh.DIRT["golden_era"])
    scratch[st] = {"use_scratch": bool(hh.STYLES[st].get("use_scratch")), "dust": dc["dust"],
                   "scratch_dust_k": dc.get("scratch_dust_k", 1.0), "scratch_rev": dc["scratch_rev"],
                   "scratch_rev_mix": dc["scratch_rev_mix"], "scratch_echo_mix": dc["scratch_echo_mix"],
                   "master_rev": dc.get("master_rev"), "master_rev_mix": dc.get("master_rev_mix"),
                   "in_dirt": st in hh.DIRT, "clean_dust": hh._clean_dc(dc)["dust"]}

planes = np.concatenate(LANES).view(np.uint8).reshape(-1, 8).T.copy().tobytes()
with open(LANES_OUT, "wb") as f:
    f.write(brotli.compress(planes, quality=11, lgwin=24))
with open(OUT, "w", encoding="utf-8") as f:
    json.dump({"scratch": scratch, "cases": cases}, f, separators=(",", ":"), allow_nan=False)
for c in cases:
    print(c["name"], c["calls"], [s["n"] for s in c["sections"]], [s["has_drums"] for s in c["sections"]])
print(len(cases), "cases", os.path.getsize(OUT), "bytes", os.path.getsize(LANES_OUT), "lane bytes")
