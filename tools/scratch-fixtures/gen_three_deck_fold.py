"""Generates src/engine/dj/scratch/__tests__/fixtures/three_deck_fold.json: the Up Rough demo's
three_deck.build_scratch_events(seed, budget, phrase_emphasis=..., fold=...) over a fast set (fold 2)
and a very slow one (fold 0.5) - the phrases written in routine bars inside each section of the set's
32-bar arc (demo commit be56beced, SCRATCH-FOLD-OVERLAY). Called through the real function.
Run: /opt/homebrew/bin/python3.11 -I tools/scratch-fixtures/gen_three_deck_fold.py \
       ~/Code/UpRough/Up_Rough_Demo_System/tools src/engine/dj/scratch/__tests__/fixtures/three_deck_fold.json
"""
import importlib.util
import json
import os
import sys

TOOLS, OUT = sys.argv[1], sys.argv[2]
sys.path.insert(0, TOOLS)
sp = importlib.util.spec_from_file_location("three_deck", os.path.join(TOOLS, "three_deck.py"))
td = importlib.util.module_from_spec(sp)
sp.loader.exec_module(td)

rows = []
for fold in (2, 0.5):
    for emphasis in (False, True):
        for seed in range(6):
            ev = td.build_scratch_events(seed, td.DEFAULT_BUDGET, phrase_emphasis=emphasis, fold=fold)
            rows.append({"seed": seed, "fold": fold, "emphasis": emphasis,
                         "events": [[b, st, role, g, round(float(v), 12)] for (b, st, role, g, v) in ev]})
json.dump({"rows": rows}, open(OUT, "w"))
print("rows", len(rows), "events", sum(len(r["events"]) for r in rows))
