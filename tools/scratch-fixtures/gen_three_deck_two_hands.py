"""Writes src/engine/dj/scratch/__tests__/fixtures/three_deck_two_hands.json: the Up Rough demo's TWO HANDS rule
(ledger C15, three_deck.py :195-235) bar by bar over the 32-bar routine.

  juggles   per bar: three_deck._section_juggles(jl, role) - the A/B decks hand-juggle (1) or only play and fade (0).
  hand      per bar: three_deck._perf_events(jl, bar, 1, role == 'silent') is a hand-juggle pattern (1) or the single
            BAR_START play of the record (0) - the same rule seen from the events it plans.
  deck_c    per bar: Deck C plays in this section (scratch level after scratch_permission > 0 and role != 'silent').

  /opt/homebrew/bin/python3.11 -I tools/scratch-fixtures/gen_three_deck_two_hands.py \
    /Users/spot/Code/Up_Rough_Demo_System/tools src/engine/dj/scratch/__tests__/fixtures/three_deck_two_hands.json
"""
import importlib.util
import json
import os
import sys

TOOLS, OUT = sys.argv[1], sys.argv[2]
sys.path.insert(0, TOOLS)
spec = importlib.util.spec_from_file_location('three_deck', os.path.join(TOOLS, 'three_deck.py'))
td = importlib.util.module_from_spec(spec)
spec.loader.exec_module(td)

juggles, hand, deck_c = [], [], []
for name, b0, bars, jl, sl, role in td.ARC_3DECK:
    lvl = min(sl, td.scratch_permission(jl, td.DEFAULT_BUDGET))
    for b in range(bars):
        juggles.append(1 if td._section_juggles(jl, role) else 0)
        ev = td._perf_events(jl, b0 + b, 1, role == 'silent')
        hand.append(0 if all(e[3] == 'BAR_START' for e in ev) else 1)
        deck_c.append(1 if lvl > 0 and role != 'silent' else 0)
with open(OUT, 'w') as f:
    json.dump({'juggle_jl_min': td.JUGGLE_JL_MIN, 'juggles': juggles, 'hand': hand, 'deck_c': deck_c}, f)
    f.write('\n')
print(len(juggles), ''.join(map(str, juggles)), ''.join(map(str, hand)), ''.join(map(str, deck_c)))
