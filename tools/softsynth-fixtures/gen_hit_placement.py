"""Writes src/engine/uprough/__tests__/fixtures/hit_placement.json: tools/hiphop.py performance_profile for every
style, synth_common.lfsr streams, and whole drum bars run the way render_drum_bar runs them (one drum_bar_context,
then one drum_hit_placement per event in event order), for the null test of src/engine/uprough/hitPlacement.ts.

Bars: a hand-built bar covering every branch (anchors, swing, ghost near and away from a kick, perc and unknown
voices, hats as tuples and as Notes with micro_ms and the max(0) clamp, three same-step rolls and a non-hat after)
at every style, as tuples and as Notes; and the host's own gen_drum_bar / gen_drum_phrase bars for a few styles.
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_hit_placement.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools src/engine/uprough/__tests__/fixtures/hit_placement.json .
"""
import importlib.util
import json
import os
import sys
from types import SimpleNamespace

TOOLS, OUT = sys.argv[1], sys.argv[2]
sys.path.insert(0, TOOLS)


def load(name):
    sp = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


hh = load("hiphop")
sc = load("synth_common")

# (voice, step, vel, role, micro_ms)
HAND = [
    ("kick", 0, 1.0, "downbeat", 0.0), ("kick", 8, 0.9, "single", 0.0), ("kick", 5, 0.8, "single", 0.0),
    ("snare", 4, 1.0, "backbeat", 0.0), ("snare", 12, 0.95, "backbeat", 0.0), ("snare", 7, 0.6, "fill", 0.0),
    ("snare", 15, 0.55, "accent", 0.0),
    ("snare", 3, 0.4, "ghost", 0.0), ("snare", 6, 0.35, "ghost", 0.0), ("snare", 9, 0.3, "ghost", 0.0),
    ("snare", 1, 0.3, "ghost", 0.0),
    ("clap", 6, 0.7, "single", 0.0), ("rim", 11, 0.5, "single", 0.0), ("zzz", 2, 0.5, "single", 0.0),
    ("ch", 0, 0.8, "single", -50.0), ("ch", 2, 0.7, "single", 6.5), ("ch", 3, 0.6, "single", 7.5),
    ("ch", 9, 0.6, "single", -3.0), ("oh", 5, 0.9, "single", 12.0), ("oh", 14, 0.9, "single", 0.0),
    ("ch", 10, 0.5, "roll", 4.0),
    ("perc", 11, 0.5, "roll", 0.0), ("perc", 11, 0.5, "roll", 0.0), ("perc", 11, 0.5, "roll", 0.0),
    ("snare", 11, 0.7, "single", 0.0), ("kick", 13, 0.7, "single", 0.0),
]


def mk(ev, as_notes):
    if not as_notes:
        return [(v, s, vel, r) for v, s, vel, r, _m in ev]
    return [SimpleNamespace(voice=v, step=s, vel=vel * 127.0, kind=r, micro_ms=m, sub=[]) for v, s, vel, r, m in ev]


def bar_case(name, style, seed, bpm, rate, ev, as_notes):
    items = mk(ev, as_notes)
    step_samp = int(rate * 60.0 / (bpm * 4))
    swing_amt, kick_steps, rnd = hh.drum_bar_context(style, items, seed)
    hits = []
    for v, s, vel, r, m in ev:
        o, gain, h = hh.drum_hit_placement(style, v, s, vel, r, m if as_notes else 0.0, as_notes, step_samp, rate,
                                           kick_steps, swing_amt, rnd, seed)
        hits.append({"o": o, "gain": gain, "h": h})
    return {"name": name, "style": style, "seed": seed, "bpm": bpm, "rate": rate, "as_notes": as_notes,
            "events": [{"voice": v, "step": s, "vel": vel, "role": r,
                        "micro_ms": m if as_notes else 0.0} for v, s, vel, r, m in ev],
            "swing_amt": swing_amt, "kick_steps": sorted(kick_steps), "hits": hits}


profiles = []
for style in hh.STYLES:
    p = hh.performance_profile(style)
    profiles.append({"style": style, "perf": {f: getattr(p, f) for f in p.__slots__[1:]}})

lfsr = [{"seed": sd, "out": [x for x, _ in zip(sc.lfsr(sd), range(8))]}
        for sd in (3, 977 * 0 + 3, 977 * 1 + 3, 977 * 2 + 3, 1, 0, 0x80000000, 0x7FFFFFFF, 12345 * 977 + 3)]

bars = []
for i, style in enumerate(hh.STYLES):
    bars.append(bar_case("hand-tuple-" + style, style, i * 7 + 1, 90, 22050, HAND, False))
    bars.append(bar_case("hand-note-" + style, style, i * 11 + 4, 84, 44100, HAND, True))
# edge: no kick (empty set), one hat only
bars.append(bar_case("no-kick", "boom_bap", 5, 90, 22050, [e for e in HAND if e[0] != "kick"], False))
bars.append(bar_case("empty", "trap", 5, 90, 22050, [], False))
# the host's own bars
for style in ("boom_bap", "trap", "lofi", "east_coast", "g_funk", "industrial"):
    for b in range(4):
        ev = hh.gen_drum_bar(style, b, 17)
        bars.append(bar_case("gen_drum_bar-%s-%d" % (style, b), style, 17 + b, 92, 22050,
                             [(v, s, vel, r, 0.0) for v, s, vel, r in ev], False))
for style in ("boom_bap", "trap", "drill"):
    ph = hh.gen_drum_phrase(style, 2, 9)
    notes = [n for n in ph.notes if 0 <= n.step < 16]
    bars.append(bar_case("gen_drum_phrase-" + style, style, 9, 92, 22050,
                         [(n.voice, n.step, n.vel / 127.0, n.kind, n.micro_ms) for n in notes], True))

with open(OUT, "w", encoding="utf-8") as f:
    json.dump({"profiles": profiles, "lfsr": lfsr, "bars": bars}, f, separators=(",", ":"), allow_nan=False)
print("%d profiles, %d lfsr, %d bars -> %s (%d bytes)" % (len(profiles), len(lfsr), len(bars), OUT, os.path.getsize(OUT)))
