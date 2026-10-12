---
date: 2026-10-12
topic: Scratch null test (oracle + render path) handoff, for PG-J and the later port phases
tags: [scratch, dj, null-test, handoff, demo-port]
status: final
---

# Scratch null test: handoff

## Task(s)

- SCR-NULL-TEST (owner: "make the demo and devilbox scratch 1:1"): build a stage-by-stage oracle from
  the demo's render, then port each stage until it nulls. **Done for the routine path** (the two 32-bar
  features, three_deck and scratch_dj). Not done for any other stroke path; that is PG-J in the ledger.
- SCR-THROW-DEMO: throws follow the demo. Done (0be248192).
- The MUSICAL ladder lift (owner decision): done (a86e6bd98).
- v3 A/B pair: on the Desktop.

## Critical references

- Ledger: thoughts/shared/plans/2026-10-12-scratch-full-demo-port.md (81 rows; X6/X7 updated by this
  work; nothing closed by it).
- Results and the per-stage table: thoughts/shared/research/2026-10-12_scratch-null-test.md.
- Demo: /Users/spot/Code/Up_Rough_Demo_System/tools. The files read are scratch.py `render_gesture`
  :234-315, turntable.py :102-445, synth_dsp.py :221-781, sampler.py :56-232,
  scratch_routine.py `scratch_channel` :211-232, three_deck.py `render` and :600-605,
  scratch_dj.py `render` :264-300, and scratch.py `render_scratch_section` :809-877 (PG-J's oracle).

## Code map (all committed)

- `src/engine/dj/scratch/refDsp.ts` holds synth_dsp's primitives, exact to the sample: butter (zpk),
  lfilter (TDF2), firwin + resamplePoly, comb, allpass, reverb, samplerReverb and tapeDelay.
- `src/engine/dj/scratch/scratchRender.ts` is `render_gesture` and its gesture table, step lengths, VEL
  and deck profiles. It also holds turntable.py's renderFromMotion, surfaceNoise, cutPattern,
  faderFromPattern and deckMotion, and the `demoGestureName` map.
- `src/engine/dj/scratch/scratchGrit.ts` has `demoRecordPcm(bytes)`, which reads a pack WAV the
  bank's way, and `s950` in float64.
- `public/worklets/scratch-deck-c.worklet.js` is the Deck C bus.
  - Its clock runs at 22,050 Hz: strokes are summed at their start sample, then go through
    deck_c_eq, scratch_channel and the tail.
  - Message types: `stroke`, `level`, `programme`, `shape` and `shapeLevel`.
  - The output is read through a 64-tap sinc.
  - Option `tap` dumps a stage (`DECK_C_TAPS`).
- `src/engine/dj/scratch/scratchDeckC.ts` creates the bus (`createDeckCBus`) and holds the chains
  (`DECK_C_CHAINS` threeDeck / scratchDj), `deckCDuck`, `deckCLevel` and `programmeSpan`.
- The pool (`scratchVoicePool.ts`) has five entry points:
  - `perform` routes `opts.render` strokes to `performRendered`;
  - `renderStroke` renders one stroke;
  - `shapeRoutine` / `shapeRoutinePlan` compute the level and duck ahead;
  - `recordPcm` reads a record the demo's way;
  - `prepareRecords` reads a routine's records when it is planned.
- The plan carries the render spec:
  - `scratchTypes.ScratchRenderSpec` holds the seed, the human timing in samples and the chain;
  - `scratchDemoRoutines.demoRoutineRenderSpecs` fills it (three_deck draws its timing from
    RandomState(seed), scratch_dj from LFSR(seed x 999 + 3));
  - it travels `demoRoutineToPlaced` -> `toScratchEvents` (humanizeMs 0) -> `ScratchExecutor`
    (`opts.render`) -> `fireDjFx` -> pool.
- `DJScratchDJ` has two deps for this, `prepareRecords` and `shapeRoutine`. `DJAutoDJ` wires them; the
  shape reads the deck's `audioPlayer.getAudioBuffer()`.

## Tests

- `src/engine/dj/__tests__/scratchNullsTheDemo.test.ts` (in test:ci) checks:
  - each stroke against the demo, below -200 dB;
  - each bus chain, below -130 dB;
  - the level (within 1e-6) and the duck (below -130 dB).
  - Its fixture: `tools/scratch-fixtures/gen_scratch_null.py` -> `src/engine/dj/scratch/__tests__/fixtures/scratch_null.json`.
- `scratchParityRenderAB.test.ts` has three modes:
  - the 8-bar CI check: every stroke heard, and every fired stroke reached the Deck C bus (sentinel
    `deckCStats.strokes`);
  - `SCRATCH_AB_LAYERS=1 SCRATCH_AB_RATE=22050` writes the float32 bus (`*.bus.f32`) for the full
    null;
  - `SCRATCH_AB_RENDER=1` writes the A/B pair, the track (`.wav` + exact `.f32`) and `plan.json`.
- The demo side is `tools/scratch-fixtures/render_demo_three_deck.py`. It levels and ducks over the
  routine's 32 bars and reads `track_drops.f32`.
- The per-stage oracle dump is not in the repo: it lived in the session scratchpad (`oracle.py`, a
  copy of the demo script that saves every stage as `.npy`). To rebuild it, copy
  render_demo_three_deck.py and `np.save` after each line of `scratch_channel`.

## Learnings

- Grep a rate in the browser path: `decodeAudioData` resamples to the context rate, so records are
  decoded from their bytes instead.
- The pack's `scratch_bank_metadata.json` was stale against the demo's current `load_bank` (10
  records). Regenerate it with `scratch_bank.write_metadata(load_bank(rate=22050))` and keep
  `packFile`.
- numpy semantics that matter:
  - `np.interp` is slope x (x - x0) + y0, and returns the knot value at an exact knot;
  - `linspace` is i x step + start;
  - `_read_wav` normalises in float32;
  - `resample_ratio` casts to float32;
  - `np.round` rounds half to even.
- A record read on first use can land after its stroke: plan-time preloading is required.
- scipy's `resample_poly` has a -61 dB passband ripple; measure a resampler against an ideal FFT
  upsample, not against scipy.
- The pre-commit hook can time out a 30 s static-grep test under load. It passes alone; retry the
  commit.

## Next steps (ordered)

1. **PG-J** (ledger): every other crate stroke onto `renderGesture` + a demo-chain bus. The overlay
   (`render_scratch_section`) has its own conventions:
   - physics seed `seed x 3 + bar x 16 + step`;
   - human timing `int((-10 + 25 x lfsr) ms)` from LFSR(seed x 999 + 5);
   - the profile's deck physics (P7);
   - `apply_fx` with the style FX on the **section** sum, with filter state restarting per section and
     the input cut at the section end;
   - routine bars via `render_routine(channel=False)` and its final 1-step tape delay.

   Port it as a new chain in the worklet, or as per-section buses. Then retire the ring for strokes.
2. **X6 / X7** (PG-F):
   - sum deck B into the beat when both decks play (owner decision X6);
   - decide what a module deck uses (it has no buffer);
   - make the A/B fixture write the track sample index DEViLBOX uses, which closes the last -71 dB;
   - measure in a browser when `shapeLevel` arrives (it waits for an offline render of the 32-bar
     layer).
3. Measure the coordinator's (a) and (b) after PG-J: scratch and juggle duty, and repeat counts per
   phrase, against the demo's boombap rate.
4. Owner listening checks:
   - the v3 pair on the Desktop (`demo_three_deck_drops_v3.wav`, `devilbox_three_deck_drops_mono22k_v3.wav`;
     mix residual -74 dB);
   - long throws (`drop_phrase`, 16 steps) for "that was fr".

## Other notes

- Nothing was pushed by this agent. The coordinator was pushing main during the run.
- `src/__probe_tmp/`, `tools/uade-audit/dwMatrix.scratch.ts` and the untracked research docs are not
  this agent's files.
