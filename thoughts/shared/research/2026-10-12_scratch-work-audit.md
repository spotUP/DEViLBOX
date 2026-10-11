---
date: 2026-10-12
topic: Audit of the scratch work P0-P4 (2026-10-11/12) against the owner's scratch plan and the execution ledger
tags: [dj, scratch, auto-dj, audit, tests, reachability]
status: final
---

# Scratch work audit (SCR P0-P4)

Owner plan (wins): `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md` (cited as §N).
Ledger: `thoughts/shared/plans/2026-10-11-scratch-dj-progress.md` (claims "54 of 125").
Checked: commits 411100d5e..21398ebb2 touching `src/engine/dj/scratch/**`, `DjFxActions.ts` (scratch part,
:1709-1910), `DJScratchEngine.ts`, `DeckEngine.ts` (snapshot / re-cue :1646-1695), the worklet, and the scratch
tests. All file:line at HEAD 21398ebb2; none of the audited source files had uncommitted changes.

Method: code reading by section; six revert-checks (one-line edit, single test file with
`VITEST_MAX_WORKERS=2`, file restored from a byte copy, `git diff --stat` empty afterwards); three throw-away
measurement tests over the pure planner (written under `src/engine/dj/scratch/__tests__/`, run, deleted; not
committed). No audio heard, no live app, no MCP.

Counts: **2 blockers, 8 major, 10 minor.** None of the blockers is audible today: nothing in the product
instantiates `ScratchExecutor` or calls `planScratch` yet (grep of `new ScratchExecutor` / `planScratch(` outside
tests: 0). They block P4.R4 and P7 (Auto DJ wiring), which would perform this output as it stands.

Ledger count verified from the structure: 54 lines `- [x] SCR-`, 71 lines `- [ ] SCR-`, 0 `[o]`, 0 `[?]` = 125.

## Blockers

### B1. The planner emits scratches that start together or overlap; one hand / one deck cannot perform them
- Files: `scratchPlacement.ts:78` (`PREFERRED_STEPS = [15, 15, 8, 7, 6, 0]`), `:233` (`step = Math.min(raw, 15)`:
  the reference's 16 becomes a second event on step 15), `:227-238` (steps 8/7/6 are adjacent sixteenths while
  most gestures last 2-4 steps); `scratchPlanner.ts:117-128` (routines written over bars without a re-check);
  `DjFxActions.ts:1765-1779` (deck engage/disengage keyed per action id, disengage = `stopDeckPattern(deck)`).
- Plan: §21 (placement), §8 (one event per grid position), §80/§83 (event model performed by one executor).
- Measured (`planScratch`, 40 seeds x 32 bars, fixture context): boomBap/groove MUSICAL 13 same-beat pairs and
  160 overlapping pairs; electro/drop PERFORMER 430 same-beat, 63 overlapping (2032 events); battle/instrumental
  BATTLE 811 same-beat, 204 overlapping (3690 events). boomBap/chorus MUSICAL: 0 and 0.
- Failure scenario: two different gestures planned on step 15 of a bar on deck A. The executor fires both on the
  same tick; the second `playDeckPattern` replaces the first; when the first one's end beat comes, its disengage
  calls `stopDeckPattern('A')` and kills the second mid-stroke. On the record voice both play at once on the two
  pooled voices: two scratches stacked.
- Fix level: placement (map the reference's step 16 to the next bar's downbeat or drop it; a one-hand rule: an
  event starts only after the previous one's length) + a validator check in `validatePhrase` so routines are
  checked too.

### B2. The executor's event length and the gesture's own cycle are different numbers: most gestures are cut in half or doubled
- Files: `scratchPlanner.ts:163` (`durationBeats = durationSteps / 4`), `ScratchExecutor.ts:145-158` (releases at
  `executeAtBeat + durationBeats`), `ScratchRecordVoice.ts:284` and `DJScratchEngine.ts:227-229` (the stroke
  runs over `cycleBeats`), `scratchGestureCatalog.ts` (e.g. baby `durationSteps: 2` :137 vs `cycleBeats: 1` :142).
- Plan: §10 (one gesture data model), §83 (`duration` of the event is the gesture's).
- Code: P1 "as built" keeps both numbers on purpose; nothing reconciles them at execution. baby, babySlow,
  forwardStab, backwardStab, transformer4, flare1, flare2, orbit, crab, hydroplane, tearForward, tearReverse,
  drag (13 of 27) are released before their cycle ends (baby: 0.5 of 1 beat = forward stroke only, no return);
  chirp and scribble (0.5 beats vs a 0.25-beat cycle) and uzi (0.25 vs 0.125) loop twice.
- Failure scenario (deterministic by code): every planned Baby Scratch performed by the executor plays its push
  and is stopped before the pull; a deck event is stopped with `stopDeckPattern`, not `finishCycle`.
- Fix level: data model. One length per gesture: either the cycle is derived from `durationSteps` or
  `toScratchEvents` takes the cycle; the executor releases on whole cycles.

## Major

### M1. Planned beats ignore the downbeat phase: every scratch lands `phaseOffset` beats off the bar
- Files: `scratchAnchor.ts:231-233` (`stepToBeat = bar * beatsPerBar + step/4`), `juggleController.ts:431-435`
  (`analysisClock` beat 0 = first raw beat), `types.ts:51-52` (`DownbeatGrid.phaseOffset`), `scratchContext.ts:98`
  (`masterBar` from the downbeats) vs `:108` (`masterBeat` from the raw beats). `phaseOffset` is used nowhere in
  `src/engine/dj/scratch/`.
- Plan: §7 (lock to beat -> bar -> phrase), §8.
- Failure scenario: a track whose first downbeat is the second detected beat (phaseOffset 1). The phrase-end
  turnaround planned on bar 15 step 15 fires one beat late, on the next bar's beat 1 - 1/4 instead of the end of
  the phrase; every "bar 4 step 0" lands on beat 2. The P4.2 test's fixture has phaseOffset 0, so it cannot see it.
- Fix level: clock/model. Bar -> beat through the downbeat grid (`bar * meter + phaseOffset`, or the bar's start
  time), one function shared with the juggling ladder.

### M2. P4.2 "musical clock" is true for the executor's start time only; the deck pattern still phases by elapsed time
- Files: `DJScratchEngine.ts:236-243` (`patternElapsedMs = elapsed % patternDurationMs`), `:205-217`
  (`msUntilNextBeat` from `getElapsedMs()`, up to 500 ms wait when `pattern.quantize`), `DjFxActions.ts:1769`
  (deck engage = `playDeckPattern`, no grid/phase passed).
- Plan: §7 states this exact defect ("starts from elapsed-time modulo cycle length ... must change for Auto
  Scratch"). Ledger P4.2 claims "`ScratchPlayback.play` phase for Auto Scratch uses `beatAt(position)`".
- Code: the executor calls `fireDjFx` on the right grid tick (tested, with a CRATE event), then the deck pattern
  starts mid-cycle at `elapsed % cycle` and, for quantized patterns, waits for the next "beat" of elapsed time.
- Failure scenario: a deck event on the grid downbeat of a track with a 180 ms first-beat offset (the P4.2
  fixture's own numbers) starts its stroke 180 ms into the cycle (or waits up to 500 ms).
- Fix level: execution layer. `ScratchPlayback.play` takes a start phase from the caller (0 at the planned beat)
  and skips its own quantize for Auto Scratch.

### M3. Deck true re-cue (P3.4) never happens through the executor, and its fallback re-arms the ring on an audible deck
- Files: `ScratchExecutor.ts:172-184` (re-cue BEFORE `fire`), `DeckEngine.ts:1684` (window closed =
  `scratchPlayback.currentFaderGain === 0`), `DJScratchEngine.ts:180,387` (`currentFaderGain` is 1 at rest and
  after stop), `DeckEngine.ts:1693` (ring-only = `scratchBuffer.startScratch(0, 'write')`),
  `DeckScratchBuffer.ts:239-251` (that freezes capture and ramps the ring's `playbackGain` to 1).
- Plan: §18 (start at anchor, stroke, return, stroke again), §60.
- Code: between strokes no pattern runs, so the fader gain is 1 and every executor re-cue takes the ring-only
  branch (`returnsToAnchor: false`). `deckRecueKeepsTheAnchor.test.ts:29` forces the gain through a stub and
  the executor tests mock `recueDeck`, so the reachable case is untested. The ring-only branch starts ring
  playback at rate 0 at gain 1 on a deck the listener hears; `playbackGain` is not part of the snapshot.
- Failure scenario (derived, not heard): four Auto Scratch stabs on deck A: 0 seeks, four "recue unavailable"
  events, the stabs drift exactly like the legacy path; each re-arm holds the ring head (a constant sample under
  Hermite at rate 0) under the deck until the pattern's own phases take over.
- Fix level: executor ordering + deck model. Re-cue inside the gesture's first closed window (or the gap the
  planner reserves before the stroke, with the deck channel closed by the executor), not on the open fader; the
  ring-only fallback must not touch an audible deck's ring gain, and ring gain belongs in the snapshot.

### M4. The snapshot restores state the scratch never touched, overriding other actors (§60 says "everything it changes")
- Files: `ScratchExecutor.ts:164-168,208-216`, `scratchSnapshot.ts:63-71`, `DeckEngine.ts:1661-1674`.
- Plan: §60 (restore what it changes, to previous values), §63 (user override), §45/§46 (scratch inside a
  transition).
- Code: one snapshot of {rate, channelGain, captureFrozen, suppressNotes, crossfader, busLevel} at the first
  start of a run; at the last release every field that differs from now is written back, whoever moved it. A
  record-voice run touches neither the deck nor the crossfader, yet restores both. No catalogue gesture uses the
  crossfader (P1 as built).
- Failure scenario: Auto DJ runs a 16-bar crossfade while record-voice accents play over it (the §46 use case);
  at the last accent's release the crossfader snaps back to its position at the first accent. Same for a pitch
  bend / sync change (`rate`) or the user moving the crossfader during an Auto Scratch phrase.
- Fix level: executor. Record what each gesture actually sets (per field, with its own before-value) and restore
  only those, only when the value is still the one the scratch left.

### M5. Tests that cannot fail (revert-checked)
| Claim | Revert (one line) | Test | Result |
|---|---|---|---|
| P3.5 release restores the state (real probe) | `scratchSnapshot.ts:67` `deck.restoreScratchSnapshot(s)` -> `void s` | scratchExecutor.test.ts | passes: CANNOT FAIL (every executor test and R3 use a fake probe; `createScratchStateProbe` and `DeckEngine.restoreScratchSnapshot` have no test) |
| P4.9 a vocal bar > 0.7 keeps one event unless ANSWER | `scratchPlacement.ts:374` thinning -> `void answers` | scratchPlacement.test.ts | passes: CANNOT FAIL (the `(1 - vocal)` rate already empties those bars) |
| P4.6 open space (a quarter of 16 bars empty) | `scratchPlacement.ts:393` `need` -> 0 | scratchPlacement.test.ts | 1 fails: real |
| P4.13 low confidence = SAFE level 1 | `scratchPlanner.ts:64` gate -> `if (false)` | scratchDeterminism.test.ts | 1 fails: real |
| P3.3 true re-cue on records | `ScratchRecordVoice.ts:283` drop `this.cue(` | scratchRecordVoice.test.ts | 2 fail: real |
| P4.8 never the same humanize offset twice | `scratchPlacement.ts:303` `&& false` | scratchPlacement.test.ts | 1 fails: real |
- Fix level: tests. Drive the real probe over a stub deck/mixer; the vocal test needs a bar whose rate survives
  the `(1 - vocal)` thinning (e.g. an ANSWER-free routine bar) to prove the slice.

### M6. The planner's output breaks the rest and vocal rules the placement layer guarantees
- Files: `scratchPlacement.ts:352-354` (`planBars` decides `showcase` from the UNcapped section density),
  `scratchPlanner.ts:96-112` (passes the mode-capped rate but not the capped state), `:117-128` (routines
  overwrite bars after rests, open space and repair; no `validatePhrase`).
- Plan: §23 (rests), §24 (density x (1 - vocal)), §74 / §77 (genuine rests, do not over-scratch).
- Measured (`planScratch`, 40 seeds x two 16-bar windows): electro/drop PERFORMER: 72 of 80 windows have fewer
  than 25 % empty bars, minimum 0 (electro + break = showcase before the PERFORMER cap, so the 1/8-of-32 rule is
  applied to a non-showcase mode); boomBap/chorus MUSICAL at vocal 0.9 plans 647 events vs 702 at vocal 0
  (-8 %, not ~-90 %): the routines ignore the vocal.
- Tests: P4.6 and P4.9 assert `planBars` only, so `planScratch` was never measured against them.
- Fix level: planner. Pass the capped density state into `planBars`; place routines before rests/vocal/repair
  (or run them through the same filters), and validate the final plan.

### M7. The record voice's reachability and audio tests run only nightly
- Files: `tools/test-tiers/heavy.json` (excluded from `test:ci` by `vite.config.ts:135` under
  `VITEST_TIER=fast`): `scratchRecordVoiceReachesTheBus.test.ts` (P2.R2), `scratchRecueReachesTheRecord.test.ts`
  (P3.R3), `scratchRecordVoiceAudio.test.ts` (P2.8). `scripts/git-hooks/pre-push` and `deploy.yml:44` run only
  `test:ci`.
- Counted from the `test:ci` argument list (all 26 claimed test files are listed there) and heavy.json, not by
  grep of one spelling. The other 23 run per push.
- Consequence: the only tests that prove a registry fire reaches the record ring and the bus (and the 12 x 6
  click/DC/stuck-voice verdicts) never gate a push; ledger OPEN 1 (20-40 s renders) is the cause.
- Fix level: test performance (shorter renders, one convolver) to move them back to the fast tier.

### M8. Two definitions of beat confidence (the juggling audit's M2 again)
- Files: `scratchContext.ts:115` (`beatConfidence = track.beatGrid.confidence`), `scratchPlanner.ts:64` (the
  SAFE gate reads only that), vs `transitionPlanner.ts` `pairConfidence` (min of beat grid and downbeats).
- Plan: §31-style confidence policy, §69 Test 8 (low confidence), single source of truth.
- Failure scenario: a module with drum-confirmed beat confidence 1 and an assumed meter (downbeat confidence
  0.5) is planned at full level with routines on bars that may be wrong; together with M1 those bars are where
  the turnarounds go.
- Fix level: one shared confidence function (beat and downbeat), as recommended for juggling.

## Minor

- m1 Known, fixed in 21398ebb2: a re-fired record gesture orphaned its looping voice, and Scratch Stop did not
  release record voices. Residual: `fx_scratch_throw` deletes its handle (`DjFxActions.ts:1810`), so Scratch Stop
  (`:1752-1754`, handles only) cannot stop a running throw (a `dropPhrase` is up to a bar); Scratch Release
  (`:1889`) can, via `releaseAll`. Stop and Release should end the same set.
- m2 Known, ledger OPEN 3: deck scratch reverb `createReverbIR(ctx, 0.6, 4000)` (`DeckEngine.ts:318`) decays in
  0.25 ms - a noise burst, not a room. Unchanged; P10.O decision.
- m3 `ScratchExecutor.ts:177`: without `recueDeck` the executor builds an inline stub target whose `rearmRing` is
  a no-op and always reports ring-only; a silent fallback instead of a required dependency.
- m4 `ScratchExecutor.ts:119`, `DJScratchEngine.ts:267`: 5 ms / 10 ms `setInterval` main-thread ticks; in a hidden
  tab Chrome clamps them to >= 1 s, so deck events start up to a second late (record events too, since their
  lookahead is 0.1 s). Not reachable until P7; derived, not measured.
- m5 `DjFxActions.ts:1765-1771`: the deck branch ignores `amount` (velocity), `role`, `beats` and `at`; the plan's
  velocity (§83) only reaches the record voice.
- m6 `DeckEngine.ts:1665`: tracker-mode restore sets the pitch multiplier to the captured TEMPO multiplier; with
  key lock (pitch != tempo) a restore that has to write the rate breaks the pitch. Derived.
- m7 `ScratchExecutor.ts:197-204,222-225`: `cancel()` restores the snapshot while an 'ending' record event's
  worklet stop is still scheduled in the future; the voice keeps playing after "restored".
- m8 `scratchContext.ts:132`: `scratchPermission` defaults to 1 (full permission) and is 0..1, while §27 / D7
  define 0..4 from the hands budget; an absent budget should mean no permission until P7.11 lands.
- m9 Ledger P3.6 is `[x]` although its test asserts 71.5 against the owner's 68.875 example and the ledger says
  "Owner to confirm": by its own legend it is `[?]`. P4.TC is open while P4.1-P4.13 were ticked.
- m10 `scratchRecordRing.test.ts` ("rate -1 from 0.3 s") is in the fast tier and fails intermittently under load
  (ledger P3 "not done by me"): a flaky test in the push gate.

## Ledger claims checked (P0-P4, 54 [x])

- Code exists for all 54 ticked items (files in `src/engine/dj/scratch/` (18), the registry block, the worklet
  record mode, `DeckEngine` snapshot/re-cue); every named test file exists and is in `test:ci`.
- Weaker than claimed: P2.8, P2.R2, P3.R3 (nightly only, M7); P3.4 (unreachable through the executor, M3);
  P3.5 (restore proven with a fake probe only, M4/M5); P4.2 (executor start time only, deck phase unchanged, M2);
  P4.6, P4.9 (hold for `planBars`, broken by `planScratch`, M5/M6); P3.6 (owner decision pending, m9).
- Not covered by any ticked item and found here: B1 (overlap), B2 (two lengths), M1 (downbeat phase).
- Open per the ledger and confirmed open: P4.14 (`fixtures/golden/` is empty), P4.R4, P4.TC.
- Not checked: listening (the owner verified the P2 manual checks on 2026-10-12), P0.5/P0.6 probe numbers,
  the Python parity fixtures beyond their tests passing.
