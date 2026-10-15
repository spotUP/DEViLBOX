---
date: 2026-10-12
topic: Up Rough Demo System scratch engine vs DEViLBOX Auto Scratch - complete port gap analysis
tags: [scratch, dj, turntable, physics, crossfader, port, gap-analysis, reference]
status: final
---

# Demo-system scratch engine: what DEViLBOX has, what it lacks, and how to port the rest

Owner requirement 2026-10-12: "we need everything from the demo system scratch engine, it's pretty advanced, a lot of work went into it."

- Source: `/Users/spot/Code/Up_Rough_Demo_System/tools/` (abbreviated `UR/`).
- Target: `src/engine/dj/scratch/**`, `src/engine/dj/DJScratchEngine.ts`, `src/engine/turntable/TurntablePhysics.ts`, `public/worklets/scratch-buffer.worklet.js`, `src/engine/drumpad/DjFxActions.ts`, `src/engine/dj/autodj/{performanceBudget.ts,juggle/*}`.
- Not redone here: the wet chain, which is already in `thoughts/shared/research/2026-10-12_demo-system-scratch-wet-chain.md`. It is referenced as item X1.

## 0. Scope and method

**Demo files read in full:** `scratch.py` (1393 lines), `turntable.py` (463), `scratch_routine.py` (395), `scratch_dj.py` (359), `scratch_bank.py` (398), `three_deck.py` (lines 1-610 of 804; lines 610-804 are param_schema and the CLI), `beat_juggle.py` (lines 1-620 of 833; the rest is param_schema and the CLI).

**Demo files read in part:** the headers of `device_scratch_bus.py`, `device_crossfader.py`, `device_three_deck.py`, `device_turntable.py`, `sampler.py` PROFILES (lines 56-80), `hiphop.py` 2380-2405 (the scratch overlay mix), and `dj_viz.py` (outline only).

**Demo docs read:** `docs/audio-architecture.md` 70-112, `thoughts/shared/research/2026-07-30_scratch-family-wiring-audit.md`, `thoughts/shared/TODO_turntablist_audio.md` (it is about hip-hop genre tuning; nothing in it is scratch-engine specific).

**How the scratch-related files were found:** I ran `grep -rli 'scratch|turntabl|crab|chirp|flare|platter'` over the demo repo and filtered out vendored and venv files. Besides the tools listed above, it found: the `test_*` files, `device_session.py` (`device_bank_from_scratch_bank`), `device_sample_voice.py` (fixed-point voice), `hiphop.py` (scratch overlay), `dj_viz.py`, and the plan `thoughts/shared/plans/2026-07-17-turntablist-scratch-session-demo.md` (the demo's visual scene, which I did not read beyond its outline).

**The manuals are not in either repo.** The demo code cites them by section number. Only two are on disk, in `/Users/spot/Desktop/softsynth_plans/`: `scratches_crossfader_physics.txt` (1753 lines; headings only were read) and `Hip-Hop Scratch Placement Manual`. These were not found anywhere: the Scratch Routine Manual, the World-Class Scratch DJ Routine Manual, the Scratch Sample Bank Mapping manual, the Three-Turntable add-on and the Beat Juggling add-on. Two manual topics are in neither codebase: a "Fader state machine" (physics manual line 234) and an "Improved scratch event format" (line 255).

**What the counts are taken from:** dict literals parsed with Python `ast`, not grep hits. The demo tables have these sizes:

| Demo table | Count |
|---|---|
| `GESTURES` | 23 |
| `_GESTURE_STEPS` | 23 |
| `PROFILES` | 9 |
| `STYLE_TO_PROFILE` | 19 |
| `DENSITY_RATE` | 6 |
| `SECTION_DENSITY` | 15 |
| `SECTION_ROUTINE` | 12 |
| `DECKS` | 5 |
| `SLIPMATS` | 6 |
| `RECORDS` | 6 |
| `CARTRIDGES` | 4 |
| `PERFORMERS` | 6 |
| `GRIP_STATES` | 5 |
| `FADER_CURVES` | 3 |
| `ROUTINES` | 8 |
| `STYLE_PALETTE` | 5 |
| `GESTURE_LEVELS` | 4 |
| `_ROLE_CATEGORIES` | 4 |
| `CATEGORY_RECS` | 12 |
| `FILENAME_MAP` | 44 |
| `BREAK_VARIANTS` | 5 |
| `PATTERNS` (juggle) | 8 |

The DEViLBOX gesture count (27) comes from the `id:` entries in `scratchGestureCatalog.ts` lines 143-402.

**Answer to the ledger's "reference generator":** it is the demo system. Ledger D6 (line 41) ports the LFSR "from `tools/scratch.py`". P4.3 replays Python LFSR fixtures, and P4.5 replays `plan_phrase` fixtures produced by `tools/scratch-fixtures/gen_plan_phrase.py`. The owner plan section 3 lists the same seven demo modules.

**Already taken from the demo:**
- the 19 shared gesture ids with their hand paths and fader windows
- activity ranking
- the fader exponents and cut-in constants (defined but never applied, see F1)
- the density, section and step tables
- `plan_phrase`, `pick_gesture`, `PLAN_VEL` and the LFSR
- the 8 routines and `SECTION_ROUTINE`
- word slices and the throw
- `STYLE_PALETTE`, levels and `REST_PROB_BY_ROLE`
- the two-hands budget (6) and scratch permission
- the scratch-channel wet chain
- the 50-record metadata and crate, and the stroke unit 1500/22050 s

What was deliberately not taken, per the owner plan sections 1, 3 and 79: the turntable physics, the offline renderer and its numpy DSP.

## 1+2. Inventory, DEViLBOX status, evidence

Status values: **yes**, **partial** or **no**. "Better" says which side is stronger where both have the item. Items marked n/a are listed at the end and are not counted. Unless a path is given, DEViLBOX paths are under `src/engine/dj/scratch/`.

### T. Turntable physics (`UR/turntable.py`)

| ID | Demo item (file:line, key numbers) | DEViLBOX | Evidence / better |
|---|---|---|---|
| T1 | Two-body model driving every gesture. Platter (inertia Ip) and record (Ir) are coupled only through the slipmat. Audio speed = record velocity. `simulate` :102-184, called from `render_gesture` scratch.py:291-296 | partial | `src/engine/turntable/TurntablePhysics.ts:4-125` is a live two-body SL-1200 model (motor platter + record + slipmat), but it is used only by the manual platter views and `TrackerScratchController`. Auto Scratch and gesture playback never run through it: the record voice plays keyframe rate curves (`ScratchRecordVoice.ts:280-307`). Better: demo for gestures; DEViLBOX for live hand input. |
| T2 | Motor PI servo (kp, ki, integrator clamp ±2, torque clamp) :145-149 | partial | P gain only: `MOTOR_P_GAIN = 8.0` (TurntablePhysics.ts:56). |
| T3 | 5 deck profiles (Ip / kp / ki / max torque / bearing / overshoot / ripple). For example classic_sl1200: 1.0 / 9.0 / 2.5 / 0.6 / 0.02 / 0.02 / 0.004 :35-46 | partial | One deck with a mass knob `setMass` (:221). |
| T4 | 6 slipmat profiles (static / dyn / visc / stick). For example thin_battle: 0.20 / 0.09 / 0.03 / 0.02. Friction tanh(slip/0.03) plus viscous term plus stick-slip jitter :49-56, :151-156 | partial | One slipmat: kinetic 3.5, static 8.0, breakaway 0.15, release 14.0 (:75-90). No profiles, no stick-slip. |
| T5 | 6 record-inertia profiles (light_battle Ir 0.06 ... heavy_vinyl 0.14; 7"/10"/12" radius) :59-66 | partial | Mass only (:39-44). |
| T6 | 4 cartridges (stylus drag, surface level, bandwidth 6.5-10.5 kHz). `cartridge_response`: low-pass at bandwidth; worn and heavy styli add tanh(1.3x) and a darker top :69-74, :402-410 | no | Not found: grepped `cartridge|stylus` in `src/engine/dj` and `src/engine/turntable`. |
| T7 | 6 performer hands as a spring-damper (stiffness 35-110, damping 7-12, strength 0.7-1.2, radius). Hand torque clamp 1.6 x strength :77-84, :158-161 | no | DEViLBOX hand = velocity coupling `HAND_COUPLING = 80` (:64). No position spring, no profiles. |
| T8 | Grip states free / touch / grip / drag / release (0 / 0.35 / 1 / 0.6 / 0), with grip interpolated per control point :99, :124 | partial | `ScratchHandPath` carries `grip` (`scratchTypes.ts`, ledger P1.1). It is used only to smooth reversals (`scratchAnchor.ts:157`). |
| T9 | Wobble: warp 0.4 and eccentricity 0.3 at 0.55 Hz, motor ripple 5 Hz, motor/bearing noise, stick-slip jitter (scratch.py:294, turntable.py:126-128, :141-142, :154) | no | grep `warp|eccentric|wow|flutter|ripple` found nothing relevant. |
| T10 | Quartz lock (kp x 2.2, ki x 1.8), groove-dependent stylus drag, needle skip on over-acceleration :137-139, :164-168 | no | Not found. |
| T11 | Variable-speed read at record position, Catmull-Rom cubic, clamp to the safe region :190-242 | yes | Worklet cubic Hermite (`scratch-buffer.worklet.js:60-70`), clamp to `bounds` (:187). Equal. |
| T12 | Loop read mode (wrap instead of clamp) :208-226 | yes | `fx_scratch_loop` (`DjFxActions.ts:89`, ledger P2.9). |
| T13 | Surface noise read at the record angle: it stops when the record stops and reverses with it. Level = cartridge surface x velocity :365-375, scratch.py:297 | no | Not found. |
| T14 | Needle drop: 120 ms click + 90 Hz settle + surface onset. Needle lift: 40 ms click :384-399. They open and close every scratch_dj and three_deck routine | no | "Needle drop" in DEViLBOX means a seek (`scratchRecordRing.test.ts:63`). No transient sound. |
| T15 | Deck actions start / stop / brake / power-off as speed curves (brake strengths 6 / 3 / 1.5 / 0.8) :344-359 | yes | `TurntablePhysics.triggerSpinback/PowerCut/ElectronicBrake/MotorStart` (:299-355), `fx_vinyl_brake` (DjFxActions.ts:873), `fx_deck_brake` (:1371). Better: DEViLBOX (live physics). The planner gap is G4. |
| T16 | Motion validation and auto-repair. Flags: platter reversed (< -0.2), speed > 6, discontinuous acceleration > 3. Repairs: heavier record / felt slipmat / light touch :424-451 | no | Not found. |

### F. Crossfader (`UR/turntable.py` :250-338)

| ID | Demo item | DEViLBOX | Evidence / better |
|---|---|---|---|
| F1 | Transfer curves smooth / sharp / battle with exponents 2 / 6 / 12 and cut-in 0.03. The whole gain envelope is shaped by the curve (:253-260, :316) | partial | `FADER_CURVES` and `faderCurve()` are defined (`scratchFaderModel.ts:24`, `:82`) but have no caller anywhere in `src/` (grep). The cut gate is a linear ramp. **Dead code.** |
| F2 | Click-safe ramp at every window edge, 0.3-3 ms :304-306 | yes | `faderRampSec` (`scratchFaderModel.ts:75`), 3-8 ms. |
| F3 | Velocity sharpness: ramp = 1 + 2(1 - v) ms, so harder hits are sharper (scratch.py:299) | partial | DEViLBOX ramp gets longer as the stroke gets faster (3 → 8 ms at 4x, `scratchFaderModel.ts:75-78`). **This is the opposite direction to the demo.** |
| F4 | Cut offset (chirp / flare lead -2 ms) :275 | yes | `cutLeadMs: -2` (`scratchGestureCatalog.ts`, chirp entry at :182). |
| F5 | Hamster inversion of the gesture's windows :278-296 | no | `hamsterSwitch` exists only on the manual mixer crossfader (`src/stores/useDJStore.ts:317`). |
| F6 | Worn-fader contact bounce, mechanical lag, left/right deck assignment :271-314 | no | Not found. |
| F7 | Named cut patterns: open, click, double_click, triple_click, transform(n), flare1 [(0, .45), (.55, 1)], flare2 [(0, .3), (.37, .63), (.7, 1)], crab uneven edges [0, .12, .19, .34, .4, .58, .63, .8, .85, 1] :320-338 | partial | DEViLBOX uses even `cutGrid(n, duty)`: crab = 4 cuts at 28 %, transformer = 40 % (catalogue :205-257). Flare windows differ: flare1 = (0, .15) (.19, 1), and flare2 differs too. `threeClickFlare` exists. |
| F8 | Fader lane independent of the platter lane (physics s.29) | yes | `faderWindows` and `rateCurve` run separately inside the worklet (ledger P2.4). |
| F9 | Deck fader vs real crossfader | yes | `ScratchFaderWindow.curve` routing (ledger P1.5). Better: DEViLBOX (the demo has no such distinction). |

### G. Gesture catalogue (`UR/scratch.py` :130-202)

The demo has 23 gestures: baby, baby_slow, forward_stab, backward_stab, chirp, chirp_double, transformer4, transformer8, tear_fwd, tear_rev, flare1, flare2, orbit, scribble, drag, cut, crab, hydroplane, echo, brake, spinup, drop, drop_phrase. The base stroke is A = 1500 samples at 22,050 Hz (68 ms). Steps per gesture (`_GESTURE_STEPS` :193-202): baby 2, baby_slow 3, stabs 1, chirp 2, transformer8 4, orbit 3, drag 4, hydroplane 3, brake / spinup 4, drop 4, drop_phrase 16.

DEViLBOX has 27: 21 map to demo ids, plus twiddle, laser, phaser, tweak, vibrato, uzi, eightFingerCrab and threeClickFlare (`REFERENCE_GESTURE_IDS`, catalogue :473).

| ID | Demo item | DEViLBOX | Evidence / better |
|---|---|---|---|
| G1 | 19 core gestures with hand paths `[(t, A-multiple, grip)]` and fader windows | yes | Catalogue :143-402 (ledger P1.2). Better: DEViLBOX for breadth (27 gestures, full names, roles); the demo for physics-driven motion. |
| G2 | `cut`: peak 1.5A at 0.5 and back, open (0, .42) | partial | Folded into forwardStab (catalogue :475). |
| G3 | `echo`: a stab plus its own fx (delay mix .35, 0.16 s, reverb .05) :175-176 | partial | Folded into forwardStab. A tail exists only through bus ambience. |
| G4 | `brake` / `spinup` as plannable gestures :178-179 | no | Deck FX exist (T15); not gestures in the planner (catalogue comment :471). |
| G5 | Accelerating glide for transformer, crab and hydroplane: position 0 → 0.32d → 1.35d, so every cut lands on a new pitch. The code says a constant glide "read as flat beeps" :280-288 | no | `GLIDE_CURVE = [[0, 1.0]]` is constant (catalogue :141). |
| G6 | Hydroplane: glide 0.7, grip 0.6, 12 transform cuts :173 | no | DEViLBOX hydroplane is faderless flutter, owner-confirmed (ledger line 110). |
| G7 | Velocity scales stroke displacement: amp = 0.55 + 0.70v (:259, :290) | partial | `handSpeedFactor` scales rate 0.7-1.3 (`scratchHandSpeed.ts:14-30`, owner decision SA-m5). |
| G8 | The hand path is the only driver; physics fills in the motion | partial | Opt-in `drive: 'hand'` (`ScratchRecordVoice.ts:303-307`). The default is legacy velocity keyframes (ledger P3.2, line 171). |
| G9 | Gesture lengths `_GESTURE_STEPS` | partial | Different lengths, tuned by DEViLBOX (baby 4, chirp 1, drag 8, ledger SA-B2, line 206). |
| G10 | Activity ranking (windows + reversals) and vocabulary thinning :606-655 | yes | `rankByActivity`, `vocabulary` (catalogue :465, `scratchPlacement.ts:116`). |
| G11 | Macro language: ANCHOR / FADER_OPEN / FADER_CLOSE / MOVE_FWD spd ticks / MOVE_REV / CUT n ticks, error-tolerant parser :915-992. Beat-juggle macros live in beat_juggle.py:538-570 | no | grep `MOVE_FWD|macro` in `scratch/` found nothing. |

### V. Velocity and tone (`UR/scratch.py` :205-221, :303-307)

| ID | Demo item | DEViLBOX | Evidence |
|---|---|---|---|
| V1 | Output level = 0.70 + 0.50v | no | SA-m5 owner decision: "loudness stays on the fader" (`scratchHandSpeed.ts:5-8`). |
| V2 | v < 0.5 → low-pass at 2500 + 6000v Hz (darker soft strokes) | no | Not found. |
| V3 | v > 0.85 → add 0.15 x high-pass at 3 kHz ("sparkle") | no | Not found. |
| V4 | Plan velocity: base .55 + rand .40 + energy .10 :221 | yes | `PLAN_VEL` (`scratchPlacement.ts:88`). |

### R. Sources, records, word slices

| ID | Demo item | DEViLBOX | Evidence / better |
|---|---|---|---|
| R1 | 50-record metadata: 12 categories, attack / vowel / tail cues, safe / forward / reverse ranges, word slices, recommended gestures, roles and styles (`scratch_bank.py` :41-109, :315-362) | yes | `scratchCatalogue.ts` (50 records, ledger P2.1). Keys are identical to the demo JSON (checked by script). |
| R2 | Record AH_LONG (`aaaaah.wav`). `FILENAME_MAP` names it, and the live `load_bank` includes it (51 WAVs) | no | The demo's `scratch_bank_metadata.json` lacks it, so DEViLBOX does too. The file is in the pack, byte-identical (sha1) as `scratch_020.wav`, but is listed as "FX pack only" (ledger P2.3). |
| R3 | Runtime bank analyzer: voiced-vowel anchor (ZCR < 0.18, loudest frame), 6 % envelope safe region, spectral-flux onsets, word split by filename word count, pre-scratched classifier (pitch-flip rate > 22/s and onset rate > 6/s) (`scratch_bank.py` :188-312) | no | DEViLBOX reads the precomputed JSON. Tracker samples anchor at the attack only (`trackerSampleSource.ts`, ledger P5.6). |
| R4 | One word from a slice; statement-and-chop (throw the whole phrase, chop the last word) (`scratch_bank.py` :147-185, `scratch_dj.py` :206-245, `three_deck.py` :254-301) | yes | `wordPlan`, `WORD_SEQUENCE` (`scratchRoutines.ts:158`, `:175`), `withThrow` (ledger P4.11, P4.12). |
| R5 | Auto-cue a user phrase WAV (onset detector plus measured word windows, scaled to the take) (`scratch_routine.py` :91-159) | no | Not found. |
| R6 | 7 synthesized sources: vocal_ah, vocal_fresh and vocal_yeah (vocalstab formant voice), robot (band-pass, rat distortion, high-pass buzz), horn (3-saw brass + noise attack), snare909, noise stab (`scratch.py` :81-121) | no | Not found. Needs `vocalstab.py` and `drummachine.py` ports. |
| R7 | Sampler grit on every record at load: s950 = 12-bit, decimation 2, anti-alias 8 kHz, alias 0.12, drive 0.03, output low-pass 7.5 kHz, noise 0.002 (`sampler.py:56-80`, `scratch_bank.py:356`). Every source is also resampled to 22,050 Hz mono | no | DEViLBOX plays the clean 44.1 kHz pack WAVs. |
| R8 | Records bulk selector: style / all / synth / bank / clean / pre_scratched / cat:<category> / off, plus a per-record checkbox (`scratch.py` :542-586) | partial | `findRecords` filters by category and clean (ledger P2.2). The UI "Scratch Source" is open (P9.3). |
| R9 | Role pools HOME / SECONDARY / ACCENT / FX → 12 categories (`scratch_dj.py` :183-203) | partial | Arc phases carry HOME / ACCENT / SECONDARY / FX (`scratchArc.ts:44-70`). Selection is by score, not by category pool. |
| R10 | One source per section, rotating across sections (`scratch.py` :739-757) | yes | `ScratchSourceSelector` + memory + cooldowns (ledger P5.2, P6.6, P6.7). Better: DEViLBOX. |
| R11 | Routine cue slots ROCK / FUNKY / BEAT / IF / YOU / REALLY / PHRASE → bank records (`scratch_routine.py` :162-179) | yes | `SLOT_SOURCE` (`scratchRoutines.ts:25-36`). |

### P. Placement brain (`UR/scratch.py` :404-736)

| ID | Demo item | DEViLBOX | Evidence / better |
|---|---|---|---|
| P1 | 6 density states (0 / .09 / .18 / .4 / .7 / 1.4), 15 section defaults, ladder shift round((scale - .8) x 2.5) | yes | `scratchPlacement.ts:32-80`, matches the Python fixtures. |
| P2 | `plan_phrase`: steps [15, 16, 8, 7, 6, 0]; phrase-end bars 3/7/15; expected x3.0 at a phrase end, else x0.35 (showcase 2.2/3.0); at most 4 per bar; role by step | yes | `planPhrase` :259. Better: DEViLBOX (one-hand rule SA-B1). |
| P3 | `pick_gesture`: energy band, role shift (turnaround +1, answer +.5), no immediate repeat | yes | :154. |
| P4 | `validate_phrase` / `repair_phrase` :883-909 | yes | :319, :335. |
| P5 | Human timing. The demo uses three ranges: section -10..+15 ms (:872), DJ arc -8..+10 (`scratch_dj.py:289`), three-deck -4..+4 (`three_deck.py:425`) | yes | One range, [-8, +10] (`scratchPlacement.ts:350`). Better: DEViLBOX (beat-safe, no repeats). |
| P6 | `STYLE_TO_PROFILE`: 19 hip-hop subgenres → profile :394-401 | partial | Genre table (9 hints) → 5 palettes (`scratchStyles.ts:89-170`). |
| P7 | 9 `PROFILES`, each with a gesture pool, source pool, FX preset, deck/slipmat/performer/cartridge physics and a scale (old_school .6, boombap .8, east_coast .9, west_coast .45, electro 1.1, lofi .35, trap .3, memphis .6, battle 1.4) :353-391 | partial | 5 palettes, no physics per style (`scratchStyles.ts:49-69`). east_coast, west_coast, trap and memphis are missing. |
| P8 | `STYLE_PALETTE` (max level, density, bias, fx) + `GESTURE_LEVELS` 1-4 (`scratch_dj.py` :45-62) | yes | `SCRATCH_STYLES`, levels (ledger P1.6, P1.7). Level membership follows owner plan section 31, not the demo (e.g. tearForward L2 here, L3 in the demo). |
| P9 | `SECTION_ROUTINE` + style override (electro → electro_transformer, battle → chirp_flare_showcase) :766-784 | yes | `routineFor` (`scratchRoutines.ts:102-114`). |

### C. Routines and composition

| ID | Demo item | DEViLBOX | Evidence / better |
|---|---|---|---|
| C1 | 8 routines (`scratch_routine.py` :239-289) | yes | `SCRATCH_ROUTINES` (`scratchRoutines.ts:66`). |
| C2 | The final routine event gets a 1-step tape delay (fb .18, mix .16) :310-312 | partial | `ambienceFor` final = 1.0 scales the bus delay (ledger P2.7). It is not a per-event 1-step echo. |
| C3 | Stored versions RoutineDry / Dark / Delay / PhraseEnd: four channel presets, e.g. Dark = LP 3800, room .25, delay .06 :326-336 | no | Not found. |
| C4 | `validate_routine` :342-363 | yes | `validateRoutine` (:127). |
| C5 | scratch_dj 32-bar arc: intro 0-4 / theme 4-8 / variation 8-12 / call_response 12-16 / showcase 16-20 / breathing 20-24 / climax 24-30 / resolution 30-32, each with energy, level, role, density scale and silence flag (`scratch_dj.py` :91-100) | partial | DEViLBOX `FEATURE_ARC` / `UP_ROUGH_ARC` follow owner plan sections 29 and 74 (`scratchArc.ts:44-70`). The demo arc is not a template. |
| C6 | A-A-B-A hook (hookA = baby + stab; hookB = stab, back-stab, chirp) in the theme; the variation reuses the hook with chirps swapped in (:112-132) | no | grep `hookA|AABA|repeat` in `scratch/` found nothing. |
| C7 | Varied phrase endings cycle [baby, transformer8, backward_stab, forward_stab] on each section's last bar (:115, :154-157) | no | Not found. |
| C8 | needle_drop opens and needle_lift closes a routine (`scratch_dj.py` :110, :161; `three_deck.py` :262, :319) | no | Not found (see T14). |
| C9 | Routine validation: at least 2 silent bars, HOME at least 40 % of events, not every bar at the hardest level, an opening and a closing (`scratch_dj.py` :304-330) | partial | The arc test asserts at least 4 empty bars (ledger P6.3). HOME share and bookends are not checked. |
| C10 | Three-deck arc: 9 sections with juggle level vs scratch level and a Deck C role, plus energy curve .45-1.0 (`three_deck.py` :87-99) | partial | Juggling and scratching are separate controllers sharing `performanceBudget.ts`. There is no joint template. |
| C11 | Scratch permission = max(0, min(4, budget 6 - juggle level)) (:68, :75-78) | yes | `performanceBudget.ts:12-56`. |
| C12 | Three-deck energetic level ladder: L1 chirp / stab / cut; L2 chirp_double / transformer4 / tear; L3 tear / transformer8 / scribble; L4 flare2 / orbit / crab. **flare1 was removed by ear** ("du-du", :55-62) | no | DEViLBOX electro biases flare1 (`scratchStyles.ts:60`). |
| C13 | Flow builder: gestures tiled back-to-back to bar end; rest probability by role x (1.3 - 0.6 x energy) (:282, :304-318) | partial | `REST_PROB_BY_ROLE` exists (`scratchPlacement.ts:303`). No energy scaling or tiling builder found. |
| C14 | Word rotation: each 2-bar phrase throws a new word, then scratches that word; cue cycle of 8 (:266-301) | partial | Throw + memory/cooldowns (ledger P4.12, P6.7). No explicit rotation. |
| C15 | Two-hands alternation: juggle only while Deck C is silent (:155-186) | partial | Ledger P7.9 is open. |

### X. Mix and effects

| ID | Demo item | DEViLBOX | Evidence |
|---|---|---|---|
| X1 | Wet scratch channel. See the wet-chain doc. | yes | `scratchBus.ts:23-37`. |
| X2 | Per-style FX presets BOOMBAP / ELECTRO / LOFI / MEMPHIS / WEST (HP, LP, drive, delay, reverb) through `apply_fx` (`scratch.py` :321-345) | no | `fxAmount` and `fxScale` are declared (`scratchStyles.ts:44-68`, `:97-123`) and read nowhere (grep): **dead knobs.** |
| X3 | Per-gesture `fx` field (echo) :308-309 | no | Not found. |
| X4 | Three-deck wet bus: room .42, delay .28, plus an extra dark_room tail .22 (:441-445) | partial | Ambience max is .28 room / .14 delay (`scratchBus.ts:31-34`). |
| X5 | Deck C EQ: high-pass 200 Hz, 4-pole low-pass 6 kHz, presence .2 at 1-3 kHz (:326-332, :600-602) | partial | The bus has high-pass 160 Hz, low-pass 5 kHz, presence .22 at 1.5-3 kHz. |
| X6 | Level match: Deck C RMS = 0.60 x the juggle bus RMS (:450-452) | no | Not found. |
| X7 | Duck Deck C on juggle transients: 40 Hz envelope, depth .25 (:455-459) | no | Not found. |

### J. Beat juggle (`UR/beat_juggle.py`, part of the merged turntablist engine)

| ID | Demo item | DEViLBOX | Evidence |
|---|---|---|---|
| J1 | Break-level grammar, 8 patterns: original, double_kick, kick_stutter, snare_repeat, reorder, half_bar, machine_gun, snare_roll (:300-374) | partial | DEViLBOX juggling is transition-level trading (13 builders, `autodj/juggle/jugglePatterns.ts:105-450`) between two songs, a different paradigm. `double` and `doubleBeat` overlap. |
| J2 | Reset planner: rewind time = distance / (3x rate) + 20 ms; impossible rewinds are refused (:380-404) | partial, **unverified** | `RECUE_AFTER_CUT_BEATS = 1` (`jugglePatterns.ts:38`). No rewind-time model found by grep `rewind`. |
| J3 | 5 break variants plus a real amen (175 bpm fitted to 92), hip-hop records as juggle sources (:50-100, `three_deck.py` :103-126) | no | Not found. |
| J4 | Juggle macros DOUBLE_HIT / TRIPLE_HIT / REPEAT_HALF_BAR / REORDER_KICK_SNARE / STUTTER / RETURN_ORIGINAL (:538-570) | no | Not found. |
| J5 | `classify_break`: JUGGLE_READY above 0.6 (:211-221) | no | `classifyWindow` classifies material, not juggle readiness. |

### D. DJ render integration and visuals

| ID | Demo item | DEViLBOX | Evidence |
|---|---|---|---|
| D1 | `dj_viz` 50 fps streams: platter angles A/B/C, fader C, slip C, gesture id, deck-active mask, energy and beat envelope, all from the same physics (`dj_viz.py` :48-136, `three_deck.py` :401-521) | partial | `DeckVinylView.tsx` animates from the deck's physics for manual and deck-pattern scratching. Nothing consumes record-voice positions: grep for `onPosition` in `src/components` found nothing. Auto Scratch on records has no visual. |
| D2 | Full parameter exposure: about 60 overlay params, per-record checkboxes, modes section / juggle / three_deck / dj_routine / macro (`scratch.py` :1027-1192) | partial | The DJ view UI is ledger P9 (open). |

### Not counted (n/a)

- Control-rate tiers a500 / a1200 / offline (`turntable.py:89`).
- The Amiga fixed-point byte-parity oracles: `device_turntable`, `device_crossfader`, `device_sample_voice`, `device_three_deck`, `device_scratch_bus`, `device_juggle_bus`, `device_session`.
- The Paula audition filter.
- The hip-hop overlay mix gains (`hiphop.py:2389-2398`).

### Count (from the table rows above)

**89 items: 25 yes, 31 partial (one of them unverified, J2), 33 no.**

| Subsystem | yes | partial | no |
|---|---|---|---|
| T physics | 3 | 6 | 7 |
| F fader | 4 | 3 | 2 |
| G gestures | 2 | 5 | 4 |
| V velocity | 1 | 0 | 3 |
| R sources | 4 | 2 | 5 |
| P placement | 7 | 2 | 0 |
| C composition | 3 | 7 | 5 |
| X mix | 1 | 2 | 4 |
| J juggle | 0 | 2 | 3 |
| D render/UI | 0 | 2 | 0 |

**Where DEViLBOX is already stronger:** live analysis context, scored source selection, memory and cooldowns, phrase evaluation, safety governor, true re-cue, deck and tracker sources, the state machine, deck vs crossfader routing, live deck physics for the user's hand, and beat-safe humanize. None of these exist in the demo.

## 3. Port notes (offline numpy vs live Web Audio / worklet)

| Piece | How it ports | Why |
|---|---|---|
| T1-T10, G5, G8 physics | A pure TS `simulateGesture(handPath, durSec, profile, seed)` running the demo's integrator at 3 kHz control rate. It returns `record_vel`, which becomes rate points for the existing worklet `rateCurve` message (ledger P2.4). It runs at plan time on the main thread, inside the executor's 0.1 s lookahead (ledger P3.5). | Gestures are known before their beat. A 1-beat gesture is about 1500 Euler steps, which is microseconds of work. **No new worklet DSP.** This is gesture mathematics, not the offline renderer, so it fits the letter of plan section 79 but not its stated intent: an owner decision (O1). |
| T13 surface noise | Live, in the worklet: a seeded noise bed (rate x 1 s) indexed by the record's read position, mixed at cartridge level x velocity. | It has to follow the live read head (stop and reverse with it). It cannot be pre-baked into the record because a re-cue would replay it. |
| T14 needle drop / lift | Offline at init: two deterministic buffers (120 ms and 40 ms), played through the record voice or an AudioBufferSource on the scratch bus. | Static transients. |
| T6 cartridge | Live: a per-voice BiquadFilter low-pass at the cartridge bandwidth, plus a WaveShaper tanh(1.3x) for worn and heavy styli. | Static filters. |
| V1-V3, X2, X3, C3 | Live: a per-voice GainNode plus two biquads set per event from velocity, and the bus parameters set per style/routine from the 5 demo FX presets. Wire `fxAmount` / `fxScale` (dead today) to them. Echo and the Dry / Dark / Delay versions become `fxRequest` presets (ledger P7.8). | Reuses the scratch-bus stages. No new DSP framework (plan section 42). |
| R7 grit + 22.05 kHz | Offline at record load: a TS port of `sampler.process(s950)` run once per decoded record (Worker or main thread), cached next to the ring buffer. | One pass per record. Must stay a runtime transform: pre-baking into the pack WAVs would break the byte-identity check (PROVENANCE.md, ledger P0.4). |
| R3, R5 analyzer | Offline in a Worker at sample load: TS ports of `analyze`, `_cue_points`, `_flux_onsets`, `split_words` (FFT 1024 / hop 256). Output in `ScratchRecord` shape. | Gives tracker samples and user drops vowel anchors and word slices. The crate keeps its JSON. |
| R6 synth sources | Offline at init: needs ports of `vocalstab.render_voice` and `drummachine.snare909`. | Largest cost for the least gain, since the 50-record crate exists. Owner scope decision (O5). |
| G11, J4 macros | Pure parser → `ScratchEvent[]`. Executed by the existing executor. | No audio code. |
| C5-C9, C12-C14 | Pure data and planner code in `scratchArc.ts` / `scratchPlacement.ts`, following the existing template pattern. | Same layer as the ported placement. |
| X6, X7 Deck C mix | Live: an RMS follower sets the scratch bus `level`, and a duck driven by the deck bus envelope. **Reuse** the existing ducking/sidechain path (`dj_duck` / mixer sidechain), not a new compressor. | Mixer primitives exist. |
| F1, F3, F5-F7 | `faderCurve` applied to the window gain inside the worklet; ramp direction; hamster / bounce / lag as window transforms; demo cut patterns as data. | Data and model level. |
| J1-J3, J5 | A juggle-engine extension, not scratch code. The amen break is a sampled commercial record. | **Licensing question** (O5). The scratch crate is already cleared (ledger line 21). |

**Assets.** The 50 crate WAVs are committed and owner-cleared. `scratch_020.wav` (AH_LONG) is already in the pack: R2 needs only a metadata entry generated with the demo's `load_bank`. The amen break (`Data/Music/amen_break_175.wav`) and any hip-hop records rendered by the demo's `hiphop.py` are not in DEViLBOX, and their provenance is not documented.

**Conflicts with decisions already in the plan or ledger (owner decisions):**

- **O1. Physics port vs "do not port the offline physics".** Owner plan sections 1, 3 and 79 say do not port it; the ledger P3.2 hand drive is opt-in. "Everything" reverses this.
- **O2. What velocity controls.** SA-m5 (owner decision 2026-10-12): velocity = hand speed only, loudness stays on the fader. The demo maps velocity to stroke displacement, output level and tone (V1-V3, G7).
- **O3. Gesture timings and fader windows.** The DEViLBOX values were heard and confirmed by the owner. The demo values differ:
  - durations (SA-B2: baby 4 steps vs demo 2, drag 8 vs 4)
  - transformer 40 % and crab 28 % even duty vs demo crab uneven edges
  - flare1/flare2 windows
  - faderless hydroplane vs demo 12-cut glide
  - constant vs accelerating glide

  For each gesture, the owner picks which version plays, or the demo version ships as a variant.
- **O4. Records' sound.** The demo grit (s950, 22.05 kHz mono) vs the clean 44.1 kHz pack that DEViLBOX plays today.
- **O5. Scope.** Beat-juggle break grammar (J1-J5), the synthesized sources (R6), the amen and record licensing.
- **O6. Level ladder.** Owner plan section 31 levels (in use) vs the demo `GESTURE_LEVELS` vs the three-deck by-ear ladder that dropped flare1.
- **O7. Fader ramp direction (F3).** The demo gets sharper with velocity; DEViLBOX gets softer with stroke speed.

## 4. Proposed phase order

Each phase ends with one reachability test: it goes through the product's entry point (`fireDjFx(..., {source})` or `getAutoDJ()`), uses a sentinel, and checks the numbers.

1. **PG-A Data parity, no audio architecture change.**
   - Work: R2 (AH_LONG record), F1 (apply `faderCurve` in the worklet window gain), F7 (demo cut patterns as data, behind O3), G2/G3/G4 (cut, echo, brake/spinup as plannable gestures, the last two routed to the existing deck FX), X2/X3 (wire `fxAmount`/`fxScale` and the 5 FX presets plus per-gesture fx onto the bus).
   - Reachability: `fireDjFx('fx_scratch_echo', {record: 'AH_LONG', source: 'mcp'})` on the offline context.
   - Pass: sentinel `faderCurve` count ≥ 2; the worklet receives the record `AH_LONG` (catalogue entry 51); bus delay mix measured at 0.35 ± 0.02 and delay time 0.16 s ± 5 ms.

2. **PG-B Physics-driven gestures (after O1).**
   - Work: port T1-T10 tables and `simulate` as `simulateGesture` (pure); G5 accelerating glide; T8 grip; T16 validate/repair; make the hand drive the default (G8).
   - Reachability: `getAutoDJ().enable()` with Auto Scratch MUSICAL on the corpus.
   - Pass: sentinel `simulateGesture` count = executed record events; baby's rate curve matches a Python `simulate` fixture (classic_sl1200 / thin_battle / light_battle / tight_battle, seed 0) within 1e-3; platter velocity stays above 0 throughout (the demo self-check :454-462).

3. **PG-C Vinyl surface layer.**
   - Work: T13 surface noise in the worklet; T14 needle drop/lift buffers; T6 cartridge filters; C8 routine bookends.
   - Reachability: `fireDjFx('fx_scratch_baby', {record: 'AH_STANDARD'})` offline.
   - Pass: noise RMS > 0 while |rate| > 0.05, and 0 while the record is held at rate 0; the needle-drop transient leads the first event of a scratch_dj routine; sentinel count 1 each.

4. **PG-D Velocity and tone (after O2), plus record grit (after O4).**
   - Work: V1-V3 per-voice gain and biquads; R7 s950 transform at load; C3 Dry / Dark / Delay presets through `fxRequest`.
   - Reachability: two planned events at velocity 0.3 and 0.95 through the executor.
   - Pass: spectral centroid of the 0.3 stroke < 0.7 x that of the 0.95 stroke; level ratio (0.7 + 0.15) / (0.7 + 0.475) ± 0.5 dB; sentinel grit-transform count 1 per record load.

5. **PG-E Composition.**
   - Work: C5 scratch_dj arc and C10 three-deck arc as templates; C6 A-A-B-A hook; C7 varied endings; C9 routine validator; C12 energetic ladder (after O6); C13 flow builder with energy-scaled rests; C14 word rotation; P6/P7 (19 subgenres, the 4 missing profiles with their deck physics); G11 scratch macro and J4 juggle macro parsers; R8 bulk selector.
   - Reachability: `getAutoDJ()` with style battle on a 32-bar PEAK window.
   - Pass: the decision trace starts with needle_drop and ends with needle_lift; theme bars 4-7 repeat the A-A-B-A hook (bars 4, 5 and 7 have equal gesture sequences); HOME ≥ 40 % of events; ≥ 2 silent bars; sentinel `planArc('scratchDj')` count 1.

6. **PG-F Deck C in the mix.**
   - Work: X4 feature wetness (room .42 / delay .28 / dark tail .22), X5 Deck C EQ, X6 RMS level match 0.60, X7 duck depth .25, C15 two-hands alternation (with ledger P7.9).
   - Reachability: Auto DJ with a juggle active plus Auto Scratch.
   - Pass: the scratch bus gain dips by 0.25 ± 0.03 on kick transients; long-run scratch RMS / deck RMS = 0.60 ± 0.05; no juggle event while Deck C is in a feature.

7. **PG-G Source analysis.**
   - Work: R3 analyzer Worker port; R5 auto-cue for user WAVs; R9 role pools.
   - Reachability: load a tracker song on a deck; the planner picks TRACKER_SAMPLE.
   - Pass: the record's anchor = the voiced-vowel frame (not the attack) within 10 ms of the Python `_cue_points` on the same PCM; sentinel `analyzeRecord` count 1.

8. **PG-H Visuals and UI.**
   - Work: D1 (record-voice position → platter view, fader and slip lanes), D2 (exposure in the P9 panel).
   - Reachability: a DJ view render test.
   - Pass: the platter angle advances with the record voice's `position` reports during an Auto Scratch event; sentinel subscription count 1.

9. **PG-I (only after O5)** J1-J3, J5 break-level juggle grammar with the rewind planner; R6 synthesized sources.

## 5. Found while looking

- **`faderCurve` is dead.** It has no callers, so the battle response the ledger P1.4 claims is not applied anywhere.
- **`fxAmount` / `fxScale` are dead.** They are declared knobs with no effect. Reachability protocol: every knob must move the output or carry an exemption.
- **The ledger is stale.** Its count line is "78 of 125" and its last tick commit is `077e0bf98` (P6). Commits `4001b7cf6`, `5abefb839`, `ba342dbbe` and `209bee0ce` claim SCR-P7.1-P7.8, P7.11, P7.12, P7.R7 and P9.1, but the ledger still shows them open.
- **AH_LONG is missing from the demo's own metadata JSON** (50 of 51 WAVs), so the gap is inherited, not a DEViLBOX import error.
