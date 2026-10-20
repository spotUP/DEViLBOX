"""Writes src/engine/uprough/__tests__/fixtures/song_melody.json: the melody decision and the melody lane of whole
songs, for the null tests of src/engine/uprough/melodyNotes.ts and src/engine/uprough/songMelody.ts (plan 2026-10-19
O6h).

notes: hiphop.melody_bar_notes over a grid. Per style, the motif is the host's own gen_melody(style, tonic, mode,
seed) for every mode in hiphop.MODES plus None (the raw-semitone path), at two tonics; each motif is decided for every
chord root 0..11 (roots above 6 fold down an octave) and variations 0..3 (0 = no repeat change, odd steps up, even
steps down). Only the semis are stored: the generator asserts the steps and durations come back unchanged. "chords" is
hiphop.CHORDS (the vocabulary melody_bar_notes reads through the style's harmony), "harmony" the style's row.

cases: whole songs (song_file.export of hiphop.generate_events, or the host's events for the params.section fast
path). The capture wraps hiphop.render_melody_bar (render_section calls it once per bar whose melody plays, with
variation=b and the section seed) and rebuilds each section lane with the host's own line, melody_buf[o:o + len(m)]
+= MIX_GAINS["melody"] * m at o = b * bar_len, into zeros of bars * bar_len + rate. The generator also asserts every
call's seed is the section seed (song seed + bars of earlier sections), its notes are the bar's recorded notes and
its voice the header's melody_voice. Lanes sit in song_melody.lanes.br like song_bass.lanes.br (little-endian
float64, byte-shuffled into eight planes, brotli 11); each lane is {n, off, sha, peak}.
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_song_melody.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools src/engine/uprough/__tests__/fixtures/song_melody.json
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

LANES = []
LANES_OUT = OUT[:-len(".json")] + ".lanes.br"


def arr(a):
    v = np.asarray(a, dtype=np.float64).astype("<f8")
    off = sum(len(x) for x in LANES)
    LANES.append(v)
    return {"n": len(v), "off": off, "sha": hashlib.sha256(v.tobytes()).hexdigest(),
            "peak": float(np.max(np.abs(v))) if len(v) else 0.0}


# --- melody_bar_notes grid ---------------------------------------------------
notes = []
for style in hh.STYLES:
    for tonic in (9, 2):
        for mode in list(hh.MODES) + [None]:
            ev = [tuple(int(x) for x in n) for n in hh.gen_melody(style, tonic, mode, seed=tonic + 1)]
            out = []
            for chord_root in range(12):
                for variation in range(4):
                    got = hh.melody_bar_notes(style, ev, variation, chord_root, mode, tonic)
                    assert [(s, d) for _, s, d in got] == [(s, d) for _, s, d in ev], (style, mode)
                    out.append([int(s) for s, _, _ in got])
            notes.append({"style": style, "tonic": tonic, "mode": mode, "ev": [list(n) for n in ev], "out": out})
harmony = {s: hh.STYLES[s]["harmony"] for s in hh.STYLES}


# --- song melody lanes -------------------------------------------------------
def capture(events):
    calls = []
    real = hh.render_melody_bar

    def spy(style, ev, bpm, rate, variation=0, seed=0, chord_root=0, mode=None, tonic=0, melody_voice=None,
            view=None, notes=None):
        m = real(style, ev, bpm, rate, variation=variation, seed=seed, chord_root=chord_root, mode=mode, tonic=tonic,
                 melody_voice=melody_voice, view=view, notes=notes)
        calls.append({"b": variation, "seed": seed, "voice": melody_voice or (view or hh.STYLES[style])["melody_voice"],
                      "notes": [list(n) for n in notes], "m": np.array(m, dtype=np.float64)})
        return m

    hh.render_melody_bar = spy
    try:
        hh.render_events(events)
    finally:
        hh.render_melody_bar = real
    return calls


def run(name, style, seed, bars, rate=22050, **kw):
    events = hh.generate_events(style, seed, bars=bars, rate=rate, **kw)
    doc = None
    if events.get("arrangement"):
        doc = sf.export(events)
        sf.validate(doc)
        events = sf.to_events(doc)
    calls = iter(capture(events))
    g = hh.MIX_GAINS["melody"]
    bpm = hh.STYLES[style]["tempo"]
    bar_len = int(rate * 60.0 / (bpm * 4)) * 16
    voice = sf.style_melody_voice(style, events["params"].get("melody_voice"))
    lanes, total, bseed = [], 0, seed
    for sec in events["sections"]:
        nb = len(sec["drums"])
        buf = np.zeros(nb * bar_len + int(1.0 * rate))
        played = 0
        for b, mel in enumerate(sec["melody"]):
            if mel is None:
                continue
            c = next(calls)
            assert c["b"] == b and c["seed"] == bseed and c["voice"] == voice, (name, b, c["b"], c["seed"], bseed)
            assert c["notes"] == [list(n) for n in mel], (name, b)
            o = b * bar_len
            buf[o:o + len(c["m"])] += g * c["m"]
            played += 1
        total += played
        lanes.append({"played": played, "bars": nb, "buf": arr(buf)})
        bseed += nb
    assert next(calls, None) is None, (name, "render_melody_bar called for a bar with no recorded notes")
    return {"name": name, "style": style, "rate": rate, "bpm": bpm, "doc": doc, "events": None if doc else events,
            "melody_voice": voice, "lanes": lanes, "played": total}


cases = [
    run("boom_bap-24bars", "boom_bap", 3, 24),                       # piano
    run("jazz_rap-24bars", "jazz_rap", 4, 24),                       # epiano
    run("trap-24bars", "trap", 6, 24),                               # bell
    run("alternative-24bars", "alternative", 2, 24),                 # lead
    run("g_funk-24bars", "g_funk", 5, 24),                           # whistle
    run("memphis-24bars", "memphis", 7, 24),                         # darkbell
    run("miami_bass-24bars", "miami_bass", 8, 24),                   # fmbell
    run("east_coast-override-bell", "east_coast", 1, 24, melody_voice="bell"),
    run("lofi-stem-melody", "lofi", 9, 24, stem="melody"),
    run("lofi-stem-drums", "lofi", 9, 8, stem="drums"),
    run("boom_bap-section-hook", "boom_bap", 9, 2, section="hook"),
    run("boom_bap-section-verse", "boom_bap", 9, 2, section="verse"),
]

planes = np.concatenate(LANES).view(np.uint8).reshape(-1, 8).T.copy().tobytes()
with open(LANES_OUT, "wb") as f:
    f.write(brotli.compress(planes, quality=11, lgwin=24))
with open(OUT, "w", encoding="utf-8") as f:
    json.dump({"notes": notes, "harmony": harmony, "chords": hh.CHORDS, "modes": hh.MODES, "cases": cases}, f,
              separators=(",", ":"), allow_nan=False)
for c in cases:
    print(c["name"], c["melody_voice"], c["played"], [(l["played"], l["bars"]) for l in c["lanes"]])
print(len(notes), "motifs", len(cases), "cases", os.path.getsize(OUT), "bytes", os.path.getsize(LANES_OUT), "lane bytes")
