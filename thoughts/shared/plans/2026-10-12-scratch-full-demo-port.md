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

Running count: 22 of 81 closed (phase 0 re-verification 2026-10-12, against main at 61ae1abcf; 59 open). The 22 are rows the gap doc had as open that current code already ports exactly, with a fixture test against the demo; their revert checks were not re-run in phase 0.

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

Rows per phase (open only): PG-J 25, PG-K 5, PG-E 6, PG-F 4, PG-G 2, PG-H 6, PG-I 11. Total 59.

## Rows

Status: yes = DEViLBOX matches the demo exactly (evidence given); partial / no = open. Paths are `src/engine/dj/scratch/` unless given. "Render path" and "voice path" are as defined above.

| ID | Phase | Demo item | Status | Evidence (current main) | Result |
|---|---|---|---|---|---|
| T1 | PG-J | Two-body model drives every gesture `simulate` :102-184 via `render_gesture` scratch.py:291-296 | partial | Render path: `scratchRender.ts:262-275`. Voice path: `scratchPhysics.ts:99-109` (1 kHz decimation, always repaired). | open |
| T2 | - | Motor PI servo (kp, ki, integrator clamp +-2, torque clamp) :145-149 | yes | `src/engine/turntable/turntableSim.ts:237-240`; `turntableSim.test.ts:31` (3 Python `simulate` fixtures within 1e-3). | yes (phase 0) |
| T3 | - | 5 deck profiles :35-46 | yes | `turntableSim.ts:20-26` verbatim. | yes (phase 0) |
| T4 | - | 6 slipmat profiles, tanh(slip/0.03) friction + viscous + stick-slip :49-56, :151-156 | yes | `turntableSim.ts:28-35, 242-244`. | yes (phase 0) |
| T5 | - | 6 record-inertia profiles :59-66 | yes | `turntableSim.ts:37-44`. | yes (phase 0) |
| T6 | PG-K | 4 cartridges + `cartridge_response` / `_lp` :69-74, :402-418 | partial | The table is at `turntableSim.ts:46-51`. `cartridge_response` is not ported as a function. The voice path filters every stroke (`ScratchRecordVoice.ts:275-278`), which the demo never does (owner question 4). | open |
| T7 | - | 6 performer hands as a spring-damper, torque clamp 1.6 x strength :77-84, :158-161 | yes | `turntableSim.ts:53-60, 226, 246-247`. | yes (phase 0) |
| T8 | PG-K | Grip states + per-point grip :99, :124 | partial | Per-point grip interpolation: `turntableSim.ts:211-212, 246`. The `GRIP_STATES` constant (defined and never read by the demo) is absent. | open |
| T9 | - | Warp 0.4 / eccentricity 0.3 at 0.55 Hz, 5 Hz ripple, motor noise, stick-slip | yes | `turntableSim.ts:215-221, 231-233, 243`; warp and eccentricity passed at `scratchRender.ts:269` and `scratchPhysics.ts:102`. | yes (phase 0) |
| T10 | PG-K | Quartz lock, groove drag, needle skip :137-139, :164-175 | partial | Quartz and groove drag: `turntableSim.ts:228-229, 249`. Needle skip (`skip`, `skip_left`, `alpha_r_prev`) is absent (`TtSimOptions` :169-176). | open |
| T13 | PG-J | Surface noise at the record angle, level = surface x velocity | partial | Render path: `scratchRender.ts:119-134, 276`. Voice path: the worklet bed. | open |
| T14 | - | Needle drop 120 ms / lift 40 ms; they bookend the routines | yes | `turntableSim.ts:317-341`; played on the Deck C bus with the routine seed (`scratchVoicePool.ts:238-239`, `scratchDemoRoutines.ts:285`). | yes (phase 0) |
| T16 | PG-J | Motion validation + auto-repair :424-451 | partial | Functions verbatim at `turntableSim.ts:274-297`. The demo never calls them in a render; the voice path repairs every stroke (`scratchPhysics.ts:102`). | open |
| F1 | PG-J | Transfer curves 2/6/12; the envelope is shaped by the curve | partial | Render path: `scratchRender.ts:186-188`. Voice path: worklet `faderCurveShape` (`scratchFaderModel.ts:94`), no null test. | open |
| F3 | PG-J | Ramp = 1 + 2(1 - v) ms | partial | Render path: `scratchRender.ts:279-280`. Voice path: worklet `cutRampSec`. | open |
| F5 | PG-K | Hamster inversion :253-260, :278-296 | partial | Window inversion: `scratchRender.ts:164-173`. `faderCurve` lacks the hamster flip (`scratchFaderModel.ts:84-86`). | open |
| F6 | PG-K | Contact bounce, mechanical lag, left/right deck :271-314; `FADER_ASSIGN` three_deck.py:72 | no | Absent ("no contact bounce, no lag, right deck", `scratchRender.ts:158`). | open |
| F7 | PG-J | Named cut patterns | partial | Render path: `cutPattern` at `scratchRender.ts:139-156` verbatim. Voice path: catalogue windows. | open |
| G2 | PG-J | `cut` gesture | partial | Render path: `scratchRender.ts:55`. Voice path otherwise. | open |
| G3 | PG-J | `echo` + its own fx | partial | Render path: `scratchRender.ts:58, 207-216`. Voice path: `setGestureFx` on the bus. | open |
| G4 | PG-J | `brake` / `spinup` as gestures | partial | Render path: `deckMotion` at `scratchRender.ts:193-205, 236-241`. Voice path: a 33-point curve (`scratchPhysics.ts:85-88`). | open |
| G5 | PG-J | Accelerating glide 0 -> 0.32d -> 1.35d | partial | Render path: `scratchRender.ts:262-265`. Voice path: `scratchPhysics.ts:52-65` (an optional speed profile differs). | open |
| G6 | PG-J | Hydroplane glide 0.7, grip 0.6, 12 cuts | partial | Render path: `scratchRender.ts:57`. Voice path: catalogue. | open |
| G7 | PG-J | amp = 0.55 + 0.70v | partial | Same formula on both paths (`scratchRender.ts:243`, `scratchPhysics.ts:38-41`), but the voice path defaults to velocity 0.7 where the demo defaults to 1.0. | open |
| G8 | PG-J | The hand path is the only driver | partial | Render path: yes. Voice path: repaired and decimated. | open |
| G9 | - | `_GESTURE_STEPS` | yes | `scratchRender.ts:66-70`; catalogue `durationSteps` = demo for all 23 (`scratchGestureCatalog.ts:147-419`). | yes (phase 0) |
| G11 | PG-E | Macro language `parse_macro` / `render_macro` :915-992 | no | grep `MOVE_FWD|parseMacro` in `src/`: none. | open |
| G12 | PG-J | NEW: every stroke is `render_gesture` (scratch.py :809-877 overlay, scratch_routine.py :292-319, scratch_dj.py :264-298, three_deck.py :351-462 all render through it) | partial | Only the two 32-bar routines (`scratchVoicePool.ts:264-268`). | open |
| V1 | PG-J | Level 0.70 + 0.50v | partial | Render path: `scratchRender.ts:281-283` (null includes v .30 / .93). Voice path: bus stage. | open |
| V2 | PG-J | v < 0.5: low-pass 2500 + 6000v | partial | Render path: `scratchRender.ts:284`. Voice path: centroid deviation (PG-DR). | open |
| V3 | PG-J | v > 0.85: + 0.15 x high-pass at 3 kHz | partial | Render path: `scratchRender.ts:285-288`. Voice path: bus stage. | open |
| R2 | - | Record AH_LONG | yes | The demo's `load_bank` run 2026-10-12: 51 records, AH_LONG `aaaaah.wav` AH_VOWEL, vowel 440, safe 27-14467 = `scratch_bank_metadata.json:2592`; entry 51 at `scratchCatalogue.ts:190`. | yes (phase 0) |
| R3 | PG-G | Runtime bank analyzer (scratch_bank.py :115-312) | no | grep `analyze|cuePoints|fluxOnsets|splitWords`: none. | open |
| R5 | PG-G | Auto-cue a user phrase WAV (scratch_routine.py :55-159) | no | Absent. | open |
| R6 | PG-I | 7 synthesized sources + `_anchor_safe` + sp1200 grit (scratch.py :67-121), `build_cue_sources` / `_synth_cues` | no | Absent. | open |
| R7 | PG-J | S950 grit + 22,050 Hz mono read at load | partial | Render path: `scratchGrit.ts:31-120` (`demoRecordPcm`, `scratchGrit.test.ts` within 1e-6), `scratchVoicePool.ts:205-216`. Voice path: `gritRecord` on browser-decoded audio (`scratchVoicePool.ts:179`). | open |
| R8 | PG-E | Records bulk selector + per-record checkboxes (scratch.py :461-603) | partial | Only `record_set('clean')` = `CLEAN_CRATE_POOL` (`scratchCatalogue.ts:199`). The UI part is under D2. | open |
| R9 | - | Role pools HOME / SECONDARY / ACCENT / FX -> 12 categories | yes | `scratchCatalogue.ts:205-222`; records per event = Python (`scratchPhrasingParity.test.ts:112`). | yes (phase 0) |
| R12 | PG-E | NEW: `_routine_cues` (scratch.py :787-806): with a record set, slot i = the i-th sorted allowed record, else the synthesized word cues | partial | Overlay routine events take the section's record (`scratchPlanner.ts:232`); `SLOT_SOURCE` is the `bank_cues` mapping (`scratchRoutines.ts:28-36`). | open |
| P6 | - | `STYLE_TO_PROFILE` 19 subgenres | yes | `scratchStyles.ts:117-122` = scratch.py :394-401; wired at `scratchStyles.ts:230`. | yes (phase 0) |
| P7 | PG-J | 9 `PROFILES` (gestures, sources, FX, deck physics, scale) | partial | Gestures and scale: `scratchStyles.ts:98-108`. Deck physics only for 5 (`scratchRender.ts:82-88`, `scratchPhysics.ts:23-29`); missing east_coast, lofi, trap, memphis, battle. FX per palette, not per profile. Sources are R6. | open |
| P10 | PG-J | NEW: overlay render chain: the section profile's deck, physics seed seed*3 + bar*16 + step, `apply_fx(profile fx)` on the section sum (scratch.py :823-877) | partial | Planning = Python (`scratchPhrasingParity.test.ts:80`). Sound: voice path. | open |
| P11 | PG-J | NEW: overlay human timing -10..+15 ms, `LFSR(seed*999 + 5)` (scratch.py :837, :872) | partial | DEViLBOX uses `humanizeAll` [-8, +10], beat-safe (`scratchPlacement.ts:360`, `scratchPlanner.ts:279`). Reopens P5 under "demo wins". | open |
| P12 | PG-E | NEW: gesture levels = demo `GESTURE_LEVELS` (scratch_dj.py :45-50) everywhere | partial | `DJ_ROUTINE_LEVELS` is exact (`scratchRoutines.ts:132-137`). Catalogue `GESTURE_LEVELS` differs: tearForward 2 (demo 3), transformer8 3 (demo 2), scribble 3 (demo 4) (`scratchGestureCatalog.ts:41-49`). | open |
| P13 | PG-E | NEW: the demo overlay has no live adaptations | partial | `scratchPlanner.ts:175-236`: vocal rate scaling, after-call answer, vocal thinning, mode caps, `routineInLevel`, one-hand. Owner question 2. | open (owner) |
| C2 | PG-J | Final routine event: 1-step tape delay fb .18 mix .16 damp .5 | partial | The overlay's routines play on the voice path; no per-event echo. | open |
| C3 | PG-J | Stored versions Dry / Dark / Delay / PhraseEnd (scratch_channel presets) | partial | `CHANNEL_PRESETS` exist as live bus presets; not the `scratch_channel` chain (fixed lp 5000 in `scratchDeckC.ts:16`). | open |
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
| X2 | PG-J | Per-style FX presets through `apply_fx` | partial | `SCRATCH_FX_PROFILES` as live bus stages (drive = gain before tanh(2.5x)), not `apply_fx` on the section. | open |
| X3 | PG-J | Per-gesture `fx` | partial | Render path: `scratchRender.ts:289`. Voice path: `setGestureFx`. | open |
| X4 | - | Three-deck wet bus room .42, delay .28, dark_room tail .22 | yes | `scratchDeckC.ts:23`; `scratch-deck-c.worklet.js:148-156, 204-210`; null < -130 dB (`scratchNullsTheDemo.test.ts:52-63`). | yes (phase 0) |
| X5 | - | Deck C EQ high-pass 200, presence .2 at 1-3 kHz, 4-pole low-pass 6 kHz | yes | `scratchDeckC.ts:15, 37`; same null test. | yes (phase 0) |
| X6 | PG-F | Level match 0.60 x the juggle-bus RMS | partial | Live 8 s follower on the programme (`scratch-deck-c.worklet.js:158, 212-215`). Owner question 1. | open (owner) |
| X7 | PG-F | Duck on juggle transients: 40 Hz envelope, depth .25 | no | There is no duck in the Deck C worklet or the pool. | open |
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
