"""Writes src/engine/dj/scratch/__tests__/fixtures/bank_analysis.json: the Up Rough demo's bank analyzer (ledger R3)
and phrase auto-cue (R5) on the crate's pack WAVs (public/data/samples/packs/scratch-originals, the same audio as the
demo's bank under its pack names).

  records   per pack file: scratch_bank._read_wav -> analyze (unrounded), _cue_points, split_words (labels from the
            original filename, as load_bank passes them; every record, so the splitter is checked on all of them).
  wav_cues  scratch_routine.load_wav_cues on two phrase WAVs, the default cue map and a fraction map: per cue the
            anchor, safe range, sub-cues and every KEEP-th sample of its signal.

  /opt/homebrew/bin/python3.11 -I tools/scratch-fixtures/gen_bank_analysis.py \
    /Users/spot/Code/Up_Rough_Demo_System/tools public/data/samples/packs/scratch-originals \
    src/engine/dj/scratch/__tests__/fixtures/bank_analysis.json
"""
import importlib.util
import json
import os
import sys

TOOLS, PACK, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
sys.path.insert(0, TOOLS)


def load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + '.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


sb, sr = load('scratch_bank'), load('scratch_routine')
meta = json.load(open(os.path.join(PACK, 'scratch_bank_metadata.json')))
RATE = 22050
KEEP = 37
out = {'records': [], 'wav_cues': []}
for canon, e in sorted(meta.items()):
    path = os.path.join(PACK, e['packFile'])
    d = sb._read_wav(path, RATE)
    info = sb.analyze(d, RATE)
    # the unrounded values the rounding hides
    import numpy as np
    base = os.path.splitext(e['filename'])[0]
    wordish = base.replace('_', '-').split('-')
    out['records'].append(dict(
        canon=canon, packFile=e['packFile'], filename=e['filename'], n=len(d),
        info=info, cues={k: (list(v) if isinstance(v, tuple) else v) for k, v in sb._cue_points(d, RATE).items()},
        flux=[int(x) for x in sb._flux_onsets(d, RATE)],
        words=[list(w) for w in sb.split_words(d, RATE, labels=wordish)] if len(wordish) >= 2 else [],
    ))

# the one 16-bit phrase of the crate: load_wav_cues has no 24-bit branch (the others fail in the demo's reader)
files = {'IF_YOU_REALLY_LIKE_TO_ROCK_THE_FUNKY_BEAT': None}
for canon in files:
    files[canon] = meta[canon]['packFile']
for canon, pf in files.items():
    for label, cmap in (('default', None), ('fractions', {'ROCK': 0.6, 'BEAT': 0.9, 'IF': 0.05})):
        cues = sr.load_wav_cues(os.path.join(PACK, pf), RATE, cue_map=cmap)
        out['wav_cues'].append(dict(canon=canon, packFile=pf, map=label, cueMap=cmap, onsets=[float(x) for x in sr._detect_onsets(cues['PHRASE']['sig'], RATE)], cues={
            k: dict(n=len(c['sig']), anchor=int(c['anchor']), safe=[int(x) for x in c['safe']], safe_forward=[int(x) for x in c['safe_forward']],
                    safe_reverse=[int(x) for x in c['safe_reverse']], sub={kk: int(vv) for kk, vv in c['sub'].items()}, preferred=c['preferred'],
                    sig=[float(x) for x in c['sig'][::KEEP]]) for k, c in cues.items()}))
out['keep'] = KEEP
json.dump(out, open(OUT, 'w'))
print('records', len(out['records']), 'wav cues', len(out['wav_cues']))
