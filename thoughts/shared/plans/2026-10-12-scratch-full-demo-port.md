---
date: 2026-10-12
topic: Scratch and beat juggle - full port of the Up Rough demo turntablist engine (every gap row)
tags: [scratch, juggle, dj, port, demo-parity, ledger]
status: draft
---

# Full demo turntablist port - ledger

Owner 2026-10-12: "its not acceptable that you skip stuff randomly and pretend its fine".
Source of rows: thoughts/shared/research/2026-10-12_demo-scratch-engine-port-gap.md (89 rows: 25 yes, 64 open). Phase 0 (2026-10-12) added 17 rows from an AST inventory and re-verified the 64: see below.

Rule: every row below ends as PORTED (commit + test that fails on revert) or EXEMPT (owner decision quoted, with date).
No row is closed by an agent's judgement. Rows that conflict with an earlier owner decision (O1-O5 in the gap doc) wait for the owner.
"Parity" or "1:1" may not be claimed in a commit or report while any row is open.

OWNER DECISIONS 2026-10-12:
- Conflicts O1-O7 (gap doc section 3): DEMO EVERYWHERE. Offline physics, velocity -> level/tone (V1-V3 incl. 3 kHz sparkle), demo gesture timings and fader windows, S950 22.05 kHz grit, juggle break grammar J1-J5 and synthesized sources R6, demo GESTURE_LEVELS, fader ramp sharper with velocity. Earlier tuned values (SA-m5, SA-B2 durations, by-ear ladder) are superseded. No row is EXEMPT.
- Definition of done: "when everything is fully ported over, everything else is a waste of time". Done = 64 of 64 PORTED and the full-chain null vs the demo render below threshold. Phase order: gap doc section 4. One fresh agent per phase (SCRATCH-PORT-HANDOVER rule), each ticks this table with commit + test.

- Owner 2026-10-12 (restated): "as long as everything gets ported over and nothing is skipped we should be fine" = definition of done.
- Two checks before any port phase starts (first phase agent):
  1. Inventory completeness: the 89 rows were written by one agent. Re-count every function, table and constant in the demo's turntablist modules (UR/turntable.py, UR/scratch.py, scratch_routine.py, beat_juggle.py and anything they import), counting from the source structure, not the doc. Add every missing item as a new row here.
  2. Every row is assigned to a phase. The gap doc's PG-A..PG-I list leaves some rows unphased (e.g. F3, F5, F6). No row may stay without a phase.

- Owner 2026-10-12: activated deck 3 and saw no animated scratching. Today's Auto Scratch plays on record voices on the scratch bus, and nothing reads their positions (gap D1). Row D1 must deliver: Auto Scratch strokes drive deck C's platter, fader and slip animation from the same physics, as in the demo's dj_viz / three_deck. Reachability: an Auto Scratch stroke moves the deck C platter angle (sentinel on the view's position consumer).


OWNER DECISIONS 2026-10-12 (phase-0 questions):
- P13: KEEP the DEViLBOX live extras (vocal scaling, call/answer, mode caps, one-hand filter, short arc features, juggle response, transition scratch) as a layer ON TOP of the exact demo overlay. The demo overlay is ported exactly and is what the null test checks; the extras never change what the demo plans.
- J3/J6: SHIP the amen break and the hip-hop juggle records; owner owns/cleared them.
- X6 (main-session call under "demo everywhere"): Deck C level = 0.60 x RMS of the A/B juggle decks only (live: running RMS over the A+B deck buses), not the programme meter.
- T6 (main-session call under "demo everywhere"): the demo never calls cartridge_response, so the stroke path must not apply it. Port it as an available function, applied nowhere, same as the demo.

OWNER DECISION 2026-10-13: section end follows the demo's render_scratch_section: about 0.12 s of room tail rides into the next section (not the hip-hop mix's hard cut). Keep as built by PG-J.
NEXT PHASE (after PG-J 7b6a338f3 3ef4c16ec b5b48e111, 48 of 81): P13 first (PG-E). MUSICAL caps the demo's density and gesture level, the vocal rule thins it, and the one-hand rule drops the demo's second step-15 stroke; extras must sit ON TOP of the exact demo plan. Measured with P13 open: MUSICAL scratches 1.7 % of a 10-minute set (1.16 strokes per phrase); the demo overlay scratches 15.1 % (3.09 per phrase). Then C11/C15 (PG-F) plus arc gating (today the 32-bar routine plays only at PEAK in PERFORMER or BATTLE). Also delete the dead old-voice stages in scratchBus.ts (one-path rule).

Running count: 51 of 81 closed (2026-10-13: P13, P12, G11 = +3, 30 open). Before: 48 of 81 (PG-J 2026-10-12: +26 - the 25 PG-J rows and X6 - at 7b6a338f3 / 3ef4c16ec; 33 open). Before PG-J: 22 of 81 (phase 0 re-verification, against main at 61ae1abcf). The 22 are rows the gap doc had as open that current code already ports exactly, with a fixture test against the demo; their revert checks were not re-run in phase 0.

Null-test oracle and per-stage residual table: thoughts/shared/research/2026-10-12_scratch-null-test.md (render path: record -306 dB, strokes -240..-307 dB, Deck C chain -152 dB, shaped layer -71 dB, 48 kHz read -104 dB vs ideal). Every PG phase checks against it.

## PG-J progress (agent PG-J, 2026-10-12; started at 3ec6bb81a) - DONE, 26 of 26 closed

Checklist (26 items: the 25 PG-J rows + X6 assigned to this phase). All ticked: commit 7b6a338f3 (+ 3ef4c16ec, the ring's record mode removed).

- [x] W1 worklet: overlay section chain (apply_fx per section, input cut at the section end, output as long as the demo's), C3 version chains (variable lp), A+B beat input (X6)
- [x] W2 renderer: the 9 profile decks (P7), apply_fx exported (X2), routine ending delay (C2), catalogue gestures the demo lacks on the same renderer
- [x] W3 planner: overlay render specs (P10 seed, P11 human timing per demo slot, section, profile deck, routine bars); R12's record-set branch (routine slot records) was needed for the overlay null and is in
- [x] W4 controller: extras (short arcs, juggle response, their needles) on their section's overlay bus; transitions on their preset's version chain; pads / MCP / tracker samples one-off on Deck C
- [x] W5 pool render-only; tracker samples at 22,050 Hz; loop / cue / anchor on the render path; ScratchRecordVoice, scratchLevel and the ring's record mode deleted
- [x] W6 X6 level: A+B tap (live) and A+B buffers (planned)
- [x] W7 null test extended (overlay section, phrase_end routine, nine profiles, four versions, registry entry points); fixture script tools/scratch-fixtures/gen_scratch_overlay_null.py

Revert checks (each mutation applied, its test run, restored; all FAIL as required): M1 section hp (overlay null), M2 human timing 0, M3 seed without x3, M4 no slot records, M5 no ending delay (routine null), M6 version lp ignored (Dark), M7 lofi performer, M8 velocity default 0.7 (MCP case), M9 tracker read with grit, M10 bus ignores its A+B input, M11 deck B dropped, M12 extras without a spec (juggle test), M13 overlay planner spec dropped (overlay null), M14 catalogue gesture rendered as a baby (twiddle case), M15 section drive removed, M16 pad stroke on the wrong chain.

Not ported here (other phases' rows): R12 synthesized-cue branch (needs R6, PG-I); the duck for a module deck (X7, PG-F); scratchBus.ts still carries the old voice bus's velocity / style FX / preset stages, now called by nothing (the deck path uses only its wet room) - cleanup, no row.

### Density and repetition, 10-minute Auto DJ set (owner 2026-10-12: "repetitive sparse boring")

`autoDJScratchTenMinuteSet.test.ts` (corpus 'drops' tiled, 324 bars, CRUISING, juggle off) logs per mode. PG-J did not change any plan (the golden fixtures differ only by the added render specs), so before = after:

| | duty (bars) | strokes per 4-bar phrase with a scratch | gestures per phrase | a stroke sounds | gestures used |
|---|---|---|---|---|---|
| DEViLBOX MUSICAL | 13.6 % | 1.16 | 1.13 | 1.7 % of the set | 2 (transformer4, flare2), all FILL |
| DEViLBOX PERFORMER | 24.4 % | 1.65 | 1.47 | 3.6 % | 9 |
| the demo's overlay on this track (same planner, no mode cap, no vocal rule) | 52.5 % | 3.09 | 1.76 | 15.1 % | |
| the demo's three-deck routine (its Deck C performance, 32 bars) | 81.3 % | 23.0 | 4.14 | 76.8 % | |

Causes, by row: P13 (PG-E) - MUSICAL caps the demo's density state (high -> medium) and its level (2: two gestures), the vocal rule thins it, and one hand drops the demo's second step-15 stroke; the owner's P13 decision says these extras must not change what the demo plans, and today they cut it to a ninth. The demo's own performance (three_deck, 23 strokes a phrase) only reaches the set as a 32-bar feature at PEAK in PERFORMER / BATTLE (DJScratchDJ `wantsFeature`): when the demo routine plays is C11 / C15 (PG-F) and DEViLBOX's arc gating.

## P13 progress (agent P13, 2026-10-13; started at 180c04c0d)

Checklist (this run's scope, in order): [x] S1 P13 (e00109395) - [ ] S2 C11/C15 + arc gating (owner decision, below) - [x] S3 scratchBus.ts dead stages - [ ] S4 remaining PG-E rows: [x] P12 (d531d6acc) - [x] G11 - [ ] R8 - [ ] C16 - [ ] R12 (waits on R6, PG-I). Running count: 51 of 81.

S1 P13 (closed). The demo overlay is the base in every mode except OFF: `planScratch` places every stroke `plan_phrase` places (`planPhrase({demo: true})`: `min(step, 15)`, nothing dropped), with the profile's gestures and the section's natural density; the routine option's events as written (no level replacement, no density/SAFE gate). DEViLBOX extras are `layer: 'extra'`, planned inside the mode/genre caps and added by `onTopOfTheDemo` (one hand against every sounding stroke). Controller: a planned rest holds the extras only; short features and the juggle response are `onTheOverlay` (the overlay's demo strokes + the feature on top); juggleSafe filters extras only; `checkScratch(e, s, {demo})` keeps the structural rules for demo strokes and drops rate / cuts / vocal / bass for them.
Also fixed on the way (both needed for the demo's dense plan to sound right):
- worklet Section: hp / lp / drive stop at the section end (the demo filters the cut array); before, a stroke crossing the end left filter ringing in the tail (dense null tail -15 dB -> -151 dB).
- DjFxActions: a record stroke's release that names its record never falls through to the deck-pattern stop (two overlapping strokes of one gesture: the first release deleted the flag and the second stopped the deck).
Measured (autoDJScratchTenMinuteSet, drops tiled, 324 bars, seed of the set): MUSICAL duty 52.5 %, 4.91 strokes / 2.34 gestures per phrase, sounding 24.6 %, 378 strokes = the demo on the same seed exactly (0 missing, 0 added; mix transformer8 40 hydroplane 38 orbit 19 crab 3). Before: 13.6 %, 1.16, 1.7 %. The demo over seeds 1-20 on this track: duty 52.7 +- 1.5 %, 5.01 +- 0.18 strokes, sounding 24.7 +- 0.3 % (tolerance: 1 sd MUSICAL, 3 sd PERFORMER). PERFORMER: the demo + 13 feature strokes on top. NB the handoff's "demo 3.09 strokes / 15.1 %" was the planner with one hand applied; the demo itself (both step-15 strokes) is 4.91 / 24.6 %.
Revert checks (each applied, its test run, restored; all FAIL): R1 record release falls through (scratchActionsOnePath), R2 one hand inside the demo bar (parity), R3 vocal thins the demo bar (parity), R4 governor without the demo flag (autoScratchKeepsTheDemoUnderTheVocal), R5 rest empties the window (same), R6 a feature replaces the overlay (ten-minute PERFORMER: 52 demo strokes missing), R7 the juggle response replaces the overlay (autoScratchWithJuggle), R8 juggleSafe drops demo strokes (same), R9 mode level cap on the demo vocabulary (parity), R10 mode density cap on the demo (parity); worklet section-end: dense null -46 dB before the fix.
Tests rewritten to the P13 contract (their old assertions were the caps the owner decision removed from the demo layer): scratchPlanOneHand, scratchDeterminism (vocal, low confidence), scratchPlacement (vocal awareness), scratchPlanKeepsRestsAndVocal, scratchGolden (Tests 3, 4, 5, 8 + fixtures regenerated), autoScratchWithJuggle.
S3 (cleanup, no row): scratchBus.ts keeps the channel alone (its one user is a deck's wet scratch send); the velocity, style FX, routine preset, gesture echo and ambience stages and their tables (VELOCITY_RESPONSE, SCRATCH_FX_PROFILES, STYLE_FX_PROFILE, CHANNEL_PRESETS, AMBIENCE, ambienceFor) are deleted. scratchBus.test 'one path' asserts the API; restoring the old file fails it.
Open owner questions from S1: (a) a transition (`hold`) still stops new overlay windows from being planned while a transition owns the decks; (b) the 32-bar routines (three-deck, scratch_dj) still replace the overlay for their 32 bars (S2).

## Phase 0 findings (2026-10-12)

### The decisive finding: two stroke paths

Since 61ae1abcf / b3685ea73 (SCR-NULL-TEST) DEViLBOX has two ways to play a scratch stroke:

- **Render path (demo-exact).** `scratchRender.renderGesture` (a line-for-line port of `scratch.render_gesture` with `simulate`, `render_from_motion`, `surface_noise`, `cut_pattern`, `fader_from_pattern`, `deck_motion`, `apply_fx`), summed at its bus sample on the 22,050 Hz Deck C bus (`scratchDeckC.ts`, `public/worklets/scratch-deck-c.worklet.js`) that runs `deck_c_eq` + `scratch_channel` + the dark-room tail. Null: every stroke < -200 dB, both buses < -130 dB (`src/engine/dj/__tests__/scratchNullsTheDemo.test.ts:42-63`). **Reached only by the two 32-bar features**: BATTLE plays `scratch_dj.build_routine`, PERFORMER plays `three_deck.build_scratch_events` (`DJScratchDJ.ts:383-397`, `scratchVoicePool.ts:232-268`).
- **Voice path (approximation).** Everything else: the section overlay (`render_scratch_section`), the overlay's `scratch_routine` routines, DEViLBOX's shorter arc features, the juggle response, transition scratches, pads / MCP `fireDjFx`, tracker samples. These play on `ScratchRecordVoice` rings: `simulateGesture` decimated to a ~1 kHz rate curve and always repaired (`scratchPhysics.ts:102-106`), the worklet's own fader / surface / cartridge, the bus velocity and style stages (measured deviation: PG-DR spectral centroid 1041 vs 1168 Hz). No null test exists for it.

So most sound rows are exact on the render path and not on the voice path. They stay open and close together in the new phase **PG-J** (every Auto Scratch stroke through the render path), not one by one.

### How the inventory was counted

`ast.parse` over each demo module (`/Users/spot/Code/Up_Rough_Demo_System/tools`, commit 73fa00f39): every top-level `def`, `class` and assignment target, plus every attribute the modules read from an imported module (resolved through the `_load(...)` aliases, including `_sc._sm.*`). Script: `<scratchpad>/inv.py`, `ext.py`; not committed.

| Module | Top-level items | Plumbing (not rows) | Mapped to rows |
|---|---|---|---|
| turntable.py | 22 | 0 | 22 |
| scratch.py | 63 | 7 (HERE, RATE, _load, _dsp, _sm, _tt, _sp) | 56 |
| scratch_routine.py | 18 | 6 | 12 |
| scratch_dj.py | 21 | 7 | 14 |
| scratch_bank.py | 18 | 5 (HERE, DEFAULT_DIR, RATE, _load, _dsp) | 13 |
| three_deck.py | 50 | 8 | 42 |
| beat_juggle.py | 49 | 8 (incl. the `_jbus` alias) | 41 |
| dj_viz.py | 34 | 0 | 34 |
| **Total** | **275** | **41** | **234** |

Imported symbols the modules use: 25. Mapped: 20 (synth_dsp `lp hp bp delay reverb distort resample_rate osc noise tape_sat`; sampler `process` (profiles s950, sp1200) and `reverb` (kinds short_plate, dark_room, small_room); drummachine `kick808 snare808 hat snare909`; vocalstab `render_voice`; hiphop `render_track STYLES`; device_juggle_bus `_lfsr16`). Not rows: synth_params `group param resolve schema_json` and softsynth_engine `write_audition_wav` (schema plumbing and the CLI's WAV writer; the parameters they expose are D2).

Second count (from the structure that consumes them): `scratch.GESTURES` 23 keys = `DEMO_GESTURES` 23 (`scratchRender.ts:39-63`); `_GESTURE_STEPS` 23 = catalogue `durationSteps` for the 23 demo ids (`scratchGestureCatalog.ts:147-419`).

Result: 17 items had no row and got new rows (G12, P10-P13, R12, C16, X8, J6-J10, D3-D6). Items with no new row map to an existing ID; the full map is at the end.

### Questions for the owner (rows held until answered)

1. **X6 level match.** The demo scales Deck C to 0.60 x the RMS of the whole 32-bar A/B juggle bus, measured offline. Live, DEViLBOX follows 0.60 x the programme meter over about 8 s (`scratch-deck-c.worklet.js:158, 212-215`). Is the 8 s follower the live form of the demo rule, or must it measure the A/B decks only?
2. **P13 DEViLBOX-only planning.** The overlay planner adds things the demo never had: density scaled by live vocal activity, an answer after a vocal call, thinning on busy vocals, mode density caps, `routineInLevel`, the one-hand filter (`scratchPlanner.ts:175-236`). DEViLBOX also has planners with no demo counterpart: the shorter arc features (`planArc`), the juggle response, transition scratches. "Demo wins everywhere" would delete or replace them. Keep, or replace with the demo's modes?
3. **J3 / J6 assets.** The demo's juggle uses `Data/Music/amen_break_175.wav` and hip-hop records rendered by its `hiphop.py`. Neither is in DEViLBOX, and their provenance is not documented (gap doc O5).
4. **T6 cartridge.** The demo defines `cartridge_response` but never calls it in a render. DEViLBOX's voice path filters every stroke through it. Under "demo wins", the port keeps the function and applies it nowhere, as the demo does. Confirm.

## Phases

Every phase ends with one reachability test that goes through the product entry point (`getAutoDJ()` or `fireDjFx(..., {source})`), proves the new code ran with a sentinel count, and asserts the pass numbers. Phases from the gap doc section 4 keep their names. PG-J and PG-K are new.

- **PG-J One stroke renderer (new; do it first).**
  - Work: G12. Every Auto Scratch stroke on a crate record goes through `renderGesture` on a demo-chain bus (overlay, the overlay's routines, juggle response, transition, pads, MCP). This means:
    - each overlay section uses its profile's deck physics (P7, P10) and physics seed `seed*3 + bar*16 + step`;
    - human timing is -10..+15 ms from `LFSR(seed*999 + 5)` (P11);
    - `apply_fx` runs with the profile FX on the section sum (X2);
    - routine bars are rendered with `render_routine(channel=False)`, its boom-bap deck and the final event's 1-step tape delay (C2);
    - a gesture's own FX applies per stroke (X3);
    - C3's stored versions go through the Deck C chain with a variable low-pass;
    - tracker samples are read at 22,050 Hz the same way.
  - Then retire the voice path for strokes. This closes T1, T13, T16 (no repair in a render), F1, F3, F7, G2-G6, G7 (default velocity 1.0), G8, V1-V3 and R7.
  - Reachability: `getAutoDJ()` Auto Scratch MUSICAL on an overlay window (no 32-bar feature), golden_era, section hook, routine 'auto'.
  - Pass:
    - sentinel `scratchRenderStats.gestures` = crate strokes fired, and `scratchPoolStats.performs` = 0 for crate records;
    - the overlay bus nulls `render_scratch_section('golden_era', 'hook', 8, 92, 22050, seed, allowed_sources=record_set('clean'), routine='auto')` at <= -120 dB after one fitted gain (new fixture script);
    - a `phrase_end` routine alone nulls `render_routine(..., channel=False)` at <= -120 dB, including the tape-delay tail.
- **PG-K Model and fader options (new).**
  - Work, all as exact ports:
    - T6 `cartridge_response` + `_lp`, applied nowhere (owner question 4);
    - T8 the `GRIP_STATES` constant;
    - T10 needle skip in `simulate` (`skip`, `alpha_r_prev` > 8, 6 ms, 0.02 x rate jump);
    - F5 `fader_curve` with `cut_in` and the hamster flip;
    - F6 `fader_from_pattern` contact bounce, lag and left-deck assignment, plus `FADER_ASSIGN`.
  - Each option is exposed in D2 so that it moves the output (the knob rule).
  - Reachability: `fireDjFx('fx_scratch_baby', {source: 'mcp', render: ...})` with a gesture spec carrying `skip 1`, `contact_bounce 0.3`, `lag_ms 2`, `deck 'left'`, `hamster true`.
  - Pass: `simulate(skip=1, seed 0..3)` and `fader_from_pattern(...)` replay Python fixtures within 1e-9; `cartridge_response(worn_stylus)` within 1e-12; sentinel count 1 per option.
- **PG-E Composition remainder.**
  - Work: G11 macro parser + `render_macro`; R8 bulk record selector logic; R12 `_routine_cues` slots; C16 statement-and-chop; P12 catalogue levels = demo `GESTURE_LEVELS`; P13 (after owner question 2).
  - Reachability: SCR-PG-ER as written (`getAutoDJ()`, battle, 32-bar PEAK), plus `fireDjFx('fx_scratch_macro', {text: 'ANCHOR 440\nMOVE_FWD 1 2\nMOVE_REV 1 2\nCUT 4 2', source: 'mcp'})`.
  - Pass:
    - ER numbers: the trace starts with needle_drop and ends with needle_lift; bars 4, 5 and 7 are equal; HOME >= 40 %; >= 2 silent bars; `planArc('scratchDj')` count 1;
    - the macro output = Python `render_macro` within -200 dB;
    - `record_set(sel)` lists = Python for every selector choice;
    - a one-phrase crate makes `build_scratch_events(phrase_emphasis=True)` events = Python for 3 seeds;
    - sentinels count 1.
- **PG-F Deck C in the mix.**
  - Work: X6 (after owner question 1); X7 duck (`lp(|juggle|, 40)`, depth 0.25); X8 juggle-bus small_room 0.06, mix 0.72 x juggle + duck x Deck C, peak cap 0.98; C15 juggle only while Deck C is silent (needs J10 from PG-I for the demo's A/B layer).
  - Reachability: Auto DJ with a juggle running plus Auto Scratch.
  - Pass: the scratch bus gain dips 0.25 +- 0.03 on kick transients; the long-run scratch RMS / deck RMS = 0.60 +- 0.05; no juggle event while Deck C is in a feature; the three-deck mix nulls `three_deck.render` (synth breaks) at <= -100 dB once PG-I is in.
- **PG-G Source analysis.**
  - Work: R3 (`analyze`, `_cue_points`, `_flux_onsets`, `split_words`, `load_bank` classification) and R5 (`_voiced_anchor`, `_cue`, `_detect_onsets`, `load_wav_cues`).
  - Reachability and pass: as in the gap doc (TRACKER_SAMPLE anchor within 10 ms of `_cue_points`; `analyzeRecord` count 1), plus `load_bank` metadata regenerated in TS = the committed JSON for all 51 records.
- **PG-H Visuals and UI.**
  - Work:
    - D1: Auto Scratch strokes drive deck C's platter, crossfader and slip lanes from the same physics. `renderGesture` must also return `slipVel`. Between strokes deck C spins forward at nominal speed, as in `three_deck.py:401-447, 470`;
    - D2: parameter exposure, including the R8 selector and per-record checkboxes, the grit switch, and the PG-K options;
    - D3: upfaders; D4: tonearms; D5: the A/B platters' juggle motion; D6: the energy, beat and juggle-level streams.
  - Reachability: `getAutoDJ()` Auto Scratch PERFORMER at a 32-bar PEAK (three-deck routine) and an overlay window after PG-J.
  - Pass: at each 50 Hz tick the deck C view's platter angle = cumsum of the stroke's `recordVel` (nominal 1.0 between strokes) within 1e-6 revolution at 33 1/3 rpm; the fader lane = the stroke's `fade`; the slip lane = `slip_vel`; the view's position-consumer subscription count is 1 with >= 1 update per tick during a stroke.
- **PG-I Juggle grammar and synthesized sources.**
  - Work: J1-J10 and R6.
  - Reachability: `getAutoDJ()` with a juggle-ready break on decks A and B and the three-deck feature.
  - Pass:
    - `render_juggle(pattern)` for each of the 8 patterns = Python within -150 dB on a synth break (`make_break` fixture);
    - `plan_resets`, `classify_break` and `validate` / `repair` = Python on 5 break variants;
    - the 5 named routines' event lists = Python;
    - `build_sources` (7 synthesized records) = Python within -120 dB;
    - sentinels count 1.

Rows per phase (open only): PG-J 0 (closed 2026-10-12), PG-K 5, PG-E 3 (P13, P12, G11 closed 2026-10-13), PG-F 3, PG-G 2, PG-H 6, PG-I 11. Total 30.

## Rows

Status: yes = DEViLBOX matches the demo exactly (evidence given); partial / no = open. Paths are `src/engine/dj/scratch/` unless given. "Render path" and "voice path" are as defined above.

| ID | Phase | Demo item | Status | Evidence (current main) | Result |
|---|---|---|---|---|---|
| T1 | PG-J | Two-body model drives every gesture `simulate` :102-184 via `render_gesture` scratch.py:291-296 | yes | Render path: `scratchRender.ts:262-275`. Voice path: `scratchPhysics.ts:99-109` (1 kHz decimation, always repaired). | PORTED 7b6a338f3: every stroke reaches the render path: scratchNullsTheDemo (strokes < -200 dB; overlay section -152 dB through planner+pool+bus; registry entry points = the demo stroke on their chain) + autoDJScratchReachesTheDecks (render sentinel = strokes fired); revert M13 (overlay spec dropped) and M16 (pad off its chain) fail |
| T2 | - | Motor PI servo (kp, ki, integrator clamp +-2, torque clamp) :145-149 | yes | `src/engine/turntable/turntableSim.ts:237-240`; `turntableSim.test.ts:31` (3 Python `simulate` fixtures within 1e-3). | yes (phase 0) |
| T3 | - | 5 deck profiles :35-46 | yes | `turntableSim.ts:20-26` verbatim. | yes (phase 0) |
| T4 | - | 6 slipmat profiles, tanh(slip/0.03) friction + viscous + stick-slip :49-56, :151-156 | yes | `turntableSim.ts:28-35, 242-244`. | yes (phase 0) |
| T5 | - | 6 record-inertia profiles :59-66 | yes | `turntableSim.ts:37-44`. | yes (phase 0) |
| T6 | PG-K | 4 cartridges + `cartridge_response` / `_lp` :69-74, :402-418 | partial | The table is at `turntableSim.ts:46-51`. `cartridge_response` is not ported as a function. The voice path filters every stroke (`ScratchRecordVoice.ts:275-278`), which the demo never does (owner question 4). | open |
| T7 | - | 6 performer hands as a spring-damper, torque clamp 1.6 x strength :77-84, :158-161 | yes | `turntableSim.ts:53-60, 226, 246-247`. | yes (phase 0) |
| T8 | PG-K | Grip states + per-point grip :99, :124 | partial | Per-point grip interpolation: `turntableSim.ts:211-212, 246`. The `GRIP_STATES` constant (defined and never read by the demo) is absent. | open |
| T9 | - | Warp 0.4 / eccentricity 0.3 at 0.55 Hz, 5 Hz ripple, motor noise, stick-slip | yes | `turntableSim.ts:215-221, 231-233, 243`; warp and eccentricity passed at `scratchRender.ts:269` and `scratchPhysics.ts:102`. | yes (phase 0) |
| T10 | PG-K | Quartz lock, groove drag, needle skip :137-139, :164-175 | partial | Quartz and groove drag: `turntableSim.ts:228-229, 249`. Needle skip (`skip`, `skip_left`, `alpha_r_prev`) is absent (`TtSimOptions` :169-176). | open |
| T13 | PG-J | Surface noise at the record angle, level = surface x velocity | yes | Render path: `scratchRender.ts:119-134, 276`. Voice path: the worklet bed. | PORTED 7b6a338f3: every stroke reaches the render path: scratchNullsTheDemo (strokes < -200 dB; overlay section -152 dB through planner+pool+bus; registry entry points = the demo stroke on their chain) + autoDJScratchReachesTheDecks (render sentinel = strokes fired); revert M13 (overlay spec dropped) and M16 (pad off its chain) fail |
| T14 | - | Needle drop 120 ms / lift 40 ms; they bookend the routines | yes | `turntableSim.ts:317-341`; played on the Deck C bus with the routine seed (`scratchVoicePool.ts:238-239`, `scratchDemoRoutines.ts:285`). | yes (phase 0) |
| T16 | PG-J | Motion validation + auto-repair :424-451 | yes | Functions verbatim at `turntableSim.ts:274-297`. The demo never calls them in a render; the voice path repairs every stroke (`scratchPhysics.ts:102`). | PORTED 7b6a338f3: every stroke reaches the render path: scratchNullsTheDemo (strokes < -200 dB; overlay section -152 dB through planner+pool+bus; registry entry points = the demo stroke on their chain) + autoDJScratchReachesTheDecks (render sentinel = strokes fired); revert M13 (overlay spec dropped) and M16 (pad off its chain) fail; the render never repairs (the voice path that repaired is deleted) |
| F1 | PG-J | Transfer curves 2/6/12; the envelope is shaped by the curve | yes | Render path: `scratchRender.ts:186-188`. Voice path: worklet `faderCurveShape` (`scratchFaderModel.ts:94`), no null test. | PORTED 7b6a338f3: every stroke reaches the render path: scratchNullsTheDemo (strokes < -200 dB; overlay section -152 dB through planner+pool+bus; registry entry points = the demo stroke on their chain) + autoDJScratchReachesTheDecks (render sentinel = strokes fired); revert M13 (overlay spec dropped) and M16 (pad off its chain) fail |
| F3 | PG-J | Ramp = 1 + 2(1 - v) ms | yes | Render path: `scratchRender.ts:279-280`. Voice path: worklet `cutRampSec`. | PORTED 7b6a338f3: every stroke reaches the render path: scratchNullsTheDemo (strokes < -200 dB; overlay section -152 dB through planner+pool+bus; registry entry points = the demo stroke on their chain) + autoDJScratchReachesTheDecks (render sentinel = strokes fired); revert M13 (overlay spec dropped) and M16 (pad off its chain) fail |
| F5 | PG-K | Hamster inversion :253-260, :278-296 | partial | Window inversion: `scratchRender.ts:164-173`. `faderCurve` lacks the hamster flip (`scratchFaderModel.ts:84-86`). | open |
| F6 | PG-K | Contact bounce, mechanical lag, left/right deck :271-314; `FADER_ASSIGN` three_deck.py:72 | no | Absent ("no contact bounce, no lag, right deck", `scratchRender.ts:158`). | open |
| F7 | PG-J | Named cut patterns | yes | Render path: `cutPattern` at `scratchRender.ts:139-156` verbatim. Voice path: catalogue windows. | PORTED 7b6a338f3: every stroke reaches the render path: scratchNullsTheDemo (strokes < -200 dB; overlay section -152 dB through planner+pool+bus; registry entry points = the demo stroke on their chain) + autoDJScratchReachesTheDecks (render sentinel = strokes fired); revert M13 (overlay spec dropped) and M16 (pad off its chain) fail |
| G2 | PG-J | `cut` gesture | yes | Render path: `scratchRender.ts:55`. Voice path otherwise. | PORTED 7b6a338f3: every stroke reaches the render path: scratchNullsTheDemo (strokes < -200 dB; overlay section -152 dB through planner+pool+bus; registry entry points = the demo stroke on their chain) + autoDJScratchReachesTheDecks (render sentinel = strokes fired); revert M13 (overlay spec dropped) and M16 (pad off its chain) fail |
| G3 | PG-J | `echo` + its own fx | yes | Render path: `scratchRender.ts:58, 207-216`. Voice path: `setGestureFx` on the bus. | PORTED 7b6a338f3: every stroke reaches the render path: scratchNullsTheDemo (strokes < -200 dB; overlay section -152 dB through planner+pool+bus; registry entry points = the demo stroke on their chain) + autoDJScratchReachesTheDecks (render sentinel = strokes fired); revert M13 (overlay spec dropped) and M16 (pad off its chain) fail |
| G4 | PG-J | `brake` / `spinup` as gestures | yes | Render path: `deckMotion` at `scratchRender.ts:193-205, 236-241`. Voice path: a 33-point curve (`scratchPhysics.ts:85-88`). | PORTED 7b6a338f3: every stroke reaches the render path: scratchNullsTheDemo (strokes < -200 dB; overlay section -152 dB through planner+pool+bus; registry entry points = the demo stroke on their chain) + autoDJScratchReachesTheDecks (render sentinel = strokes fired); revert M13 (overlay spec dropped) and M16 (pad off its chain) fail |
| G5 | PG-J | Accelerating glide 0 -> 0.32d -> 1.35d | yes | Render path: `scratchRender.ts:262-265`. Voice path: `scratchPhysics.ts:52-65` (an optional speed profile differs). | PORTED 7b6a338f3: every stroke reaches the render path: scratchNullsTheDemo (strokes < -200 dB; overlay section -152 dB through planner+pool+bus; registry entry points = the demo stroke on their chain) + autoDJScratchReachesTheDecks (render sentinel = strokes fired); revert M13 (overlay spec dropped) and M16 (pad off its chain) fail |
| G6 | PG-J | Hydroplane glide 0.7, grip 0.6, 12 cuts | yes | Render path: `scratchRender.ts:57`. Voice path: catalogue. | PORTED 7b6a338f3: every stroke reaches the render path: scratchNullsTheDemo (strokes < -200 dB; overlay section -152 dB through planner+pool+bus; registry entry points = the demo stroke on their chain) + autoDJScratchReachesTheDecks (render sentinel = strokes fired); revert M13 (overlay spec dropped) and M16 (pad off its chain) fail |
| G7 | PG-J | amp = 0.55 + 0.70v | yes | Same formula on both paths (`scratchRender.ts:243`, `scratchPhysics.ts:38-41`), but the voice path defaults to velocity 0.7 where the demo defaults to 1.0. | PORTED 7b6a338f3: pool default velocity 1.0 (scratchNullsTheDemo MCP case, no amount); revert M8 (0.7) fails |
| G8 | PG-J | The hand path is the only driver | yes | Render path: yes. Voice path: repaired and decimated. | PORTED 7b6a338f3: every stroke reaches the render path: scratchNullsTheDemo (strokes < -200 dB; overlay section -152 dB through planner+pool+bus; registry entry points = the demo stroke on their chain) + autoDJScratchReachesTheDecks (render sentinel = strokes fired); revert M13 (overlay spec dropped) and M16 (pad off its chain) fail |
| G9 | - | `_GESTURE_STEPS` | yes | `scratchRender.ts:66-70`; catalogue `durationSteps` = demo for all 23 (`scratchGestureCatalog.ts:147-419`). | yes (phase 0) |
| G11 | PG-E | Macro language `parse_macro` / `render_macro` :915-992 | yes | `scratchRender.parseMacro` / `renderMacro` (Python int / float token rules, skipped lines listed, the transform CUT, the battle deck, offline physics); `ScratchVoicePool.performMacro` plays it as a one-off Deck C stroke; registry `fx_scratch_macro` (`macro` option). | PORTED (G11 commit): scratchMacroIsTheDemos (5 scripts: parse = Python, render within -200 dB of `render_macro`), scratchNullsTheDemo 'a scratch macro (MCP)' (fireDjFx -> pool -> bus = the macro on its chain, sentinels 1); reverts (Python float underscores, CUT ignored, action not reaching the pool) fail |
| G12 | PG-J | NEW: every stroke is `render_gesture` (scratch.py :809-877 overlay, scratch_routine.py :292-319, scratch_dj.py :264-298, three_deck.py :351-462 all render through it) | yes | Only the two 32-bar routines (`scratchVoicePool.ts:264-268`). | PORTED 7b6a338f3: every stroke reaches the render path: scratchNullsTheDemo (strokes < -200 dB; overlay section -152 dB through planner+pool+bus; registry entry points = the demo stroke on their chain) + autoDJScratchReachesTheDecks (render sentinel = strokes fired); revert M13 (overlay spec dropped) and M16 (pad off its chain) fail; record voice + ring record mode deleted (3ef4c16ec) |
| V1 | PG-J | Level 0.70 + 0.50v | yes | Render path: `scratchRender.ts:281-283` (null includes v .30 / .93). Voice path: bus stage. | PORTED 7b6a338f3: every stroke reaches the render path: scratchNullsTheDemo (strokes < -200 dB; overlay section -152 dB through planner+pool+bus; registry entry points = the demo stroke on their chain) + autoDJScratchReachesTheDecks (render sentinel = strokes fired); revert M13 (overlay spec dropped) and M16 (pad off its chain) fail |
| V2 | PG-J | v < 0.5: low-pass 2500 + 6000v | yes | Render path: `scratchRender.ts:284`. Voice path: centroid deviation (PG-DR). | PORTED 7b6a338f3: every stroke reaches the render path: scratchNullsTheDemo (strokes < -200 dB; overlay section -152 dB through planner+pool+bus; registry entry points = the demo stroke on their chain) + autoDJScratchReachesTheDecks (render sentinel = strokes fired); revert M13 (overlay spec dropped) and M16 (pad off its chain) fail |
| V3 | PG-J | v > 0.85: + 0.15 x high-pass at 3 kHz | yes | Render path: `scratchRender.ts:285-288`. Voice path: bus stage. | PORTED 7b6a338f3: every stroke reaches the render path: scratchNullsTheDemo (strokes < -200 dB; overlay section -152 dB through planner+pool+bus; registry entry points = the demo stroke on their chain) + autoDJScratchReachesTheDecks (render sentinel = strokes fired); revert M13 (overlay spec dropped) and M16 (pad off its chain) fail |
| R2 | - | Record AH_LONG | yes | The demo's `load_bank` run 2026-10-12: 51 records, AH_LONG `aaaaah.wav` AH_VOWEL, vowel 440, safe 27-14467 = `scratch_bank_metadata.json:2592`; entry 51 at `scratchCatalogue.ts:190`. | yes (phase 0) |
| R3 | PG-G | Runtime bank analyzer (scratch_bank.py :115-312) | no | grep `analyze|cuePoints|fluxOnsets|splitWords`: none. | open |
| R5 | PG-G | Auto-cue a user phrase WAV (scratch_routine.py :55-159) | no | Absent. | open |
| R6 | PG-I | 7 synthesized sources + `_anchor_safe` + sp1200 grit (scratch.py :67-121), `build_cue_sources` / `_synth_cues` | no | Absent. | open |
| R7 | PG-J | S950 grit + 22,050 Hz mono read at load | yes | Render path: `scratchGrit.ts:31-120` (`demoRecordPcm`, `scratchGrit.test.ts` within 1e-6), `scratchVoicePool.ts:205-216`. Voice path: `gritRecord` on browser-decoded audio (`scratchVoicePool.ts:179`). | PORTED 7b6a338f3: crate records demoRecordPcm; tracker samples demoRecordPcm / demoMonoPcm at 22,050 Hz, no grit (scratchNullsTheDemo tracker case); revert M9 (grit on) fails |
| R8 | PG-E | Records bulk selector + per-record checkboxes (scratch.py :461-603) | partial | Only `record_set('clean')` = `CLEAN_CRATE_POOL` (`scratchCatalogue.ts:199`). The UI part is under D2. | open |
| R9 | - | Role pools HOME / SECONDARY / ACCENT / FX -> 12 categories | yes | `scratchCatalogue.ts:205-222`; records per event = Python (`scratchPhrasingParity.test.ts:112`). | yes (phase 0) |
| R12 | PG-E | NEW: `_routine_cues` (scratch.py :787-806): with a record set, slot i = the i-th sorted allowed record, else the synthesized word cues | partial | Overlay routine events take the section's record (`scratchPlanner.ts:232`); `SLOT_SOURCE` is the `bank_cues` mapping (`scratchRoutines.ts:28-36`). | open: the record-set branch is ported in 7b6a338f3 (`routineSlotRecord`; overlay null + scratchPhrasingParity; revert M4 fails); the synthesized word-cue branch waits for R6 (PG-I) |
| P6 | - | `STYLE_TO_PROFILE` 19 subgenres | yes | `scratchStyles.ts:117-122` = scratch.py :394-401; wired at `scratchStyles.ts:230`. | yes (phase 0) |
| P7 | PG-J | 9 `PROFILES` (gestures, sources, FX, deck physics, scale) | yes | Gestures and scale: `scratchStyles.ts:98-108`. Deck physics only for 5 (`scratchRender.ts:82-88`, `scratchPhysics.ts:23-29`); missing east_coast, lofi, trap, memphis, battle. FX per palette, not per profile. Sources are R6. | PORTED 7b6a338f3: all nine PROFILES decks in DEMO_DECK_PROFILES, FX per profile in DEMO_PROFILES (scratchNullsTheDemo nine-profile null < -200 dB; overlay null); revert M7 (lofi performer) fails |
| P10 | PG-J | NEW: overlay render chain: the section profile's deck, physics seed seed*3 + bar*16 + step, `apply_fx(profile fx)` on the section sum (scratch.py :823-877) | yes | Planning = Python (`scratchPhrasingParity.test.ts:80`). Sound: voice path. | PORTED 7b6a338f3: overlay spec: profile deck, seed*3 + bar*16 + step, per-section apply_fx chain, input cut at section end (scratchNullsTheDemo overlay -152 dB); reverts M1 M3 M13 fail |
| P11 | PG-J | NEW: overlay human timing -10..+15 ms, `LFSR(seed*999 + 5)` (scratch.py :837, :872) | yes | DEViLBOX uses `humanizeAll` [-8, +10], beat-safe (`scratchPlacement.ts:360`, `scratchPlanner.ts:279`). Reopens P5 under "demo wins". | PORTED 7b6a338f3: human timing per demo slot from LFSR(seed*999+5), in bus samples (scratchNullsTheDemo overlay; autoScratchLandsOnTheGrid range check); revert M2 fails |
| P12 | PG-E | NEW: gesture levels = demo `GESTURE_LEVELS` (scratch_dj.py :45-50) everywhere | yes | `GESTURE_LEVELS` (`scratchGestureCatalog.ts`) = the demo's for its 16 gestures: tearForward 3, transformer8 2, scribble 4 (`difficulty` reads it: mode caps on the extras, arcs, hands in use). | PORTED d531d6acc: gestureCatalog.test 'the catalogue levels are the demo GESTURE_LEVELS' (DJ_ROUTINE_LEVELS = the demo table, every catalogue level = it); revert (the old table) fails |
| P13 | PG-E | NEW: the demo overlay has no live adaptations | yes | `planScratch` plans the demo's `render_scratch_section` plan whole (profile gestures, the section's density on the profile ladder, both step-15 strokes, overlapping strokes, the routine unmodified) as `layer: 'demo'`; DEViLBOX's extras (mode/genre caps, escalation, vocal rule, after-call answer, one hand, short features, juggle response, juggleSafe, the governor's musical rules, the evaluation's rest) apply to `layer: 'extra'` strokes only. | PORTED e00109395 (see P13 progress): scratchPhrasingParity (every demo event in every mode, vocal .95, confidence .2), scratchNullsTheDemo dense overlay (two step-15 strokes summed, MUSICAL under a vocal, -151 dB), autoScratchKeepsTheDemoUnderTheVocal (governor + rest), autoDJScratchTenMinuteSet (MUSICAL = the demo); reverts R2-R10 fail |
| C2 | PG-J | Final routine event: 1-step tape delay fb .18 mix .16 damp .5 | yes | The overlay's routines play on the voice path; no per-event echo. | PORTED 7b6a338f3: render_routine(channel=False): boom-bap deck, seed + bar*16 + step, ending tape delay (scratchNullsTheDemo routine alone < -200 dB); revert M5 fails |
| C3 | PG-J | Stored versions Dry / Dark / Delay / PhraseEnd (scratch_channel presets) | yes | `CHANNEL_PRESETS` exist as live bus presets; not the `scratch_channel` chain (fixed lp 5000 in `scratchDeckC.ts:16`). | PORTED 7b6a338f3: render_versions as bus chains routineDry/Dark/Delay/PhraseEnd with variable lp; transition presets play them (scratchNullsTheDemo four versions < -120 dB after one gain, transition entry cases); revert M6 fails |
| C5 | - | scratch_dj 32-bar arc | yes | `scratchDemoRoutines.ts:65-141`; played at `DJScratchDJ.ts:387-397`; `scratchPhrasingParity.test.ts:102` (5 styles x 3 seeds). | yes (phase 0) |
| C6 | - | A-A-B-A hook | yes | `scratchDemoRoutines.ts:91-106`; same test. | yes (phase 0) |
| C7 | - | Varied phrase endings | yes | `scratchDemoRoutines.ts:77, 130-134`; same test. | yes (phase 0) |
| C8 | - | needle_drop opens and needle_lift closes a routine | yes | `scratchDemoRoutines.ts:90, 138, 203, 231`; rendered at `scratchVoicePool.ts:238-239`. | yes (phase 0) |
| C9 | - | Routine validation | yes | `validateScratchDjRoutine` at `scratchDemoRoutines.ts:144-156` = scratch_dj.py :304-330; same test. | yes (phase 0) |
| C10 | - | Three-deck arc + energy | yes | `scratchDemoRoutines.ts:163-175, 198-239`; `scratchPhrasingParity.test.ts:112`. | yes (phase 0) |
| C12 | - | Three-deck energetic ladder (no flare1) | yes | `scratchDemoRoutines.ts:177-182`. | yes (phase 0) |
| C13 | - | Flow builder, rest x (1.3 - 0.6e) | yes | `scratchDemoRoutines.ts:184-185, 210-228`. | yes (phase 0) |
| C14 | - | Word rotation, cue cycle of 8 | yes | `scratchDemoRoutines.ts:189, 212-214, 232-238`. | yes (phase 0) |
| C15 | PG-F | Two-hands alternation: juggle only while Deck C is silent (three_deck.py :155-186) | partial | Separate controllers (`DJScratchDJ.ts:367` blocks a feature while juggling); the demo's A/B layer is J10. | open |
| C16 | PG-E | NEW: statement and chop: `phrase_emphasis` + `drop_phrase` (three_deck.py :247-320, :377-387), `cues_with_word_emphasis` (scratch_dj.py :206-245), `word_source` on a one-phrase crate | no | `buildThreeDeckRoutine` has no `phrase_emphasis` branch (`scratchDemoRoutines.ts:198-239`). | open |
| X2 | PG-J | Per-style FX presets through `apply_fx` | yes | `SCRATCH_FX_PROFILES` as live bus stages (drive = gain before tanh(2.5x)), not `apply_fx` on the section. | PORTED 7b6a338f3: apply_fx(profile FX) on each overlay section's sum in the worklet (scratchNullsTheDemo overlay); reverts M1 (hp) M15 (drive) fail |
| X3 | PG-J | Per-gesture `fx` | yes | Render path: `scratchRender.ts:289`. Voice path: `setGestureFx`. | PORTED 7b6a338f3: every stroke reaches the render path: scratchNullsTheDemo (strokes < -200 dB; overlay section -152 dB through planner+pool+bus; registry entry points = the demo stroke on their chain) + autoDJScratchReachesTheDecks (render sentinel = strokes fired); revert M13 (overlay spec dropped) and M16 (pad off its chain) fail |
| X4 | - | Three-deck wet bus room .42, delay .28, dark_room tail .22 | yes | `scratchDeckC.ts:23`; `scratch-deck-c.worklet.js:148-156, 204-210`; null < -130 dB (`scratchNullsTheDemo.test.ts:52-63`). | yes (phase 0) |
| X5 | - | Deck C EQ high-pass 200, presence .2 at 1-3 kHz, 4-pole low-pass 6 kHz | yes | `scratchDeckC.ts:15, 37`; same null test. | yes (phase 0) |
| X6 | PG-F | Level match 0.60 x the juggle-bus RMS | yes | 1ed8ce5d8: a planned routine is shaped ahead - `deckCLevel` = 0.60 x rms(the routine deck's own audio over its 32 bars) / rms(the planned layer, rendered offline through the same worklet) (`scratchVoicePool.shapeRoutine`, `scratchDeckC.ts`); level within 1e-6 of the demo (scratchNullsTheDemo); A/B shaped layer -70.9 dB with no gain fit (research/2026-10-12_scratch-null-test.md). Missing vs the X6 decision: deck B not summed in; a module deck (no buffer) falls back to the follower (layer mean square since its first stroke, 1 s glide). | PORTED 7b6a338f3: live: Deck C buses hear decks A + B (mixer inputA + inputB) on their input, level 0.60 x rms(A+B)/rms(layer); planned: routineShapeDecks reads both playing decks weighted by the crossfader, null (module deck) -> live input (scratchLevelHearsDecksAAndB); reverts M10 (input ignored) M11 (B dropped) fail |
| X7 | PG-F | Duck on juggle transients: 40 Hz envelope, depth .25 | partial | 1ed8ce5d8: `deckCDuck` (lp(abs(beat), 40) / max, depth 0.25) on the Deck C bus from the routine's first bus sample, sent when the routine is planned; duck < -130 dB vs the demo (scratchNullsTheDemo). Same beat source gap as X6. | open |
| X8 | PG-F | NEW: juggle bus + small_room 0.06; mix 0.72 x juggle + duck x Deck C; peak cap 0.98 (three_deck.py :375, :455-462, :606) | no | Absent. | open |
| J1 | PG-I | Break grammar, 8 patterns + `JUGGLE_ROLES`, `MG_VEL`, `SR_VEL`, `_alt` (beat_juggle.py :287-374) | no | grep `machineGun|snareRoll|kickStutter`: none. | open |
| J2 | PG-I | Reset planner: `rewind_time`, `plan_resets`, `MAX_REWIND_SPEED` 3 (:230, :275-280, :380-404) | no | grep `rewind`: no model. | open |
| J3 | PG-I | 5 `BREAK_VARIANTS` + `make_break`, the amen (`REAL_BREAKS`), hip-hop records (`make_hiphop_record`, `THREE_DECK_RECORDS`, `build_hiphop_records`) | no | Absent. Owner question 3. | open |
| J4 | PG-I | Juggle macros (beat_juggle.py :538-570) | no | Absent. | open |
| J5 | PG-I | `classify_break` (> 0.6 JUGGLE_READY, > 0.35 LIMITED) | no | Absent. | open |
| J6 | PG-I | NEW: break loading and fitting `_decode_wav`, `_detect_cues`, `load_break`, `_fit_one_bar`, `fit_break`, `_grid_cues` (:103-187) | no | Absent. | open |
| J7 | PG-I | NEW: hit renderer + tiling: `RENDER_TUNE` (catch 3 ms 0.8 -> 1, attack 2 ms, release 3 ms, gain .95), linear looped read, tight tiling capped at a bar, `_lfsr16` +-1 ms (:235-272, :410-470) | no | Absent. | open |
| J8 | PG-I | NEW: named juggle routines `routine_kick_double`, `routine_technical`, `routine_machine_gun`, `routine_snare_roll`, `routine_events_16` (:476-532) | no | Absent. | open |
| J9 | PG-I | NEW: juggle `validate` / `repair` (:576-609) + three_deck `validate_budget` / `validate` (:567-588) | no | Absent. | open |
| J10 | PG-I | NEW: the three-deck A/B layer: `JUGGLE_PATTERN_BY_LEVEL`, `JUGGLE_ROTATION`, `JUGGLE_JL_MIN` 3, play + fade swapping A/B every 2-bar phrase, `SECTION_BREAK`, `SECTION_DECK_PAIR` (three_deck.py :46-47, :110-235) | no | Absent (DEViLBOX juggling is transition trading, `autodj/juggle/jugglePatterns.ts`). | open |
| D1 | PG-H | Deck C platter / crossfader / slip lanes from the same physics, plus deck_active and gesture_id (dj_viz.py :48-212, :273-318, :364-421; three_deck.py :401-447, :470) | no | `renderGesture` returns `recordVel` and `fade`, but the pool keeps only `.out` (`scratchVoicePool.ts:246-248`); no slip track; no view reads it (grep `onPosition` in `src/components`: none). | open |
| D2 | PG-H | Full parameter exposure (scratch.py :1002-1192, three_deck / beat_juggle `param_schema`) | partial | The P9 panel is not built. | open |
| D3 | PG-H | NEW: upfaders A/B/C (`UPFADER_REST` 30, `UPFADER_SLEW` 20, `_upfaders_from_juggle`, `_upfader_c_from_active`) | no | Absent. | open |
| D4 | PG-H | NEW: tonearms, C on cue grooves (`CUE_GROOVE` 40/100/160/215, `TONEARM_SLEW` 28), A/B creep | no | Absent. | open |
| D5 | PG-H | NEW: A/B platters during juggle bursts: push 2.0, rewind -1.6 for half the hit, skipped while the Deck C fader > 0.3 (three_deck.py :477-498) | no | Absent. | open |
| D6 | PG-H | NEW: streams energy, beat_env_a/b, juggle_level, scratch_intensity (dj_viz.py :302-361) | no | Absent. | open |

## Inventory map (every counted demo item -> row)

Rows that were already yes in the gap doc are cited by ID (T11, T12, T15, F2, F4, F8, F9, G1, G10, V4, R1, R4, R10, R11, P1-P5, P8, P9, C1, C4, C11, X1).

- **turntable.py.**
  - DECKS T3; SLIPMATS T4; RECORDS T5; CARTRIDGES, cartridge_response, _lp T6; PERFORMERS T7; GRIP_STATES T8.
  - NOMINAL, simulate T1/T2/T9/T10; _control_rate T1 (tiers; the gap doc counts them n/a; ported at `turntableSim.ts:75`).
  - render_from_motion T11 (the loop / linear tier is J7).
  - FADER_CURVES, fader_curve F1/F5; fader_from_pattern F1/F2/F5/F6; cut_pattern F7.
  - deck_motion T15/G4; surface_noise T13; needle_drop, needle_lift T14; validate_motion, repair_params T16.
- **scratch.py.**
  - _norm, _resample R7; _anchor_safe, build_sources, _SOURCE_NAMES R6.
  - A, GESTURES G1-G6; _GESTURE_STEPS G9; VEL V1-V3/G7; PLAN_VEL V4; _viz_resize D1; render_gesture G8/G12.
  - apply_fx, _FX_BOOMBAP/_ELECTRO/_LOFI/_MEMPHIS/_WEST X2/X3; _deck, PROFILES P7; STYLE_TO_PROFILE P6.
  - DENSITY_RATE, DEFAULT_SECTION, SECTION_DENSITY, _SECTION_ENERGY, _STEPS, _PHRASE_END_BARS, _lfsr, section_density P1/P2; plan_phrase P2; pick_gesture P3; gesture_activity, vocabulary G10; validate_phrase, repair_phrase P4.
  - _BANK_CACHE, bank_index, bank_filenames, bank_sources, all_source_names, record_set, record_set_choices, resolve_sources R8; pick_source R10.
  - SECTION_ROUTINE, _ROUTINE_STYLE, routine_for P9; _routine_cues R12; render_scratch_section P10/P11.
  - parse_macro, render_macro G11; _sub_groups, sub_params, param_schema, _build_cli, main D2.
- **scratch_routine.py.**
  - _resample, _voiced_anchor, _cue, _detect_onsets, load_wav_cues R5; bank_cues R11; build_cue_sources R6.
  - scratch_channel X4 (the chain, `scratch-deck-c.worklet.js`); ROUTINES C1; render_routine C2/G12; render_versions C3; validate_routine C4.
- **scratch_dj.py.**
  - GESTURE_LEVELS P8/P12; STYLE_PALETTE P8; _lfsr V4; _pick_gesture, ARC, build_routine C5-C8.
  - cues_from_bank, _ROLE_CATEGORIES, cue_pools_from_bank R9; cues_with_word_emphasis C16; cues_from_wav R5; _synth_cues R6.
  - render C5/G12 (render path, exact); validate C9.
- **scratch_bank.py.**
  - CATEGORY_RECS, FILENAME_MAP, cue_source, write_metadata R1/R2.
  - _read_wav R7; _frames, analyze, _cue_points, _base, _flux_onsets, split_words R3; load_bank R1/R3/R7; word_source R4/C16.
- **three_deck.py.**
  - JUGGLE_PATTERN_BY_LEVEL, JUGGLE_ROTATION, JUGGLE_JL_MIN, _perf_events, _section_juggles, build_juggle_events, _section_juggle_events, build_juggle_bus, SECTION_BREAK, SECTION_DECK_PAIR J10; _ROOT, REAL_BREAKS, THREE_DECK_RECORDS, build_hiphop_records J3.
  - SCRATCH_GESTURE_BY_LEVEL C12; DEFAULT_BUDGET, SHOWCASE_BUDGET, scratch_permission C11; FADER_ASSIGN F6; ARC_3DECK, ARC_ENERGY, _lfsr C10; build_scratch_events C10/C13/C14/C16; REST_PROB_BY_ROLE, REST_PROB_DEFAULT C13.
  - deck_c_eq, DECK_C_EQ_HP/LP/PRESENCE X5; DECK_C_LEVEL_SCALE X6; DUCK_DEPTH X7; JUGGLE_REVERB_MIX X8.
  - _deck_active_sections D1; render X4-X8/D1/D5; scratch_cues_from_bank, scratch_pools_from_bank, deck_c_cues R9; scratch_cues_synth R6.
  - validate_budget, validate J9; param_schema, render_from_params D2.
- **beat_juggle.py.**
  - BREAK_VARIANTS, make_break, make_hiphop_record J3; _decode_wav, _detect_cues, load_break, _fit_one_bar, fit_break, _grid_cues J6; classify_break J5.
  - DECK_A, DECK_B, MAX_REWIND_SPEED, rewind_time, plan_resets J2; RENDER_TUNE, render_hit, render_juggle J7.
  - JUGGLE_ROLES, MG_VEL, SR_VEL, _alt, pat_original, pat_double_kick, pat_kick_stutter, pat_snare_repeat, pat_reorder, pat_half_bar, pat_machine_gun, pat_snare_roll, PATTERNS J1.
  - routine_kick_double, routine_technical, routine_machine_gun, routine_snare_roll, routine_events_16 J8; render_macro J4; validate, repair J9; param_schema, render_from_params D2.
- **dj_viz.py.**
  - FPS, PLATTER_RPM, SLIP_REF, _GESTURE_ORDER, GESTURE_IDS, _GESTURE_STEPS, STREAM_NAMES, schema, _tick_sample_index, _sample_at_ticks, _angle_to_bytes, _fader_to_bytes, _position_to_bytes, _step_samples, _sample_to_tick, _slew, _ease, _smooth, CROSSFADER_EASE, CROSSFADER_SLEW, _gesture_id_stream, _deck_active_stream, quantize, emit_json D1.
  - UPFADER_REST, UPFADER_SLEW, _upfaders_from_juggle, _upfader_c_from_active D3; CUE_GROOVE, TONEARM_SLEW, _tonearm_c_from_cues D4; _intensity_stream, _energy_stream, _beat_env_stream D6.
- **Imported symbols.**
  - synth_dsp lp/hp/bp/delay/reverb/distort and sampler reverb short_plate/dark_room: X4 / G12 (`refDsp.ts:63-299`, exact in the null test); sampler reverb small_room X8.
  - sampler process s950 and synth_dsp resample_rate: R7; sampler sp1200, synth_dsp osc/noise, synth_dsp distort 'rat', drummachine snare909, vocalstab render_voice: R6.
  - drummachine kick808/snare808/hat and synth_dsp tape_sat: J3; hiphop render_track/STYLES: J3; device_juggle_bus _lfsr16: J7.
