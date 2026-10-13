"""Writes src/engine/dj/scratch/__tests__/fixtures/record_sets.json: the Up Rough demo's "Records" selector
(scratch.py `all_source_names`, `record_set`, `record_set_choices`, and `pick_source`'s pool order; ledger R8)
for every choice plus an unknown one, from the demo's own bank metadata.

  /opt/homebrew/bin/python3.11 -I tools/scratch-fixtures/gen_record_sets.py \
    /Users/spot/Code/Up_Rough_Demo_System/tools src/engine/dj/scratch/__tests__/fixtures/record_sets.json
"""
import importlib.util
import json
import os
import sys

TOOLS, OUT = sys.argv[1], sys.argv[2]


def load(name):
    sp = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


sc = load("scratch")
choices = sc.record_set_choices()
sets = {c: sc.record_set(c) for c in choices + ["", "nonsense", "CLEAN"]}
picks = []
for sel in ["clean", "all", "bank", "cat:fresh"]:
    allowed = sc.record_set(sel)
    for section in ["hook", "verse", "showcase", "A"]:
        for seed in [0, 7, 30, 101]:
            picks.append(dict(sel=sel, section=section, seed=seed, pick=sc.pick_source("golden_era", section, seed, allowed=allowed)))
json.dump(dict(allNames=sc.all_source_names(), choices=choices, sets=sets, picks=picks), open(OUT, "w"), indent=1)
print("ok", len(choices), "choices", len(picks), "picks")
