"""Writes the PG-I beat-juggle fixtures and the shipped juggle records (ledger J1-J10, J3 owner decision 2026-10-12).

  src/engine/dj/scratch/__tests__/fixtures/beat_juggle.json
    breaks     make_break for the 5 BREAK_VARIANTS at 92 BPM (every 16th sample), their cues, classify_break
    patterns   the 8 PATTERNS (bar 0; half_bar from deck B too)
    resets     plan_resets / validate / repair on the 4 routines' raw lists x 5 breaks, plus rewind_time
    hits       render_hit across the loop end (the record comes round, J7)
    renders    render_juggle(pattern(0) + pattern(1)) on the boombap break, seed 3 (every 23rd sample)
    routines   the 4 factory routines (boombap, seed 0; kick_double with funk on deck B): repaired events, audio (every 67th)
    events16   routine_events_16; macro: render_macro events + audio
    threeDeck  build_juggle_events, validate_budget, validate; build_juggle_bus (synth breaks + the amen) at 92 and
               130 BPM and (records) at 92 BPM (every 389th sample, plus the full-rate sum of squares); 12 significant digits
    amen       fit_break (amen, 175 -> 92, bar 1): cues; load_break(amen, 92): cues
  public/data/samples/packs/juggle-records/
    amen_break_175.wav            the demo's Data/Music/amen_break_175.wav, as is
    <style>_<key>.f32.wav         make_hiphop_record's source bar: hiphop.render_track(style, key, seed=i, section
                                  'hook', bars 3, clean) bar 1 at the style's tempo, float32 (THREE_DECK_RECORDS order)

  /opt/homebrew/bin/python3.11 -I tools/scratch-fixtures/gen_beat_juggle.py \
    /Users/spot/Code/Up_Rough_Demo_System/tools src/engine/dj/scratch/__tests__/fixtures/beat_juggle.json \
    public/data/samples/packs/juggle-records
"""
import importlib.util
import json
import os
import shutil
import struct
import sys

import numpy as np

TOOLS, OUT, RECS = sys.argv[1], sys.argv[2], sys.argv[3]
RATE = 22050


def load(name):
    sp = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


bj = load("beat_juggle")
td = load("three_deck")
hh = load("hiphop")


def sub(x, k):
    x = np.asarray(x, float)
    return dict(n=len(x), keep=k, x=[float("%.12g" % v) for v in x[::k]], ss=float(np.sum(x * x)))


def ev(events):
    return [[int(b), int(s), d, c if isinstance(c, str) else int(c), int(a), r, float(v)] for (b, s, d, c, a, r, v) in events]


def write_f32_wav(path, x, rate):
    x = np.asarray(x, np.float32)
    data = x.tobytes()
    with open(path, "wb") as f:
        f.write(b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE")
        f.write(b"fmt " + struct.pack("<IHHIIHH", 16, 3, 1, rate, rate * 4, 4, 32))
        f.write(b"data" + struct.pack("<I", len(data)) + data)


os.makedirs(RECS, exist_ok=True)
amen_path = os.path.join(os.path.dirname(TOOLS), "Data/Music/amen_break_175.wav")
shutil.copyfile(amen_path, os.path.join(RECS, "amen_break_175.wav"))
records_meta = []
for i, (style, key) in enumerate(td.THREE_DECK_RECORDS):
    src_bpm = hh.STYLES[style]["tempo"]
    audio = hh.render_track(style, key=key, seed=i, rate=RATE, section="hook", bars=3, vintage=False)
    src_bar = int(RATE * 60.0 / (src_bpm * 4)) * 16
    seg = audio[src_bar:2 * src_bar]
    if len(seg) < src_bar:
        seg = audio[:src_bar]
    write_f32_wav(os.path.join(RECS, "%s_%s.f32.wav" % (style, key)), seg, RATE)
    records_meta.append(dict(style=style, key=key, srcBpm=src_bpm, file="%s_%s.f32.wav" % (style, key)))

out = dict(rate=RATE, bpm=92, records=records_meta)
variants = list(bj.BREAK_VARIANTS)
breaks = {v: bj.make_break(bpm=92, rate=RATE, seed=0, variant=v) for v in variants}
out["breaks"] = {v: dict(sig=sub(s["sig"], 16), cues={k: int(c) for k, c in s["cues"].items()}, step=s["step"],
                         classify=list(bj.classify_break(s))) for v, s in breaks.items()}
out["patterns"] = {n: ev(fn(0)) for n, fn in bj.PATTERNS.items()}
out["patterns"]["half_bar_B"] = ev(bj.pat_half_bar(0, bj.DECK_B))

raw = {
    "kick_double": bj.pat_original(0) + bj.pat_original(1) + bj.pat_double_kick(2) + bj.pat_double_kick(3)
    + bj.pat_half_bar(4) + bj.pat_half_bar(5) + bj.pat_snare_repeat(6) + bj.pat_original(7),
    "technical": bj.pat_original(0) + bj.pat_original(1) + bj.pat_double_kick(2) + bj.pat_double_kick(3)
    + bj.pat_reorder(4) + bj.pat_reorder(5) + bj.pat_half_bar(6) + bj.pat_half_bar(7)
    + bj.pat_snare_repeat(8) + bj.pat_kick_stutter(9) + bj.pat_reorder(10) + bj.pat_reorder(11)
    + bj.pat_kick_stutter(12) + bj.pat_snare_repeat(13) + bj.pat_original(14) + bj.pat_original(15),
    "machine_gun": bj.pat_original(0) + bj.pat_machine_gun(1) + bj.pat_machine_gun(2) + bj.pat_original(3),
    "snare_roll": bj.pat_original(0) + bj.pat_snare_roll(1) + bj.pat_snare_roll(2) + bj.pat_original(3),
}
chaos = [(0, 0, "A", "SNARE_2", 1, "STUTTER", 0.9), (0, 1, "A", "KICK_1", 1, "STUTTER", 0.9),
         (0, 1, "B", "KICK_1", 1, "STUTTER", 0.9), (0, 2, "A", "KICK_1", 1, "FILL", 0.9)]
resets = []
for v, s in breaks.items():
    for name, lst in list(raw.items()) + [("chaos", chaos)]:
        resets.append(dict(variant=v, name=name, events=ev(lst),
                           bad=[[int(a), int(b), c] for (a, b, c) in bj.plan_resets(lst, s, 92, RATE)],
                           validate=bj.validate(lst, s, 92, RATE), repair=ev(bj.repair(lst, s, 92, RATE))))
out["resets"] = resets
out["rewind"] = [[a, b, bj.rewind_time(breaks["funk"], a, b, RATE)] for (a, b) in
                 (("SNARE_2", "KICK_1"), ("KICK_1", "SNARE_2"), ("FILL", "GHOST"), ("LOOP_END", "BAR_START"))]

src = breaks["boombap"]
out["renders"] = {n: sub(bj.render_juggle(fn(0) + fn(1), src, 92, RATE, seed=3), 23) for n, fn in bj.PATTERNS.items()}
bar = src["step"] * 16
out["hits"] = [dict(cue=c, steps=n, sig=sub(bj.render_hit(src, c, n * src["step"] / float(RATE), RATE, loop=bar), 11))
               for (c, n) in (("FILL", 6), ("PHRASE_END", 3), ("SNARE_2", 9), ("BAR_START", 20))]
routines = {}
for name, fn in (("kick_double", bj.routine_kick_double), ("technical", bj.routine_technical),
                 ("machine_gun", bj.routine_machine_gun), ("snare_roll", bj.routine_snare_roll)):
    sig, e = fn(src, 92, RATE, 0, src_b=breaks["funk"] if name == "kick_double" else None)
    routines[name] = dict(events=ev(e), sig=sub(sig, 67))
out["routines"] = routines
out["events16"] = ev(bj.routine_events_16(src))
macro = "DOUBLE_HIT KICK_2\nTRIPLE_HIT\nREPEAT_HALF_BAR\n\nREORDER_KICK_SNARE\nSTUTTER SNARE_1 4\nSTUTTER KICK_1\nBOGUS\nRETURN_ORIGINAL"
msig, mev = bj.render_macro(src, macro, 92, RATE, seed=5)
out["macro"] = dict(text=macro, events=ev(mev), sig=sub(msig, 31))

amen = bj.fit_break(amen_path, 175, 92, RATE, use_bar=1)
lb = bj.load_break(amen_path, 92, RATE)
out["amen"] = dict(fit=dict(sig=sub(amen["sig"], 16), cues={k: int(c) for k, c in amen["cues"].items()}),
                   load=dict(n=len(lb["sig"]), bars=lb["bars"], cues={k: int(c) for k, c in lb["cues"].items()}))

recs92 = td.build_hiphop_records(92, RATE, 0, vintage=False)
out["threeDeck"] = dict(
    events=ev(td.build_juggle_events(src, 0)), budget=[list(b) for b in td.validate_budget()],
    budgetTight=[[a, int(b), int(c)] for (a, b, c) in td.validate_budget(3)],
    validate={v: td.validate(s, 0) for v, s in breaks.items()},
    bus92=sub(td.build_juggle_bus(src, 92, RATE, 4, 6, swap_breaks=True), 389),
    bus130=sub(td.build_juggle_bus(bj.make_break(bpm=130, rate=RATE), 130, RATE, 9, 6, swap_breaks=True), 389),
    busRecords=sub(td.build_juggle_bus(src, 92, RATE, 2, 6, records=recs92), 389),
    recordCues=[{k: int(c) for k, c in r["cues"].items()} for r in recs92],
)
with open(OUT, "w") as f:
    json.dump(out, f, separators=(",", ":"))
print("wrote", OUT, os.path.getsize(OUT))
