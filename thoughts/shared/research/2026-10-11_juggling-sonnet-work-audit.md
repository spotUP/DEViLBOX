---
date: 2026-10-11
topic: Audit of the 2026-10-11 Auto DJ juggling work (JUGX P1-P4 + JUGX-CONFORM) against the owner's music-theory plan
tags: [dj, auto-dj, juggling, audit, music-theory, tests]
status: final
---

# Juggling work audit (JUGX P1-P4, JUGX-CONFORM)

Owner plan (wins): `thoughts/shared/plans/2026-10-08-auto-dj-beat-juggling-plan.md` (cited as §N).
Checked: commits 9bfba2fde..e5e351c7f (juggle/JUGX/transition/beat grid/Smart Sort/key/bass, 2026-10-11),
the CONFORM ledger `thoughts/spot/jugx-conform-ledger.md`, the earlier audit
`thoughts/shared/research/2026-10-11_juggling-vs-music-theory-plan.md`. All file:line at HEAD (d25aeb113+e5e351c7f);
none of the audited source files had uncommitted changes.

Method: code reading by section; five revert-checks (one-line edit, single test file with
`VITEST_MAX_WORKERS=2`, file restored from a byte copy, `git diff --stat` empty afterwards). No audio heard,
no live Auto DJ run (MCP `dj_auto_dj_explain` returned no telemetry: Auto DJ was idle).

Counts: **1 blocker, 9 major, 9 minor.**

## Blocker

### B1. A refused juggle transition becomes a hard cut 16-32 bars before the incoming drop
- Files: `transitionExecutor.ts:294-299` (refused ladder -> "release now"), `transitionPlanner.ts:648`
  (`durationBars = 1` for a juggle plan), `transitionCurves.ts:42` (juggleTransition release = cut),
  `juggleController.ts:246-253` (performLadder re-checks budget, conditions, confidence and refuses),
  `DJAutoDJ.ts:1559-1583` (`finalizePlan` + `planStillHolds` keeps the anticipated plan).
- Plan: §31 "low -> normal transition"; §33 collapse to a stable normal state; §42 resolve gracefully.
- Code: the plan is a juggle plan with a 1-bar release and the incoming cued `tradeSec` before its drop. When
  `performLadder` refuses at the trade stage, the executor runs that 1-bar release: a crossfader cut onto
  the incoming at the start of its pre-drop stretch. No normal blend is planned as the fallback.
- Failure scenario (deterministic by code): the anticipated plan is made with the budget open. A stand-alone
  tease of the next track is only allowed within `NEXT_TEASE_MAX_SEC = 180` s of the transition
  (`juggleOpportunity.ts:44,122`); when it finishes, `lastJuggleAt` is set; the transition comes >= 30 s
  later; CRUISING x MUSICAL cooldown is 180 s (`jugglePlanner.ts:41,47-48`), so `performLadder` refuses with
  "cooldown"; the plan still holds (same incoming id), so the set hears a hard cut 16-32 bars early. Same
  result for "dense vocals on both decks" or a confidence drop at ladder start.
- Fix level: plan/executor. A juggle plan carries a normal-blend fallback (the style's second choice with
  its own length and curves) that the executor runs when the trade stage is refused; and the stand-alone
  layer must not spend the budget a planned juggle transition already reserved (or re-plan after it).

## Major

### M1. Stand-alone "low confidence: normal transition" is always phrase confidence < 0.5, and for modules that confidence ignores the module (known open item)
- Files: `juggleOpportunity.ts:87-89`, `jugglePlanner.ts:94,101` (conditions block beat < 0.6 and
  sync < 0.6 first), `juggleController.ts:201`, `trackAnalysis.ts:228-238`, `structure.ts:85-89,98`.
- Plan: §31 (high -> beat, moderate -> phrase, low -> normal), §37 (tracker intelligence: pattern
  boundaries, repeated patterns, orders).
- Code: by the time line 89 runs, `conditions()` has already passed beat >= 0.6 and sync >= 0.6, so
  `confidencePolicy === 'none'` can only mean `phraseConfidence < 0.5`. The module grid's 0.7 (convention) /
  1 (drums) beat confidence is not what blocks: 0.7 clears the phrase tier, as §31 intends. The phrase
  confidence comes from the audio bar features (`detectPhraseLength`: 0.3 when arrangement boundaries do not
  sit on 4/8/16, 0.2 with too few bars) or, without a phrase, `downbeat * 0.8`, where a module whose meter
  is assumed has downbeat confidence `min(beat, 0.5)` -> 0.4. The order list and pattern boundaries, which
  define a module's phrases exactly, are never consulted.
- Verdict on the open item: the gate threshold matches §31; the input is wrong. Raising or lowering the
  threshold would be a band-aid.
- Failure scenario: a 4/4 module with 64-row patterns (4 bars each) and a short drum break that throws the
  audio boundaries off 4/8/16 gets phrase confidence 0.3, so no stand-alone juggle ever runs on it.
- Fix level: analysis. Build the module's phrase grid and its confidence from the order walk (pattern
  starts, repeated patterns, `moduleBeatGrid` meter), as P1 did for tempo; the message should name the
  confidence that failed (see m1).

### M2. Two definitions of "beat confidence"
- Files: `transitionPlanner.ts:192-200` (`pairConfidence`: min of grids AND downbeats) vs
  `juggleController.ts:201` (`beatConfidence = beatGrid.confidence` only).
- Plan: §31; single source of truth.
- Code: since 3c083f24c, meter confidence (0.5 assumed, 0.65 lengths) only lowers the downbeat confidence.
  The transition path sees it, the controller path (in-mix and stand-alone juggles, abort checks) does not.
- Failure scenario: a module with drum-confirmed beat (1) and an assumed meter (0.5) gets beat-level
  stand-alone juggles (1-bar cuts on bars that may be wrong) while a juggle transition on the same track is
  refused as low confidence.
- Fix level: one confidence function shared by both paths.

### M3. The MUSICAL double is 9 bars and trades off the phrase grid
- Files: `jugglePatterns.ts:249-273`, `jugglePlanner.ts:291` (start on the next phrase start),
  `jugglePlanner.ts` `patternBars('double') = 9` (ff29d23a4).
- Plan: §9 (trades respect phrase boundaries), §47 ("no phrase trade begins off-grid"), §44 (1-bar trades
  are not MUSICAL's vocabulary; the code's own `minLadderRung('MUSICAL') = 2`, `jugglePatterns.ts:361-366`,
  and the comment at `:424-425` say so).
- Code: SETUP bar (master alone) at the phrase start, then 2-bar rungs on bars 1,3 / 5,7, 1-bar rungs,
  a re-cue bar, a 1-bar payoff, release on bar 9.
- Failure scenario: every cut of the default stand-alone juggle in the default mode (MUSICAL) falls on an
  odd bar of an 8-bar phrase, and the release lands one bar into the next phrase.
- Fix level: pattern. Put SETUP before the phrase start (start one bar early) or fold it into the
  trades, keep the pattern a whole phrase, and keep 1-bar rungs for PERFORMER.

### M4. Double payoff: the copy is re-cued at the moment it is cut out, and the layer is not phase-verified
- Files: `jugglePatterns.ts:262-268`, `juggleDeckSink.ts` `ResyncDeck` (seek to `deckPosition(o)`).
- Plan: §16 (align, verify, then permit), §17 (doubles).
- Code: on the same beat the fader starts its 30 ms sweep away from the copy and the copy is seeked to the
  master's position; one bar later both copies are layered with nothing checking their phase. A seek lands
  with tens of ms of start latency; two copies of the same audio offset by a few ms comb-filter.
- Failure scenario (derived, not heard): the payoff bar sounds flanged/phasey instead of doubled, and the
  re-cue may be audible inside the 30 ms sweep tail.
- Fix level: pattern + executor: re-cue while the copy is fully silent (a bar earlier) and gate the layer
  on the measured phase (the ladder's `phaseGate`), else skip the layer.

### M5. The next-track tease starts on the master's next bar, not on its next phrase
- Files: `standaloneJuggle.ts:134,142` (cue = next track's mix-in phrase start; `quantizedPlay(idle,'bar')`),
  `juggleOpportunity.ts:95` (`startBeat` = master's next phrase start).
- Plan: §9, §41 (both tracks' phrases run together).
- Code: the teased track's phrase 1 starts on whatever bar of the master's phrase comes next; the pattern
  starts later on the master's phrase start, so the two phrase grids are offset by 1-7 bars for the whole
  tease (the same defect audit row 11 fixed for juggle transitions).
- Fix level: setup. Start the tease on the master's phrase start (or cue it the offset into its phrase).

### M6. No meter-mismatch gate anywhere
- Files: `transitionPlanner.ts:262-299` (ladder bars and incoming cut times use the outgoing's
  `beatsPerBar`), `jugglePlanner.ts:91-121` (`conditions`), `juggleController.ts:184` (master's meter).
- Plan: §56 (meter consulted), §25 bad conditions (timing).
- Code: 3c083f24c made 3/4 modules real; nothing compares the two decks' meters before a juggle.
- Failure scenario: a 3/4 module into a 4/4 track gets a juggle transition whose rungs are counted in 4-beat
  bars; the 3/4 deck's bars drift one beat per bar against the cuts.
- Fix level: planner condition: different meters -> no juggle (normal transition).

### M7. Almost none of the new juggling tests gate a push
- Files: `package.json` `test:ci` list, `tools/test-tiers/heavy.json`, `scripts/git-hooks/pre-push`
  (runs `npm run test:ci`), `.github/workflows/deploy.yml:44`.
- Rule: global "wire into test:ci - tests outside the CI glob are decoration".
- Not in test:ci (never run by the gate or deploy): `moduleBeatGrid.test.ts`,
  `transitionPlannerJuggleStyle.test.ts`, `autoDJJuggleTransitionReachesTheDecks.test.ts`,
  `autoDJFallbackFollowsThePlannedLaws.test.ts`, `smartSortWeighsKeyConfidence.test.ts`,
  `juggleCutSweepsTheFaderNotJumps.test.ts`, `autoDJStandaloneJuggleReachesTheDecks.test.ts`,
  `juggleOpportunity.test.ts`, `playlistAnalyzerUsesTheModuleTempo.test.ts`. Heavy tier (nightly only):
  `autoDJBeatJuggling.test.ts` (listed in test:ci but excluded by the fast tier) and
  `autoDJStandaloneJuggleLongSet.test.ts`. Of today's tests only `autoDJPlannedTransitionReachesTheDecks`
  runs in the gate. Counted from the test:ci argument list and heavy.json, not by grep of one spelling.
- Fix level: CI wiring.

### M8. Tests that cannot fail (revert-checked)
| Claim | Revert | Test | Result |
|---|---|---|---|
| R5 meter confidence from evidence | `METER_ASSUMED_CONFIDENCE` and `METER_LENGTH_CONFIDENCE` -> 1 | moduleBeatGrid.test.ts | 20/20 pass: CANNOT FAIL (asserts `min(g.confidence, g.meterConfidence)` against itself) |
| R5 beat confidence | `confirmed = true` (drums present but unconfirmed -> 1) | moduleBeatGrid.test.ts | 20/20 pass: branch untested (the 0.7 test has no drums, returns early at :166) |
| R9 phase verified before the first rung | `let verified = true` | autoDJJuggleTransitionReachesTheDecks.test.ts | 7/7 pass: the reachability test does not cover it |
| R9 (same revert) | | autoDJBeatJuggling.test.ts "transition ladder follows the owner plan" | 1 fails: covered, but with a mocked `phaseError` and only nightly |
| R16 budget/cooldown | drop `phaseAllowed && juggleState.allowed` from the ladder gate | transitionPlannerJuggleStyle.test.ts | 2 fail: real |
| R23 bass kill | `stepCurve('outgoing.lowKill', 0, 0, ...)` | PlannedTransitionReachesTheDecks + FallbackFollowsThePlannedLaws | 3 fail: real |
| DJ1(g) Smart Sort key confidence | `weight = 1` | smartSortWeighsKeyConfidence.test.ts | 2 fail: real |
- Also: every stand-alone and juggle-transition harness runs on the synthetic corpus (sections of 8/16 bars,
  `autodj/testing/corpus.ts`), whose phrase confidence is high by construction; no test drives a real
  module through the stand-alone gate, which is why M1 never showed.

### M9. Smart Sort stops using keys for every playlist analysed before 521d650e1
- File: `DJPlaylistSort.ts` `keyConfidenceOf` / `keyTerm` (missing `djSummary.keyConfidence` = 0).
- Code: a track whose key came from the old analyser has `musicalKey` but no `djSummary`; every pair with
  such a track scores exactly `KEY_UNKNOWN_PENALTY`. No migration or re-analysis trigger.
- Failure scenario: the owner's existing playlists Smart-Sort with no harmonic ordering at all until each
  track is re-analysed.
- Fix level: data migration (re-analyse or backfill the summary), per the project's versioned-schema rule.

## Minor

- m1 `juggleOpportunity.ts:89`, `juggleController.ts:252`: the reason names no confidence or value (§45 telemetry
  with reasons); it is the only clue to M1.
- m2 `crossfaderSweep.ts:21-24`, `juggleDeckSink.ts:55-57,104-105`: sweeps run on `requestAnimationFrame`
  (paused in a hidden tab: cuts stall at the start position); the sink never cancels a sweep on
  reset/abort/hand-back; the timed `CrossfadeTo/From` branch is dead (no pattern emits those actions).
- m3 `standaloneJuggle.ts:89`: any time both decks play (e.g. the user starts the idle deck to preview) the
  controller plans juggles with them (§43 yield to the user). Pre-existing.
- m4 `DJPlaylistAnalyzer.ts:582,619-633`: Modland branch takes BPM from the server and key/energy from the
  local render (not one producer when the walk check fails); a failed piggyback leaves no key; an unknown
  key writes `musicalKey: undefined` into the update. Branch untested (the CONFORM note admits it).
- m5 `transitionPlanner.ts:208-216`: ladder "novelty" is recency only; learned quality (§29, §50) unused.
- m6 `transitionPlanner.ts:226-236,282-283`: the incoming is placed on a 4-bar group, not on its phrase
  start; an 8-bar rung (`[8,8]`, `[8,4,4]`) can straddle the incoming's 8-bar phrases.
- m7 `transitionPlanner.ts:443`: `coexist` (both basses for one bar at -6 dB) ignores whether the basslines'
  keys agree (§35 "only when the material is compatible").
- m8 `standaloneJuggle.ts:178-188`: the double is verified on beat phase only; §16 asks for bar phase.
- m9 Plan `2026-10-11-dj-juggling.md:647-651`: P0.1-P0.5 probes still open (e.g. `MODULE_GRID_TOLERANCE`
  unprobed, `moduleBeatGrid.ts:35-39`); the 37/46 count is honest about it.

## CONFORM claims checked

Rows 3, 5, 6, 9, 11-17, 23 and DJ1 (g): the code changes exist as described. Weaker than claimed: R5 (meter
part untested, M8), R9 (not in the reachability test; nightly-only), R11 (4-bar group, not phrase start,
m6), R17 (recency only, m5), row 30 (double fixed for bass, but off-grid and unverified, M3/M4), row 32
(beat phase only, m8). Not checked: DJ1 (d)(e) legacy echo-out and high-pass curves beyond reading
`transitionCurves.ts`.
