"""Writes src/engine/uprough/__tests__/fixtures/song_mix.json: the Up Rough song-mix stage of tools/hiphop.py run on
deterministic lane buffers, for the null test of the TypeScript port (src/engine/uprough/mix/songMix.ts).

Top-level functions (bus_makeup, duck_under_voice, _bus_rms, _active_rms, _apply_texture) are imported and called.
The balance, drum trim and _echo live INSIDE render_section, so their source text is cut out of
inspect.getsource(hiphop.render_section) between fixed markers and exec'd unchanged: no Python is re-implemented.
The mirrored constants (MIX_GAINS, BUS_REFERENCE_*, SAMPLE_ECHO, the styles' tape/vinyl) are emitted for the test.
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_song_mix.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools src/engine/uprough/__tests__/fixtures/song_mix.json
"""
import importlib.util
import inspect
import json
import os
import sys
import textwrap

import numpy as np

TOOLS, OUT = sys.argv[1], sys.argv[2]
RATE = 22050
KEEP = 7
N = 6000
sys.path.insert(0, TOOLS)
hh = importlib.import_module("hiphop")
_dsp = hh._dsp
assert hh._sm.RATE == RATE

SRC = inspect.getsource(hh.render_section)


def cut(start, end, include_end=False):
    a = SRC.index(start)
    b = SRC.index(end, a)
    if include_end:
        b += len(end)
    return textwrap.dedent(" " * (len(SRC[:a]) - SRC[:a].rfind("\n") - 1) + SRC[a:b])


TRIM_SRC = cut("_drum_trim = 1.0", "    if lay[\"drums\"]:\n        drums_buf = _sm.drum_bus")
RESTORE_SRC = cut("if _drum_trim != 1.0:", "        if dc[\"parallel\"]")
BALANCE_SRC = cut("if HIPHOP_BUS_BALANCE:", "    sec = (drums_buf")
ECHO_SRC = cut("def _echo(", "    if lay[\"sample\"]:")


def lane(seed, f0, scale, decay):
    i = np.arange(N)
    rs = np.random.RandomState(seed)
    return np.asarray(scale * (np.sin(2 * np.pi * f0 * i / RATE) * np.exp(-i / decay) + 0.2 * rs.uniform(-1, 1, N)), np.float64)


L = {
    "drums": lane(1, 90.0, 1.5, 2500.0), "bass": lane(2, 55.0, 0.64, 4000.0), "sample": lane(3, 440.0, 0.37, 3000.0),
    "melody": lane(4, 880.0, 0.55, 2000.0), "vocal": lane(5, 300.0, 0.05, 5000.0), "reinforce": lane(6, 200.0, 0.3, 1000.0),
}
LOUD = L["drums"]
QUIET = L["melody"] * 0.4
SPARSE = np.zeros(N)
SPARSE[1500:1900] = 0.5 * np.sin(np.arange(400) * 0.3)
SPARSE[4000:4100] = 0.02


def runsrc(src, ns):
    g = {"np": np, "MIX_GAINS": hh.MIX_GAINS, "BUS_REFERENCE_RMS": hh.BUS_REFERENCE_RMS,
         "BUS_REFERENCE_PEAK": hh.BUS_REFERENCE_PEAK, "HIPHOP_BUS_BALANCE": True, "HIPHOP_DRUM_BUS_HEADROOM": True,
         "_dsp": _dsp, "rate": RATE}
    g.update(ns)
    exec(src, g)
    return g


def ser(y):
    y = np.asarray(y, np.float64)
    return {"length": int(len(y)), "rms": float(np.sqrt(np.mean(y ** 2))), "samples": [float(v) for v in y[::KEEP]]}


cases = []

for name, x in (("loud", LOUD), ("quiet", QUIET), ("sparse", SPARSE)):
    cases.append({"fn": "busRms", "input": name, "scalar": hh._bus_rms(x)})
    cases.append({"fn": "activeRms", "input": name, "scalar": hh._active_rms(x, RATE)})
cases.append({"fn": "activeRms", "input": "sparse", "options": {"floorDb": -20.0, "frameSec": 0.02},
              "scalar": hh._active_rms(SPARSE, RATE, floor_db=-20.0, frame_s=0.02)})
cases.append({"fn": "activeRms", "input": "tiny", "scalar": hh._active_rms(LOUD[:100], RATE)})

for name, x, pre, cap in (("quiet", QUIET, 0.2, 4.0), ("loud", LOUD, 0.05, 4.0), ("quiet", QUIET, 0.2, 1.5), ("sparse", SPARSE, 0.1, 8.0)):
    cases.append({"fn": "busMakeup", "input": name, "options": {"preRms": pre, "cap": cap}, **ser(hh.bus_makeup(x, pre, cap))})

for name, x in (("loud", LOUD), ("quiet", QUIET)):
    g = runsrc(TRIM_SRC, {"lay": {"drums": True}, "drums_buf": x.copy()})
    cases.append({"fn": "trimDrumsToPeak", "input": name, "trim": float(g["_drum_trim"]), **ser(g["drums_buf"])})
    g2 = runsrc(RESTORE_SRC, {"_drum_trim": g["_drum_trim"], "drums_buf": g["drums_buf"].copy(), "dc": {"parallel": 0}})
    cases.append({"fn": "restoreDrumTrim", "input": name, "options": {"trim": float(g["_drum_trim"])}, **ser(g2["drums_buf"])})

for has_drums in (True, False):
    for bass_g, silent in ((1.272, None), (2.0, "melody")):
        bufs = {k: v.copy() for k, v in L.items()}
        if silent:
            bufs[silent][:] = 0.0
        g = runsrc(BALANCE_SRC, {"lay": {"drums": has_drums}, "_bass_g": bass_g, "drums_buf": bufs["drums"],
                                 "bass_buf": bufs["bass"], "sample_buf": bufs["sample"], "melody_buf": bufs["melody"],
                                 "vocal_buf": bufs["vocal"], "reinforce_buf": bufs["reinforce"]})
        cases.append({"fn": "balanceBuses", "options": {"bassGain": bass_g, "hasDrums": has_drums, "silent": silent},
                      "outputs": {k: ser(g[k + "_buf"]) for k in ("drums", "bass", "sample", "melody", "vocal", "reinforce")}})

# _echo: step_samp / tempo-synced delay times at 92 BPM sixteenths
step = int(RATE * 60.0 / 92 / 4)
for src_name, delay_s, fb, gain, damp in (("sample", 2 * step / RATE, hh.SAMPLE_ECHO["fb"], hh.SAMPLE_ECHO["send"], None),
                                          ("vocal", 4 * step / RATE, 0.30, 0.32, None),
                                          ("vocal", step / float(RATE), 0.0, 0.12, None),
                                          ("melody", 3 * step / RATE, 0.45, 0.5, 0.2)):
    g = runsrc(ECHO_SRC, {"step_samp": step})
    y = g["_echo"](L[src_name], delay_s, fb, gain) if damp is None else g["_echo"](L[src_name], delay_s, fb, gain, damp)
    opt = {"delaySec": float(delay_s), "fb": fb, "g": gain}
    if damp is not None:
        opt["damp"] = damp
    cases.append({"fn": "echo", "input": src_name, "options": opt, **ser(y)})

BAR = 1000
for bars, floor, fade in (([1, 4], 0.12, 0.020), ([0], 0.3, 0.005), ([2, 3, 9], 0.0, 0.050), ([], 0.12, 0.020), ([5], 0.12, 0.020)):
    kw = {} if (floor, fade) == (0.12, 0.020) else {"floor": floor, "fade_s": fade}
    y = hh.duck_under_voice(L["melody"], frozenset(bars), BAR, RATE, **kw)
    cases.append({"fn": "duckUnderVoice", "input": "melody", "options": {"voiceBars": bars, "barLen": BAR, "floor": floor, "fadeSec": fade}, **ser(y)})
cases.append({"fn": "duckUnderVoice", "input": "melody", "options": {"voiceBars": [1], "barLen": 0, "floor": 0.12, "fadeSec": 0.02},
              **ser(hh.duck_under_voice(L["melody"], frozenset([1]), 0, RATE))})

# _apply_texture: every style (tape 0.1..0.6 crosses 0.25 / 0.3 / 0.4; lofi, memphis, dirty_south force the a500 pick)
MIX = (L["drums"] + L["bass"] + L["sample"] + L["melody"]) * 0.3
for style in hh.STYLES:
    y = hh._apply_texture(MIX.copy(), style, RATE, seed=2)
    cases.append({"fn": "applyTexture", "options": {"style": style, "seed": 2}, "model": "a500" if (hh.STYLES[style]["tape"] >= 0.4 or style in ("lofi", "memphis", "dirty_south")) else "a1200", **ser(y)})
for style, rev, mix in (("trap", "gated", None), ("lofi", None, 0.3), ("east_coast", "lofi_digital", 0.2), ("g_funk", "dark_room", 0.0)):
    dc = hh.DIRT[style]
    old = (dc.get("master_rev"), dc.get("master_rev_mix"))
    dc["master_rev"], dc["master_rev_mix"] = rev, mix
    try:
        y = hh._apply_texture(MIX.copy(), style, RATE, seed=0)
    finally:
        dc["master_rev"], dc["master_rev_mix"] = old
    cases.append({"fn": "applyTexture", "options": {"style": style, "seed": 0, "masterRev": rev, "masterRevMix": mix}, **ser(y)})

doc = {
    "rate": RATE, "keep": KEEP, "barLen": BAR,
    "lanes": {k: [float(v) for v in x] for k, x in L.items()},
    "sparse": [float(v) for v in SPARSE],
    "constants": {
        "MIX_GAINS": hh.MIX_GAINS, "BUS_REFERENCE_RMS": hh.BUS_REFERENCE_RMS, "BUS_REFERENCE_PEAK": hh.BUS_REFERENCE_PEAK,
        "SAMPLE_ECHO": hh.SAMPLE_ECHO, "STYLE_TEXTURE": {k: {"tape": v["tape"], "vinyl": v["vinyl"]} for k, v in hh.STYLES.items()},
    },
    "cases": cases,
}
with open(OUT, "w") as f:
    json.dump(doc, f, separators=(",", ":"))
print("wrote", OUT, len(cases), "cases", os.path.getsize(OUT), "bytes")
