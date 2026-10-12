"""Writes src/engine/dj/scratch/__tests__/fixtures/scratch_overlay_null.json: the Up Rough demo's overlay and
routine renders for the PG-J null test (every stroke through the demo's render path).

  overlay  scratch.render_scratch_section('golden_era', 'hook', 8, 92, 22050, seed, allowed_sources=
           record_set('clean'), routine='auto'): the DJ brain's strokes on the section's record (pick_source),
           the boom-bap profile deck, physics seed seed x 3 + bar x 16 + step, human timing from
           LFSR(seed x 999 + 5), hook_call_response on the closing two bars (render_routine(channel=False),
           its slot records `_routine_cues`, the ending's one-step tape delay), then apply_fx(_FX_BOOMBAP) on the
           section's sum. The seed is the first from 1 whose plan places at least two DJ-brain strokes.
  routine  scratch_routine.render_routine('phrase_end', 92, 22050, cues=<every slot one record>, seed,
           channel=False): the three strokes, the last (step 16) with its tape-delay tail.
  versions scratch_routine.render_versions('phrase_end', ...) (C3, the stored versions): the routine through
           scratch_channel as RoutineDry / RoutineDark (lp 3800) / RoutineDelay / RoutinePhraseEnd, each
           peak-normalised to 0.75 (every 29th sample).

  dense    render_scratch_section('golden_era', 'showcase', 4, 92, 22050, seed, allowed_sources=record_set('clean')):
           a section the demo plans densely (P13): the seed is the first from 1 whose plan puts two strokes on
           step 15 of one bar (plan_phrase clamps its 16) - the demo sums both, and the overlapping ones.

  profiles render_gesture('baby', velocity 0.8, seed 9) on ALRIGHT_STOP with each of the nine PROFILES' deck
           physics (P7: deck, slipmat, record, performer, cartridge).

Every 7th sample is kept (float64 repr).
  /opt/homebrew/bin/python3.11 -I tools/scratch-fixtures/gen_scratch_overlay_null.py \
    /Users/spot/Code/Up_Rough_Demo_System/tools src/engine/dj/scratch/__tests__/fixtures/scratch_overlay_null.json
"""
import importlib.util
import json
import os
import sys

TOOLS, OUT = sys.argv[1], sys.argv[2]
RATE = 22050
KEEP = 7
BPM = 92
BARS = 8


def load(name):
    sp = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


sc = load("scratch")
sr = load("scratch_routine")
allowed = sc.record_set("clean")

seed = 1
while True:
    rows = [sc.plan_phrase("golden_era", "hook", b, BARS, seed) for b in range(BARS - 2)]
    if sum(len(r) for r in rows) >= 2:
        break
    seed += 1
plan = [dict(bar=b, step=s, gesture=g, velocity=v) for b, r in enumerate(rows) for (s, g, v, _role) in r]
overlay = sc.render_scratch_section("golden_era", "hook", BARS, BPM, RATE, seed=seed, allowed_sources=allowed, routine="auto")

ROUTINE_SEED = 41
ROUTINE_RECORD = "FRESH_STANDARD"
src = sc.bank_sources(RATE, [ROUTINE_RECORD])[ROUTINE_RECORD]
cues = {s: src for s in ("ROCK", "FUNKY", "BEAT", "IF", "YOU", "REALLY", "PHRASE")}
routine = sr.render_routine("phrase_end", bpm=BPM, rate=RATE, cues=cues, seed=ROUTINE_SEED, channel=False)

versions = sr.render_versions("phrase_end", bpm=BPM, rate=RATE, cues=cues, seed=ROUTINE_SEED)

prof_src = sc.bank_sources(RATE, ["ALRIGHT_STOP"])["ALRIGHT_STOP"]
profiles = {k: sc.render_gesture(prof_src, "baby", 2 * 3595 / RATE, RATE, velocity=0.8, profile=v["deck"], seed=9) for k, v in sc.PROFILES.items()}

DENSE_BARS = 4
dense_seed = 1
while True:
    rows = [sc.plan_phrase("golden_era", "showcase", b, DENSE_BARS, dense_seed) for b in range(DENSE_BARS)]
    if any([s for (s, _g, _v, _r) in r].count(15) >= 2 for r in rows):
        break
    dense_seed += 1
dense_plan = [dict(bar=b, step=s, gesture=g, velocity=v) for b, r in enumerate(rows) for (s, g, v, _role) in r]
dense = sc.render_scratch_section("golden_era", "showcase", DENSE_BARS, BPM, RATE, seed=dense_seed, allowed_sources=allowed)

out = dict(
    rate=RATE, keep=KEEP, bpm=BPM, bars=BARS, seed=seed,
    record=sc.pick_source("golden_era", "hook", seed, allowed=allowed),
    plan=plan,
    overlayN=len(overlay), overlay=[float(v) for v in overlay[::KEEP]],
    routineSeed=ROUTINE_SEED, routineRecord=ROUTINE_RECORD,
    routineN=len(routine), routine=[float(v) for v in routine[::KEEP]],
    profiles={k: dict(n=len(v), out=[float(x) for x in v[::KEEP]]) for k, v in profiles.items()},
    denseBars=DENSE_BARS, denseSeed=dense_seed, denseRecord=sc.pick_source("golden_era", "showcase", dense_seed, allowed=allowed),
    densePlan=dense_plan, denseN=len(dense), dense=[float(v) for v in dense[::KEEP]],
    versionKeep=29, versions={k: dict(n=len(v), out=[float(x) for x in v[::29]]) for k, v in versions.items()},
)
json.dump(out, open(OUT, "w"))
print("ok dense seed", dense_seed, "plan", len(dense_plan))
print("ok seed", seed, "plan", plan, "overlay", len(overlay), "routine", len(routine))
