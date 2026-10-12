---
date: 2026-10-12
topic: Scratch DJ - port of the Up Rough demo scratch engine, state after PG-D (stop point by owner decision)
tags: [dj, scratch, turntable, port, handoff]
status: final
---

# Scratch port after PG-D

Ledger: `thoughts/shared/plans/2026-10-11-scratch-dj-progress.md` (section "Port of the Up Rough Demo System scratch engine", owner decisions O1-O7 are final). Gap analysis: `thoughts/shared/research/2026-10-12_demo-scratch-engine-port-gap.md`. Demo source: `/Users/spot/Code/Up_Rough_Demo_System/tools` (Python with scipy: `/opt/homebrew/bin/python3.11 -I`). All commits below are on `main`, NOT pushed (the main session pushes).

## Done (with the tests that prove each phase)

| Phase | Commits | Proving tests |
|---|---|---|
| P7 close-out (P7.11 hands budget both ways, P7.12 session memory scratch counts, juggleResponse, R8 via getAutoDJ) | 489e14724, e7053efb2, 8a5df11d4, 313a989a8, 3c1540724 | `autodj/__tests__/performanceBudget.test.ts`, `autodj/__tests__/sessionMemoryScratch.test.ts`, `__tests__/autoScratchWithJuggle.test.ts`, `__tests__/autoDJTransitionScratchThroughTheAutoDJ.test.ts`, `__tests__/autoDJScratchReachesTheDecks.test.ts` (R7) |
| PG-A data parity (AH_LONG, fader curve, cut patterns, cut / echo / brake / spin-up, style FX) | 9f29d1ec6, 7997806fd, 907f22039, 30f468995, 7f137f3e0 | `scratch/__tests__/scratchCatalogueFiles.test.ts`, `scratch/__tests__/scratchFaderCurveShapesTheCut.test.ts`, `scratch/__tests__/gestureCatalog.test.ts`, `__tests__/scratchEchoAndStyleFxReachTheBus.test.ts` (AR) |
| Baby beep fix (owner LOCAL) | 6d60e7a7a | `scratch/__tests__/babyScratchIsNotABeep.test.ts` |
| SPINBACK-REWIND-LIVE-FAIL (deck spinback / rewind on the model) | 76ab6f6d4 | `__tests__/djSpinbackIsHeardBackward.test.ts` (push tier), `__tests__/djSpinbackPadSpinsTheDeckBack.test.tsx`, `__tests__/djRewindPadReplaysTheTune.test.tsx` |
| PG-B physics (turntable model port, simulateGesture, hand drives by default) | ecad9f439, 4399572b1, 7566e5ee2, 7d7a20229 | `engine/turntable/__tests__/turntableSim.test.ts` (Python fixtures within 1e-3, MT19937 bit-exact), R7 simulation count |
| PG-B2 one motion path (deck patterns through the model, keyframes deleted, reference lengths) | 83e3d29bd, 075aaaf3e | `__tests__/scratchOneMotionPath.test.ts`, `__tests__/scratchPlannedStrokeStartsOnItsBeat.test.ts` |
| PG-C vinyl surface (surface bed, cartridge, needle drop / lift, routine bookends) | 248b8e470, 205e44a4c, 5ccf27300 | `scratch/__tests__/scratchSurfaceNoiseFollowsTheRecord.test.ts`, `__tests__/autoScratchPerformsTheArc.test.ts` (bookends), `__tests__/scratchRecordVoiceReachesTheBus.test.ts` |
| PG-D velocity level / tone, S950 grit, routine presets | 833a81b50 | `scratch/__tests__/scratchGrit.test.ts` (Python fixture within 1e-6), `__tests__/scratchVelocityShapesTheStroke.test.ts` (DR), `scratch/__tests__/scratchWetBusMatchesTheReference.test.ts`, `__tests__/scratchSitsInTheMix.test.ts` |

## Open, per remaining phase (one fresh agent per phase)

- **PG-E** (C5 scratch_dj arc + C10 three-deck arc as templates; C6 A-A-B-A hook; C7 varied endings - can place `brake` / `spinup` flourishes, which are excluded from style vocabularies on purpose; C9 routine validator; C12 energetic ladder (O6); C13 flow builder; C14 word rotation; P6/P7 19 subgenres + 4 missing profiles; G11 / J4 macro parsers; R8 bulk selector). `pickRoutineGesture` + `DJ_ROUTINE_LEVELS` (scratch_dj ladder) already exist in `scratchRoutines.ts`. Reachability SCR-PG-ER in the ledger.
- **PG-F** (X4 feature wetness, X5 Deck C EQ, X6 RMS level match 0.60 - reconcile with `scratchLevel.ts` strokeRms / dry-path model now at -2.1 dB vs -0.55; X7 duck depth 0.25; C15 two-hands alternation - see `three_deck.py` :155-186, juggle only while the scratch is out).
- **PG-G** (R3 analyser Worker port: `scratch_bank.analyze`, `_cue_points`, `_flux_onsets`, `split_words`; R5 auto-cue for user WAVs; R9 role pools).
- **PG-H** (D1 voice position -> platter view / fader / slip lanes; D2 the P9 panel exposure - also the S950 grit switch `pool.setGrit` needs its UI there).
- **PG-I** (J1-J3, J5 break-level juggle grammar merged into the existing juggle engine, the amen break; R6 the 7 synthesized sources; PG-IR to be defined).
- Non-port SCR items still open: P8 (2, 3, 4, 7, R9, TC), P9 (2-8, R10, TC), P10 (1-5, R11, TC, owner checks O1-O4). Count 98 of 125.

## Gotchas learned (read before editing)

- **`.gitignore` line 119 `Turntable/`** matches `src/engine/turntable/` on macOS (case-insensitive): new files there need `git add -f`. `TurntablePhysics.ts` was force-added long ago.
- **Never probe live engine internals over MCP `evaluate_script` with a bare `import('/src/...')`**: after HMR the app's live module is at a `?t=<stamp>` URL; a bare import makes a SECOND engine instance, and calling `disposeDJEngine()` on that copy reset the owner's DJ state (deck A unloaded, 2026-10-12). If a probe is unavoidable, find the stamped URL via `performance.getEntriesByType('resource')` and only READ.
- **Shared index**: other agents keep staged files (`git status` shows `M ` in the first column). Commit by path (`git commit <paths>` = `--only`), never `git add -A`. Wait for `.git/index.lock` to clear before committing.
- **Revert checks in files another agent is editing**: a `cp` backup + restore once clobbered a concurrent edit window in `DJAutoDJ.ts`. Revert-check only files you own, or use a vi.mock-based revert.
- **Offline render tests with Tone**: Tone's context wrapper does not see an OfflineAudioContext advance while it is suspended (reads 0): define `currentTime` on `Tone.getContext()` from the raw context (see `djSpinbackIsHeardBackward.test.ts`). Fake the deck's own `setTimeout` on the render clock.
- **A WaveShaper curve can be set once** (node-web-audio-api throws on reassignment): the bus drive is a gain before a fixed `tanh(2.5 x)`.
- **The record ring reads frames at the context rate**: any transformed record (the S950 grit at 22,050 Hz) must be rendered back to `ctx.sampleRate` before `loadRecord`, or it plays fast and off its anchors.
- Golden fixtures: `SCRATCH_GOLDEN_UPDATE=1 VITEST_MAX_WORKERS=2 npx vitest run src/engine/dj/scratch/__tests__/scratchGolden.test.ts` after any catalogue / planner change.
- Python fixtures: `tools/scratch-fixtures/gen_turntable_sim_fixture.py`, `gen_s950_fixture.py` (run with `/opt/homebrew/bin/python3.11 -I <script> /Users/spot/Code/Up_Rough_Demo_System/tools <out.json>`).

## Owner LOCAL checks pending (http://localhost:5174, reload the page first)

- Baby / Chirp / Transformer / Flare / Drag pads on a deck and on a sample record: hand-like moves at the demo lengths, no beep.
- Spinback pad: about 0.6 s heard backward, then the record plays on; Rewind pad: a shaped pull, normal pitch after the restart.
- Auto Scratch Performer at a peak: needle-drop click opens the feature and a lift closes it; crackle only while the record moves; Lo-Fi darker.
- Auto Scratch, style Electro vs Boom Bap: Electro brighter with a longer echo. Records now carry the S950 grit (darker, 12-bit).
