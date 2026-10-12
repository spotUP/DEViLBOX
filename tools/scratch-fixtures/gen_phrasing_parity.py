"""Generates src/engine/dj/scratch/__tests__/fixtures/phrasing_parity.json: the Up Rough demo's own
scratch PLANS (no audio) for the plan-level lock-step parity of SCR-PHRASING-PARITY.

Three planners of the demo, each called through its real functions:

  overlay     the hip-hop scratch overlay a track gets (hiphop.render_section ->
              scratch.render_scratch_section): per section, `plan_phrase` per bar on the
              section-local bar, the section's length and the section seed (bseed = seed + the
              bars before it), one record per section (`pick_source`, the pool = record_set
              'clean'), and with routine 'auto' the section's `routine_for` in its closing bars
              (the routine's events on a step past the section are cut by the render's trim).
  scratchDj   scratch_dj.build_routine(style, seed): the 32-bar showcase (C5), with validate().
  threeDeck   three_deck.build_scratch_events(seed): the 32-bar three-deck routine (C10), with
              the record each event plays (render(): role pools from cue_pools_from_bank, the
              role's pool index advancing on every clean 'drop').

The tracks (section lists) come from the spec the TS test also reads, so both sides plan the
same structure. Gesture names are the demo's (`forward_stab`); the test maps them.
Run: /opt/homebrew/bin/python3.11 -I tools/scratch-fixtures/gen_phrasing_parity.py \
       /Users/spot/Code/Up_Rough_Demo_System/tools src/engine/dj/scratch/__tests__/fixtures/phrasing_parity_spec.json \
       src/engine/dj/scratch/__tests__/fixtures/phrasing_parity.json
"""
import importlib.util
import json
import os
import sys

TOOLS, SPEC, OUT = sys.argv[1], sys.argv[2], sys.argv[3]


def load(name):
    sp = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


sc = load("scratch")
sdj = load("scratch_dj")
td = load("three_deck")
sr = load("scratch_routine")
sb = load("scratch_bank")

# the DEViLBOX palettes name the demo's own scratch PROFILES directly
for p in sc.PROFILES:
    sc.STYLE_TO_PROFILE.setdefault(p, p)

bank = sb.load_bank(with_audio=False)
bank_order = list(bank)                                   # load order = sorted file names
clean_pool = sc.record_set("clean")                       # sorted canonical names, not pre-scratched
spec = json.load(open(SPEC))


def overlay(track, routine):
    profile = track["profile"]
    seed = track["seed"]
    events, records = [], []
    for sec in track["sections"]:
        name, start, bars = sec["name"], sec["startBar"], sec["bars"]
        bseed = seed + start                                # hiphop: bseed += nb per section
        records.append({"startBar": start, "record": sc.pick_source(profile, name, bseed, allowed=clean_pool)})
        routine_bars = set()
        if routine:
            rname = sc.routine_for(profile, name) if routine == "auto" else routine
            r = sr.ROUTINES[rname]
            rb = min(int(r["bars"]), bars)
            first = max(0, bars - rb)
            routine_bars = set(range(first, first + rb))
            for ev in r["events"]:
                rbar, step, _cue, gesture, vel = ev[:5]
                if rbar * 16 + step >= rb * 16:             # past the section: trimmed by the render
                    continue
                b = first + rbar + step // 16
                events.append({"bar": start + b, "step": step % 16, "gesture": gesture,
                               "velocity": vel, "kind": "routine", "routine": rname})
        for bar in range(bars):
            if bar in routine_bars:
                continue
            for step, g, v, role in sc.plan_phrase(profile, name, bar, bars, bseed):
                events.append({"bar": start + bar, "step": step, "gesture": g, "velocity": v,
                               "kind": "phrase", "role": role})
    return {"events": events, "records": records}


out = {
    "bankOrder": bank_order,
    "category": {c: e["category"] for c, e in bank.items()},
    "clean": {c: bool(e["source_is_clean"]) for c, e in bank.items()},
    "cleanPool": clean_pool,
    "activity": {n: sc.gesture_activity(n) for n in sc.GESTURES},
    "profiles": {p: {"gestures": v["gestures"], "scale": v["scale"]} for p, v in sc.PROFILES.items()},
    "overlay": [],
    "scratchDj": [],
    "threeDeck": [],
}
for track in spec["tracks"]:
    for routine in track.get("routines", [None]):
        o = overlay(track, routine)
        out["overlay"].append({"track": track["name"], "routine": routine, **o})

for style in sdj.STYLE_PALETTE:
    for seed in spec["routineSeeds"]:
        ev = sdj.build_routine(style, seed)
        out["scratchDj"].append({"style": style, "seed": seed,
                                 "events": [[b, s, r, g, round(float(v), 12)] for (b, s, r, g, v) in ev],
                                 "issues": sdj.validate(ev)})

pools = sdj.cue_pools_from_bank({c: dict(e, source=c) for c, e in bank.items()})
out["pools"] = pools
for seed in spec["routineSeeds"]:
    sev = td.build_scratch_events(seed)
    role_i = {r: 0 for r in pools}
    rows = []
    for (bar, st, role, gesture, vel) in sev:
        rec = None
        if gesture not in ("needle_drop", "needle_lift"):
            if gesture == "drop":
                role_i[role] = role_i.get(role, 0) + 1
            pool = pools.get(role) or pools.get("HOME")
            rec = pool[role_i.get(role, 0) % len(pool)]
        rows.append([bar, st, role, gesture, round(float(vel), 12), rec])
    out["threeDeck"].append({"seed": seed, "events": rows})

json.dump(out, open(OUT, "w"), indent=1)
print("[phrasing-parity] %d overlay plans, %d scratch_dj, %d three_deck -> %s"
      % (len(out["overlay"]), len(out["scratchDj"]), len(out["threeDeck"]), OUT))
