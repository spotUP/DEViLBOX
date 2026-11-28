"""R6 / R12: bakes the Up Rough demo's synthesized scratch sources, rendered by the demo's own code.

  sources  scratch.build_sources(22050): vocal_ah / vocal_fresh / vocal_yeah / robot / horn / snare / noise,
           each already through its grit (s950 or sp1200, none for noise), _norm, _anchor_safe.
  words    scratch_routine.build_cue_sources(22050): the routine word cues IF / YOU / REALLY / ROCK / FUNKY /
           BEAT / PHRASE (male_mid, s950), each with anchor, safe ranges, sub-anchors, preferred gestures.

The demo's voice synth (vocalstab, ~1700 lines) is not re-implemented: its output is the record, as the crate's
WAVs are. Writes int32 mono 22,050 Hz WAVs to public/data/samples/packs/scratch-originals/synth/, their cue data to
src/engine/dj/scratch/synthSources.json and a sample check to src/engine/dj/scratch/__tests__/fixtures/synth_sources.json.

  PYTHONDONTWRITEBYTECODE=1 /opt/homebrew/bin/python3.11 -I tools/scratch-fixtures/gen_synth_sources.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools .
"""
import sys, json, os, wave
sys.dont_write_bytecode = True
sys.path.insert(0, sys.argv[1])
import numpy as np
import scratch, scratch_routine

RATE = 22050
root = sys.argv[2]
wav_dir = os.path.join(root, "public/data/samples/packs/scratch-originals/synth")
os.makedirs(wav_dir, exist_ok=True)


def write_wav(path, sig):
    x = np.clip(np.asarray(sig, float), -1.0, 1.0 - 2.0 ** -31)
    pcm = np.round(x * 2.0 ** 31).astype("<i4")
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(4); w.setframerate(RATE); w.writeframes(pcm.tobytes())


meta = {"rate": RATE, "sources": {}, "words": {}}
check = {"idx_step": 97, "sources": {}, "words": {}}
for name, s in scratch.build_sources(RATE).items():
    write_wav(os.path.join(wav_dir, f"{name}.wav"), s["sig"])
    meta["sources"][name] = {"file": f"synth/{name}.wav", "n": len(s["sig"]), "anchor": int(s["anchor"]),
                             "safe": [int(s["safe"][0]), int(s["safe"][1])]}
    check["sources"][name] = [float(v) for v in s["sig"][::97]]
for word, c in scratch_routine.build_cue_sources(RATE).items():
    write_wav(os.path.join(wav_dir, f"word_{word.lower()}.wav"), c["sig"])
    meta["words"][word] = {"file": f"synth/word_{word.lower()}.wav", "n": len(c["sig"]), "anchor": int(c["anchor"]),
                           "safe": [int(v) for v in c["safe"]], "safeForward": [int(v) for v in c["safe_forward"]],
                           "safeReverse": [int(v) for v in c["safe_reverse"]],
                           "sub": {k: int(v) for k, v in c["sub"].items()}, "preferred": list(c["preferred"])}
    check["words"][word] = [float(v) for v in c["sig"][::97]]
json.dump(meta, open(os.path.join(root, "src/engine/dj/scratch/synthSources.json"), "w"), indent=1)
json.dump(check, open(os.path.join(root, "src/engine/dj/scratch/__tests__/fixtures/synth_sources.json"), "w"))
print("ok", len(meta["sources"]), len(meta["words"]))
