"""Writes the Three Deck Showcase fixture (ledger J1-J10, X8, D1, D3-D6; owner decision 2026-10-13: the demo's
whole three_deck render plays while the set holds).

  src/engine/dj/scratch/__tests__/fixtures/three_deck_showcase.json
    mix      three_deck.render_from_params({}) (the demo's default Render: hip-hop records juggled on A/B, the
             classic bank on Deck C, seed 0, 92 BPM, budget 6) - every 389th sample, the full-rate sum of squares
    juggle   build_juggle_bus(records) + JUGGLE_REVERB_MIX x small_room (X8's juggle bus), every 389th sample
    small    sampler.reverb(kind='small_room', mix=1.0) of a test signal (every 7th sample)
    streams  dj_viz.quantize of the same render's viz capture (collect_viz=True): every 50 Hz stream, whole
    events   build_scratch_events(0) and build_juggle_events (the viz inputs)

  /opt/homebrew/bin/python3.11 -I tools/scratch-fixtures/gen_three_deck_showcase.py \
    /Users/spot/Code/Up_Rough_Demo_System/tools src/engine/dj/scratch/__tests__/fixtures/three_deck_showcase.json
"""
import importlib.util
import json
import os
import sys

import numpy as np

TOOLS, OUT = sys.argv[1], sys.argv[2]
RATE = 22050
KEEP = 389


def load(name):
    sp = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


td = load("three_deck")
bj = load("beat_juggle")
sm = load("sampler")
viz = load("dj_viz")


def sub(x, k):
    x = np.asarray(x, float)
    return dict(n=len(x), keep=k, x=[float("%.12g" % v) for v in x[::k]], ss=float(np.sum(x * x)))


out = dict(rate=RATE, bpm=92, seed=0, budget=6, keep=KEEP)

# sampler.reverb small_room on a short deterministic signal
t = np.arange(4000)
probe = np.sin(2 * np.pi * 440 * t / RATE) * np.exp(-t / 900.0)
probe[1000] += 0.8
out["small"] = sub(sm.reverb(probe, RATE, kind="small_room", mix=1.0), 7)
out["smallProbe"] = dict(n=4000, f=440, tau=900.0, click=[1000, 0.8])

# X8's juggle bus as render() builds it (records at seed 0, the demo's default)
recs = td.build_hiphop_records(92, RATE, 0, vintage=False)
src = bj.make_break("boombap", 92, RATE, 0)
jb = td.build_juggle_bus(src, 92, RATE, 0, 6, swap_breaks=True, records=recs)
jb = jb + td.JUGGLE_REVERB_MIX * sm.reverb(jb, RATE, kind="small_room", mix=1.0)
out["juggle"] = sub(jb, KEEP)

sig, vr = td.render_from_params({}, rate=RATE, collect_viz=True)
out["mix"] = sub(sig, KEEP)
streams = viz.quantize(
    platter_angles=vr["platter_angles"], fader_c=vr["fader_c"], slip_c=vr["slip_c"],
    scratch_events=vr["scratch_events"], juggle_events=vr["juggle_events"],
    deck_active_sections=vr["deck_active_sections"], beatmix=vr.get("beatmix"),
    arc_energy=vr.get("arc_energy"), juggle_arc=vr.get("juggle_arc"),
    bpm=vr["bpm"], rate=vr["rate"], n_ticks=vr["n_ticks"])
out["nTicks"] = vr["n_ticks"]
out["streams"] = {k: list(v) for k, v in streams.items()}
out["scratchEvents"] = [[int(b), int(s), r, g, float(v)] for (b, s, r, g, v) in vr["scratch_events"]]
out["juggleEvents"] = [[int(b), int(s), d, c if isinstance(c, str) else int(c), int(a), r, float(v)]
                       for (b, s, d, c, a, r, v) in vr["juggle_events"]]
out["deckActive"] = [list(map(int, s)) for s in vr["deck_active_sections"]]
# a few raw viz samples (debugging the streams): every 997th sample of each platter angle and the fader
out["angles"] = {k: [float("%.12g" % v) for v in np.asarray(a, float)[::997]] for k, a in vr["platter_angles"].items()}
out["faderC"] = [float("%.12g" % v) for v in np.asarray(vr["fader_c"], float)[::997]]
with open(OUT, "w") as f:
    json.dump(out, f, separators=(",", ":"))
print("wrote", OUT, os.path.getsize(OUT))
