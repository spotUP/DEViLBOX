"""Writes src/engine/uprough/__tests__/fixtures/song_mix.json: the Up Rough song-mix stage of tools/hiphop.py run on
deterministic lane buffers, for the null test of the TypeScript port (src/engine/uprough/mix/songMix.ts).

Functions (bus_makeup, duck_under_voice, _bus_rms, _active_rms, _apply_texture) are imported and called.
The drum trim, bus balance and echo are module-level (trim_drums_to_peak, restore_drum_trim, balance_buses,
synced_echo), imported and called: no Python is re-implemented.
The mirrored constants (MIX_GAINS, BUS_REFERENCE_*, SAMPLE_ECHO, the styles' tape/vinyl) are emitted for the test.
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_song_mix.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools src/engine/uprough/__tests__/fixtures/song_mix.json
"""
import importlib.util
import json
import os
import sys

import math

import numpy as np


def seq_rms(y):
    """RMS with a left-to-right sum, the order the TypeScript test sums in (np.mean is pairwise)."""
    s = 0.0
    for v in np.asarray(y, dtype=np.float64).tolist():
        s += v * v
    return math.sqrt(s / len(y))

TOOLS, OUT = sys.argv[1], sys.argv[2]
RATE = 22050
KEEP = 7
N = 6000
sys.path.insert(0, TOOLS)
hh = importlib.import_module("hiphop")
_dsp = hh._dsp
assert hh._sm.RATE == RATE

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


def ser(y):
    y = np.asarray(y, np.float64)
    return {"length": int(len(y)), "rms": seq_rms(y), "samples": [float(v) for v in y[::KEEP]]}


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
    trimmed, trim = hh.trim_drums_to_peak(x.copy())
    cases.append({"fn": "trimDrumsToPeak", "input": name, "trim": float(trim), **ser(trimmed)})
    restored = hh.restore_drum_trim(trimmed.copy(), trim)
    cases.append({"fn": "restoreDrumTrim", "input": name, "options": {"trim": float(trim)}, **ser(restored)})

for has_drums in (True, False):
    for bass_g, silent in ((1.272, None), (2.0, "melody")):
        bufs = {k: v.copy() for k, v in L.items()}
        if silent:
            bufs[silent][:] = 0.0
        hh.balance_buses(bufs["drums"], bufs["bass"], bufs["sample"], bufs["melody"], bufs["vocal"], bufs["reinforce"],
                         bass_g, has_drums)
        cases.append({"fn": "balanceBuses", "options": {"bassGain": bass_g, "hasDrums": has_drums, "silent": silent},
                      "outputs": {k: ser(bufs[k]) for k in ("drums", "bass", "sample", "melody", "vocal", "reinforce")}})

# _echo: step_samp / tempo-synced delay times at 92 BPM sixteenths
step = int(RATE * 60.0 / 92 / 4)
for src_name, delay_s, fb, gain, damp in (("sample", 2 * step / RATE, hh.SAMPLE_ECHO["fb"], hh.SAMPLE_ECHO["send"], None),
                                          ("vocal", 4 * step / RATE, 0.30, 0.32, None),
                                          ("vocal", step / float(RATE), 0.0, 0.12, None),
                                          ("melody", 3 * step / RATE, 0.45, 0.5, 0.2)):
    y = hh.synced_echo(L[src_name], delay_s, fb, gain, rate=RATE) if damp is None else hh.synced_echo(L[src_name], delay_s, fb, gain, damp, rate=RATE)
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

# render_section tail + render_track tail on the same per-lane buffers. render_section keeps this tail inline, so the
# sum and the scratch add below mirror hiphop.py:6889-7013 line for line; every called piece is the real function.
L_SEC = 5500
SCR = lane(7, 660.0, 0.4, 1500.0)[:5200]


def section(lanes, bass_g, has_drums, scr, use_scratch, voice_bars):
    b = {k: v.copy() for k, v in lanes.items()}
    span = hh.bus_gain_span(bass_g, has_drums)
    hh.balance_buses(b["drums"], b["bass"], b["sample"], b["melody"], b["vocal"], b["reinforce"], bass_g, has_drums)
    sec = (b["drums"] + b["bass"] + b["sample"] + b["melody"] + b["vocal"] + b["reinforce"])[:L_SEC]
    if scr is not None and len(scr):
        g = hh.MIX_GAINS["scratch_on"] if use_scratch else hh.MIX_GAINS["scratch_off"]
        scr = scr * ((hh.BUS_REFERENCE_RMS * g / span) / hh._active_rms(scr, RATE))
        g = 1.0
        scr = hh.duck_under_voice(scr, frozenset(voice_bars), BAR, RATE)
        n = min(len(sec), len(scr))
        sec[:n] += g * scr[:n]
    return sec


SECS = {}
for name, bass_g, hd, with_scr, use_scr, vb in (("full", 1.272, True, True, True, [1, 3]), ("solo", 2.0, False, True, False, [0]),
                                                 ("noscratch", 1.272, True, False, False, [])):
    y = section(L, bass_g, hd, SCR if with_scr else None, use_scr, vb)
    SECS[name] = y
    cases.append({"fn": "mixSection", "options": {"length": L_SEC, "bassGain": bass_g, "hasDrums": hd, "scratch": with_scr,
                                                  "useScratch": use_scr, "voiceBars": vb, "barLen": BAR}, **ser(y)})

for style, names in (("lofi", ("full", "solo", "noscratch")), ("trap", ("noscratch", "full"))):
    track = np.concatenate([SECS[n] for n in names] + [np.zeros(0)])
    textured = hh._apply_texture(track.copy(), style, RATE, seed=3)
    final = hh._se.master_bus(textured, rate=RATE).astype(np.float64) / 127.0
    cases.append({"fn": "mixTrack", "options": {"style": style, "seed": 3, "sections": list(names)},
                  "textured": ser(textured), "texturedAll": [float(v) for v in textured], **ser(final)})

doc = {
    "rate": RATE, "keep": KEEP, "barLen": BAR,
    "lanes": {k: [float(v) for v in x] for k, x in L.items()},
    "sparse": [float(v) for v in SPARSE], "scratch": [float(v) for v in SCR],
    "constants": {
        "MIX_GAINS": hh.MIX_GAINS, "BUS_REFERENCE_RMS": hh.BUS_REFERENCE_RMS, "BUS_REFERENCE_PEAK": hh.BUS_REFERENCE_PEAK,
        "SAMPLE_ECHO": hh.SAMPLE_ECHO, "STYLE_TEXTURE": {k: {"tape": v["tape"], "vinyl": v["vinyl"]} for k, v in hh.STYLES.items()},
    },
    "cases": cases,
}
with open(OUT, "w") as f:
    json.dump(doc, f, separators=(",", ":"))
print("wrote", OUT, len(cases), "cases", os.path.getsize(OUT), "bytes")
