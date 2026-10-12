---
date: 2026-10-12
topic: Scratch full demo port - PG-J (one stroke renderer) handoff, for the next phase agent
tags: [scratch, dj, demo-port, null-test, handoff, pg-j]
status: final
---

# PG-J handoff: every scratch stroke is the demo's render

## Task(s)

- PG-J of thoughts/shared/plans/2026-10-12-scratch-full-demo-port.md: every stroke through `scratchRender` + a
  Deck C bus, the voice path retired, X6 (level from decks A AND B). **Done: 26 of 26 rows closed** (the 25 PG-J
  rows + X6). Ledger running count 48 of 81, 33 open. Commits 7b6a338f3 (the port), 3ef4c16ec (the deck
  ring's record mode removed). Not pushed.
- Coordinator item (owner: "repetitive sparse boring scratches"): measured, not fixed - the cause is in other
  phases' rows (below).

## Critical references

- Ledger: thoughts/shared/plans/2026-10-12-scratch-full-demo-port.md, section "PG-J progress" (checklist,
  revert checks M1-M16, the density table).
- Earlier stages: thoughts/shared/research/2026-10-12_scratch-null-test.md, handoffs/2026-10-12_scratch-null-test.md.
- Demo: /Users/spot/Code/Up_Rough_Demo_System/tools (unchanged since 73fa00f39 for the turntablist modules).
  scratch.py `render_scratch_section` :809-877, `apply_fx` :321-334, `PROFILES` :353-392;
  scratch_routine.py `render_routine` :292-319, `render_versions` :326-336; hiphop.py :2389-2397 (the
  overlay mixed at 0.55 / 0.42 and CUT at the section end - see Other notes).

## Code map (what changed)

- `src/engine/dj/scratch/scratchVoicePool.ts`: no voices. `perform` renders every stroke (`renderStroke`:
  needle, demo gesture, or `catalogueDemoGesture` for DEViLBOX's own 8 gestures) and sums it on the spec's bus;
  overlay strokes carry their section. `loop` (Scratch Loop), `cueSample` (user cues), transient records as
  22,050 Hz PCM. `shapeRoutinePlan(shape, decks[])` sums decks. The app pool taps mixer inputA + inputB into
  every bus (X6 live).
- `public/worklets/scratch-deck-c.worklet.js`: mode 'sections' (the overlay: `Section` = input cut at the
  section end, hp / lp / tanh / tape delay fb .25 damp .4 / room decay .5, life = end + 4d + 0.12 s), version
  chains (lp per chain), `follow` level from the input (0.60 x rms(A+B) / rms(layer), means since the first
  stroke, 1 s glide). The `programme` message is gone.
- `scratchDeckC.ts`: `DECK_C_CHAINS` + routineDry/Dark/Delay/PhraseEnd, `PRESET_CHAIN`, `DeckCSection`,
  `routineShapeDecks` (pure; wired in `autoScratchRuntime.scratchShapeDecks`).
- `scratchRender.ts`: nine `DEMO_DECK_PROFILES`, `DEMO_PROFILES` (deck + FX), `applyFx` exported,
  `routineEndingDelay`, `demoStepSamples`, `catalogueDemoGesture`, `glideProfile`.
- `scratchPlanner.ts`: `overlayRender` (the spec per stroke: seed*3 + bar*16 + step, human timing per demo
  slot via `demoPhraseSteps`, routine strokes boom-bap + ending), `routineSlotRecord` (R12 record-set branch);
  events carry `render` and `routineSlot`.
- `DJScratchDJ.ts`: strokes without a spec (short arcs, juggle response, their needles) get one on their
  section's overlay bus (`demo=false`: no human timing). `ScratchEventFx` is now `{ preset? }` only.
- `DjFxActions.ts`: record gestures render and play out whole; disengage of a record gesture does nothing
  (`onRecord` set); cue / anchor set `pool.anchor`; loop via `pool.loop`.
- `trackerSampleSource.ts`: `demoRecordPcm` (WAV) or decode + `demoMonoPcm`, grit off.
- Deleted: `ScratchRecordVoice.ts`, `scratchLevel.ts`, the ring's record mode (`DeckScratchBuffer.ts`,
  `scratch-buffer.worklet.js`), 15 voice-only tests (their behaviour is nulled now).

## Tests (all in test:ci)

- `scratchNullsTheDemo.test.ts`: + overlay section through planner, pool and bus (-152 dB; fixture
  `scratch_overlay_null.json` from `tools/scratch-fixtures/gen_scratch_overlay_null.py`), routine alone
  (< -200 dB), nine profile decks, four stored versions (< -120 dB after one gain), registry entry points
  (pad, MCP, transition presets, twiddle, tracker sample, loop) each sentinel-counted and equal to the demo
  stroke on its chain.
- `scratchLevelHearsDecksAAndB.test.ts` (X6), `autoDJScratchReachesTheDecks` (getAutoDJ reachability: render
  sentinel = strokes fired, every event on the overlay), `autoScratchWithJuggle` (response strokes' spec).
- `autoDJScratchTenMinuteSet` now logs density per phrase (the table in the ledger).

## Learnings

- The overlay null passes with no fitted gain because the bus at the test's 22,050 Hz context is exact; a
  stroke's start must be given as (n + 0.25) / 22050 s, or `trunc(t x 22050)` can land one sample early.
- DEViLBOX's `planPhrase` drops the demo's second step-15 stroke (PREFERRED_STEPS has 16, the demo clamps to
  15) and one-hand overlaps: the overlay null uses a hook (low density, k <= 1 per bar) so the plans agree.
  With k >= 2 they differ - that is P13 (PG-E), not the renderer.
- Human timing: `overlayRender` matches each DEViLBOX stroke to the demo's own slot in its bar (same step,
  first unused); DEViLBOX-only strokes get none. Once P13 makes the demo plan the base, every demo stroke
  matches.
- The pre-commit hook runs ~20 affected suites; it passed in ~2 min under load.

## Next steps (ordered)

1. **Density (owner's complaint), PG-E P13 first**: MUSICAL plays 1.7 % of the set against the demo overlay's
   15.1 % on the same track (13.6 % vs 52.5 % of bars; 2 gestures). Make the demo overlay the unmodified base
   (no mode density / level cap, no vocal thinning, both step-15 strokes summed as the demo does) and layer the
   extras on top, per the owner's P13 decision. Re-run `autoDJScratchTenMinuteSet` and compare to the table.
2. When the demo's own performance plays: the three-deck routine (81 % duty, 23 strokes / phrase) reaches the
   set only as a 32-bar PEAK feature (PERFORMER / BATTLE, `DJScratchDJ.wantsFeature`): C15 / C11 in PG-F.
3. PG-F: X7 duck for module decks (the beat is now on the bus input - a live 40 Hz envelope is possible), X8,
   C15; the A/B fixture's track sample index (-71 dB).
4. Cleanup (no row): scratchBus.ts's velocity / style FX / preset / gesture FX stages have no caller left.

## Other notes / owner questions

- hiphop.py mixes the overlay at 0.55 (use_scratch styles) / 0.42 and **cuts it at the section end**
  (`n = min(len(sec), len(scr))`); DEViLBOX follows `render_scratch_section` itself, so a section's delay and
  room tail rides 0.12 s (+ 4 delay lengths for electro / west coast) into the next. Owner call if the cut is
  wanted.
- For the owner's ear (LOCAL http://localhost:5174, DJ view, Auto DJ on a hip-hop playlist, Auto Scratch
  MUSICAL then PERFORMER): the strokes should sound like the demo's (the boom-bap deck, the section's room),
  still sparse until P13 lands.
