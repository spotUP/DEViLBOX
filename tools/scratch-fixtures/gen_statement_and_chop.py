"""Writes src/engine/dj/scratch/__tests__/fixtures/statement_and_chop.json: the Up Rough demo's STATEMENT AND CHOP
(ledger C16) for a crate narrowed to one spoken phrase.

  events   three_deck.build_scratch_events(seed, phrase_emphasis=True) for seeds 0, 7, 42 - (bar, step, cue role,
           gesture, velocity).
  cues     scratch_dj.cues_with_word_emphasis({RECORD: entry}): which roles carry the whole phrase (anchor 0) and
           which the last word (scratch_bank.word_source: its slice, re-based vowel, safe [0, n - 1]).
  strokes  render_gesture on those cues as three_deck.render calls it (the boom-bap deck, seed + bar x 16 + step,
           steps x 60 / (bpm x 4) s): a drop_phrase on HOME and a chirp and a transformer8 on ACCENT, every KEEP-th
           sample (float64 repr).

  /opt/homebrew/bin/python3.11 -I tools/scratch-fixtures/gen_statement_and_chop.py \
    /Users/spot/Code/Up_Rough_Demo_System/tools src/engine/dj/scratch/__tests__/fixtures/statement_and_chop.json
"""
import importlib.util
import json
import os
import sys

TOOLS, OUT = sys.argv[1], sys.argv[2]
RATE = 22050
KEEP = 5
BPM = 92
RECORD = "IF_YOU_REALLY_LIKE_TO_ROCK_THE_FUNKY_BEAT"


def load(name):
    sp = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


td = load("three_deck")
sd = load("scratch_dj")
sb = load("scratch_bank")
sc = load("scratch")
bank = sb.load_bank(rate=RATE, with_audio=True)
one = {RECORD: bank[RECORD]}
cues = sd.cues_with_word_emphasis(one, RATE)
word = cues["ACCENT"][0]
events = {str(s): [[b, st, r, g, float(v)] for (b, st, r, g, v) in td.build_scratch_events(s, phrase_emphasis=True)] for s in (0, 7, 42)}
step = 60.0 / (BPM * 4)
prof = sc.PROFILES["boombap"]["deck"]
strokes = []
for role, gesture, vel, seed in (("HOME", "drop_phrase", 0.9, 3), ("ACCENT", "chirp", 0.8, 21), ("ACCENT", "transformer8", 0.7, 36)):
    src = cues[role][0]
    g = sc.render_gesture(src, gesture, sc._GESTURE_STEPS[gesture] * step, RATE, velocity=vel, profile=prof, seed=seed)
    strokes.append(dict(role=role, gesture=gesture, velocity=vel, seed=seed, n=len(g), out=[float(x) for x in g[::KEEP]]))
json.dump(dict(record=RECORD, bpm=BPM, rate=RATE, keep=KEEP, events=events,
               homeAnchor=int(cues["HOME"][0]["anchor"]), wordName=word["word"], wordAnchor=int(word["anchor"]),
               wordLen=len(word["sig"]), strokes=strokes), open(OUT, "w"))
print("ok", word["word"], len(word["sig"]), {k: len(v) for k, v in events.items()}, [s["n"] for s in strokes])
