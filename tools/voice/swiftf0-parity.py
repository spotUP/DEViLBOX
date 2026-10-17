"""Build SwiftF0 parity fixtures: synthesise two takes, run swift_f0, dump track + notes."""
import json, sys
import numpy as np
from swift_f0 import SwiftF0, segment_notes
from swift_f0.core import PitchResult

SR = 16000
out_dir = sys.argv[1]

def tone(f0, dur, vowel):
    # ooo: strong fundamental, weak upper; eee: weak fundamental, strong 3rd-5th harmonics
    t = np.arange(int(dur * SR)) / SR
    amps = [1.0, 0.4, 0.15, 0.05, 0.02] if vowel == "o" else [0.35, 0.3, 0.8, 0.6, 0.45]
    x = sum(a * np.sin(2 * np.pi * f0 * (h + 1) * t) for h, a in enumerate(amps))
    env = np.minimum(1, np.minimum(t / 0.02, (dur - t) / 0.02))
    return 0.25 * x / max(amps) * env

def alternating():
    parts = [np.zeros(int(0.2 * SR))]
    for i, (f, d) in enumerate([(220, .45), (277.18, .45), (220, .5), (277.18, .45), (220, .5), (277.18, .55)]):
        # each note changes vowel halfway: o then e (timbre change inside one pitch)
        parts += [tone(f, d / 2, "o"), tone(f, d / 2, "e"), np.zeros(int(0.06 * SR))]
    parts.append(np.zeros(int(0.3 * SR)))
    return np.concatenate(parts)

def glide():
    t1 = np.arange(int(1.0 * SR)) / SR
    f = 220 * (330 / 220) ** t1  # one-second glide 220 -> 330 Hz
    phase = 2 * np.pi * np.cumsum(f) / SR
    g = 0.25 * (np.sin(phase) + 0.3 * np.sin(2 * phase))
    hold = tone(330, 0.6, "o")
    return np.concatenate([np.zeros(int(0.2 * SR)), g, hold, np.zeros(int(0.3 * SR))])

det = SwiftF0()
for name, audio in [("alternating", alternating()), ("glide", glide())]:
    r = det.detect(audio.astype(np.float32), SR)
    hz = np.asarray(r.pitch_hz, np.float32)
    conf = np.asarray(r.confidence, np.float32)
    loud = np.asarray(r.loudness_db, np.float32)
    r32 = PitchResult(timestamps=r.timestamps, pitch_hz=hz.astype(np.float64), confidence=conf.astype(np.float64), loudness_db=loud.astype(np.float64))
    notes = segment_notes(r32)
    period = 256 / SR
    fixture = {
        "source": "swift-f0 d1ba77f segment_notes(pitch_hold_ms=80), synthetic take: " + name,
        "hopSeconds": period,
        "hz": [float(v) for v in hz],
        "confidence": [float(v) for v in conf],
        "loudnessDb": [float(v) for v in loud],
        "notes": [{"startFrame": int(round(n.start / period)), "endFrame": int(round(n.end / period)),
                   "midi": int(np.floor(69 + 12 * np.log2(n.pitch_hz / 440) + 0.5)), "pitchHz": n.pitch_hz} for n in notes],
    }
    with open(f"{out_dir}/{name}.json", "w") as fh:
        json.dump(fixture, fh)
    print(name, len(hz), "frames", [(n["startFrame"], n["endFrame"], n["midi"]) for n in fixture["notes"]])
