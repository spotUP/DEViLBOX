"""Writes src/lib/uprough/__tests__/fixtures/bar_events.json: song file docs and the host's own
tools/song_file.to_events of each (render_events' input), for songFileToBarEvents parity.

Three styles: trap (808 path, e808 side entries), golden_era with use_trap808=False (non-808 path,
ebass side entries) and lofi (its default bass path). Each also comes as an edited copy that hits the
grid-wins rules of to_events: a drum and a hat volume edited in the grid, a bass and a melody note
transposed, a new drum cell with no side entry and no bar order entry, and a side vel that rounds
half to even (round(x * 64) with x * 64 = n + 0.5).
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_bar_events.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools src/lib/uprough/__tests__/fixtures/bar_events.json
"""
import copy
import importlib.util
import json
import os
import sys

TOOLS, OUT = sys.argv[1], sys.argv[2]
sys.path.insert(0, TOOLS)


def load(name):
    sp = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


sf = load("song_file")
hh = load("hiphop")

SONGS = [("trap", 5, {}), ("golden_era", 3, {"use_trap808": False}), ("lofi", 7, {})]
BARS = 4


def cells(sec, lanes):
    for lane in lanes:
        for row, c in enumerate(sec["lanes"].get(lane, ())):
            if c is not None:
                yield lane, row, c


def edit(doc):
    """The grid edits a DEViLBOX user makes without touching the side table."""
    d = copy.deepcopy(doc)
    sec = d["sections"][0]
    side = d["side"][sec["id"]]
    done = set()
    for lane, row, c in cells(sec, sf.DRUM_LANES):
        e = side.get("%s:%d" % (lane, row), {})
        if "hat" in e and "hat" not in done:
            c[2] = 10 if c[2] != 10 else 11
            done.add("hat")
        elif "vel" in e and "vel" not in done:
            c[2] = 7 if c[2] != 7 else 8
            done.add("vel")
        elif "vel" in e and "half" not in done:
            # 2.5 / 64: round(2.5) is 2 in Python; the grid keeps 2, so the side vel still wins.
            e["vel"] = 2.5 / 64
            c[2] = 2
            done.add("half")
    for lane, row, c in cells(sec, ("bass",)):
        c[0] = sf.note_name(sf.note_midi(c[0]) + 2)
        break
    # Section 0 carries no melody in any of the three styles, so transpose the first melody note found.
    mel = next(c for s in d["sections"] for _, _, c in cells(s, sf.MELODY_LANES))
    mel[0] = sf.note_name(sf.note_midi(mel[0]) - 3)
    # A new kick on an empty row of the last bar: no side entry (vol / 64, role main) and no order entry.
    last = (sec["header"]["bars"] - 1) * sf.ROWS_PER_BAR
    kick = sec["lanes"].setdefault("kick", [None] * (sec["header"]["bars"] * sf.ROWS_PER_BAR))
    inst = next(i + 1 for i, x in enumerate(d["instruments"]) if x["voice"] == "kick")
    row = next(r for r in range(last, last + sf.ROWS_PER_BAR) if kick[r] is None)
    kick[row] = [sf.DRUM_NOTE, inst, 40, None]
    if done != {"hat", "vel", "half"}:
        raise SystemExit("edit hit only %s" % sorted(done))
    return d


cases = []
for style, seed, kw in SONGS:
    doc = sf.export(hh.generate_events(style, seed, bars=BARS, **kw))
    sf.validate(doc)
    for name, d in ((style, doc), (style + "_edited", edit(doc))):
        cases.append({"name": name, "doc": d, "events": sf.to_events(d)})

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(cases, f, separators=(",", ":"), allow_nan=False)
print("%d cases -> %s (%d bytes)" % (len(cases), OUT, os.path.getsize(OUT)))
