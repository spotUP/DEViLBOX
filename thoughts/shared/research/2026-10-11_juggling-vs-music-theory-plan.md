---
date: 2026-10-11
topic: Auto DJ juggling build (JUGX P1-P3, P4 committed part) audited against the owner's music-theory juggling plan
tags: [dj, auto-dj, juggling, audit, music-theory, beat-grid]
status: final
---

# Juggling build vs the owner's music-theory plan

Reference (wins on any disagreement): `thoughts/shared/plans/2026-10-08-auto-dj-beat-juggling-plan.md`
(sections cited as §N). Audited: `thoughts/shared/plans/2026-10-11-dj-juggling.md` P1-P3 and their
commits 9bfba2fde, 272983a45, e5ede3d05, 4fd33dd62, bc4de83b9, 43ffd0835, 4ab6c5b1c, 44397bc39 (P1.7a
part), 8911ea27f, deb43fcca, f25d132a4, fd16700f9, 303d512b7, 9b7fb7a8b, fdf858a51, 9c8f1aa16. P4 is
in progress: only the committed part was audited (81d6cffb1 P4.1 `juggleOpportunity`, a062d35b8 P4.2
`loadDoubleToDeck`). Baseline: the 2026-10-08 juggle engine (0edb37304, JUG items in
`2026-10-08-auto-dj-world-class-progress.md:794-914`).

All file:line references are at HEAD (61319b350). Files with uncommitted P4 edits in the working tree
(`DJAutoDJ.ts`, `DJAutoSync.ts`, `juggleController.ts`, `juggleOpportunity.ts`, `juggleTypes.ts`,
`types.ts`) were read through `git show HEAD:<path>`, not from disk.

Method: read the owner plan by section; read the diffs and the touched code; no tests or builds were
run. Every verdict is from code reading. Musical consequences (what is heard) are derived from the
code, not listened to.

## 1. Requirement table

| # | Owner section | Requirement | Built behaviour (file:line) | Verdict |
|---|---|---|---|---|
| 1 | §1, §53, §56 | Sit above existing deck/mixer primitives; no second engine | Rate bend is a new `DeckEngine` primitive riding the existing rate path (`DeckEngine.ts:928`); the double reuses the decoded buffer (`DJTrackLoader.ts:226`, a062d35b8) | CONFORMS |
| 2 | §2 | One timing authority; one tempo per track | Module grid is the one producer for analysis, deck grid, deck BPM and playlist BPM (`moduleBeatGrid.ts:144-173`, `trackAnalysis.ts:213-221`, `DJPipeline.ts:739`, `DJPlaylistAnalyzer.ts` server branch `result.bpm = mg.bpm`) | CONFORMS |
| 3 | §56 ("do not assume every song is 4/4 without consulting musical-clock metadata") | Meter consulted, not assumed | `TRACKER_BEATS_PER_BAR = 4` hard-coded (`moduleBeatGrid.ts:15,154,172`), its own constant beside `musicalClock.DEFAULT_BEATS_PER_BAR` / `MusicalClockSettings.meter` (`musicalClock.ts:30,43-51`); the fixed meter then skips the existing meter search (`beatGrid.ts:114-116`). A 3/4 module (e.g. 48-row patterns of 3-beat bars) becomes 4/4 with confidence 1 | DEVIATES |
| 4 | §56 ("do not assume every phrase has identical length") | Irregular bars/phrases follow the music | Each order position starts a bar; a Dxx-shortened pattern makes a short bar (`moduleBeatGrid.ts:155-165`) | CONFORMS |
| 5 | §31 | Every decision carries real confidence | Module grid confidence is a literal 1 (`moduleBeatGrid.ts:38,172`, passed as `fixed.confidence` at `trackAnalysis.ts:216,220`) although the beat level is inferred (`songRowsPerBeat` speed convention vs drum backbeat, `moduleBeatGrid.ts:99-127`) and the meter is assumed (row 3). Confidence 1 unlocks the beat-level ladder (row 14) on every module whose walk matches its render | DEVIATES |
| 6 | §38 | Channel identity time-varying, never "channel N = role" | `songRowsPerBeat` picks drum channels from the per-song `identity.roles` (`moduleBeatGrid.ts:104-108`) and ignores `identity.timeline` that the same call returns (`songChannelIdentity.ts:111-112,140-144`) | DEVIATES |
| 7 | §22 | Timers only for safety/cleanup; musical actions from beat/bar | Ladder actions carry `executeAtBeat` against the deck clock (juggle executor, unchanged); the bend end timer (`DeckEngine.ts:928+`) is phase-correction housekeeping, not a musical event | CONFORMS |
| 8 | §30, §32 | No drifting phase; corrections never audibly skip | Playing decks are bent, never seeked (`DJAutoSync.ts:141-143,166-172`); executor never seeks an incoming the user already started (`transitionExecutor.ts:248-251`); heard position includes key-lock latency (fd16700f9) | CONFORMS |
| 9 | §16 | Align, establish bar phase, VERIFY, only then juggle | Ladder setup bends the incoming with bar-mode `phaseAlign` and starts the ladder in the same call, without waiting or verifying (`DJAutoDJ.ts:1581-1583`). Bar mode bends up to half a bar at <= 6 % (`DJAutoSync.ts:127-143,155-171`): a half-bar error at 125 BPM is ~16 s of bending, i.e. into the incoming's first audible rung | DEVIATES |
| 10 | §26 | Transition can be a JUGGLE_TRANSITION: outro -> 4 -> 2 -> 1-bar trades -> incoming drop -> release | Style `juggleTransition` (`types.ts:578,583,752`), ladders `[4,2,1]` / `[8,4]` (`transitionPlanner.ts:182-184`), release lands on the incoming drop (`transitionPlanner.ts:157-165`), pattern `transitionLadder` (`jugglePatterns.ts:323-334`) | CONFORMS |
| 11 | §9, §41 | Trades respect phrase boundaries (both tracks); the plan's own example ladder is phrase-sized (8 + 4 + 4 = 16 bars) | Ladder length = `2 * sum(ladderBars)` bars = 14 (4-2-1), 6 (2-1), 24 (8-4), 12 (4-2) (`transitionPlanner.ts:209-210`, `jugglePatterns.ts:325-330`). The incoming starts that many bars before its drop (`transitionPlanner.ts:225-226`), so with 4-2-1 its phrase grid sits 2 bars off the outgoing's: the incoming's 4-bar answer starts on bar 3 of its own 4-bar group and straddles two groups. Same for 2-1 (6 bars) | DEVIATES |
| 12 | §9, §47 ("no phrase trade begins off-grid") | Ladder starts on a phrase boundary | `chooseMixOut` prefers phrases but admits bar boundaries when strictness < 0.7 (`transitionPlanner.ts:121-124`); when nothing fits from the aim the ladder starts on "the latest bar boundary" (`transitionPlanner.ts:218-223`). Bar-aligned always; phrase-aligned not guaranteed | DEVIATES |
| 13 | §9 ("do not switch halfway through a vocal phrase"), §36 | Cut points avoid live vocal phrases on either deck | Only a score penalty for outgoing vocals over the whole mix-out window (`transitionPlanner.ts:108-110`) and a pair gate `vocalRisk < 0.5` (`:345`). `performLadder` builds the fixed ladder without the planner's material/vocal checks (`juggleController.ts:203-223`); the incoming's vocals at its rung boundaries are not looked at | DEVIATES |
| 14 | §31 | Beat-level / 1-bar work only at high beat + sync + phrase + material confidence; moderate -> phrase trading | `laddersFor` chooses the 1-bar ladder from grid confidence alone (`transitionPlanner.ts:182-184`); the style gate checks grid and downbeat confidence only, no phrase/material confidence (`transitionPlanner.ts:335,343-346`). The juggle layer's own rule (`confidencePolicy`, `jugglePlanner.ts:29-34`) is not applied | DEVIATES |
| 15 | §44 | SAFE = 8/4-bar trading; MUSICAL = call/response, fills, doubles; beat-level/bar-level cuts from PERFORMER | SAFE never gets a juggle transition (`transitionPlanner.ts:343,592`), though `[8,4]` is exactly SAFE's vocabulary. MUSICAL gets the `[4,2,1]` ladder, i.e. 1-bar trades, which the juggle layer reserves for PERFORMER (`barTrade` absent from MUSICAL in `jugglePatterns.ts:349-352`) | DEVIATES |
| 16 | §24, §28 | Juggling budgeted; OPENING / RECOVERY = normal mixing; cooldowns | `scoreStyles` has no set-phase or budget gate for `juggleTransition`, only a PEAK bonus (`transitionPlanner.ts:342-350`); `performLadder` bypasses `budgetFor` / `conditions` (`juggleController.ts:203-223`). A juggle transition can be planned in OPENING or RECOVERY and right after a stand-alone juggle | DEVIATES |
| 17 | §29, §30, §21 ("do not always use the same juggle pattern") | Vary the performance; do not repeat the same trick | The ladder is one fixed shape per grid-confidence band; repetition is only the generic transition-style penalty over the last 3 transitions (`transitionPlanner.ts:295-301`); juggle history/learned memory is not consulted when scoring the style | DEVIATES |
| 18 | §8 | Grammar SETUP -> ESTABLISH -> INTENSIFY -> ... -> RELEASE; never a permanent A B A B | Ladder tags ESTABLISH (>= 4 bars), INTENSIFY (< 4), RELEASE (`jugglePatterns.ts:325-332`); §26's example has no payoff, so none is required here | CONFORMS |
| 19 | §21 | Actions scheduled ahead against the shared clock | `performLadder` starts on the bar the incoming started on (within 0.25 beat) else the next bar (`juggleController.ts:215`); the only possibly-late action is the first cut to the deck already heard (no audible effect) | CONFORMS |
| 20 | §42 | Abort resolves gracefully, never stops dead | Aborted ladder -> trace `ladder aborted: release now`, the release curve still runs (`transitionExecutor.ts:290-296`) | CONFORMS |
| 21 | §43 | Yield to the user | A user-started incoming keeps its position (`transitionExecutor.ts:248-251`); user control during a juggle goes through the controller's existing abort path (`juggleController.ts:231`) | CONFORMS |
| 22 | §34, §35 (during the ladder) | At least one audible deck; no blind bass layering | Trades are crossfader cuts between two playing decks; release is a cut with full-range EQ on both (`transitionPlanner.ts:361-362,410-412`): one bass at a time | CONFORMS |
| 23 | §14, §35 | Intentional bass handover avoiding low-end collision ("cut A bass, bring B bass") | Planned transitions hand over at `const cut = -12` dB (`transitionPlanner.ts:408`), not a kill; the juggle layer itself hands over with true kills (`juggleDeckSink.ts:112-114`). Two rules for one musical act, and -12 dB leaves the outgoing bass under the incoming (this is DJ1 (f)) | DEVIATES |
| 24 | §53 | Transition executor owns ordinary transitions; juggle executor owns performance actions; shared deck state | The executor's trade stage hands the ladder to the juggle controller and resumes with the release (`transitionExecutor.ts:290-296`); the prelude in `DJAutoDJ` was deleted (fdf858a51) | CONFORMS |
| 25 | §45, §46 | Telemetry and events with reasons | Ladder decision carries `juggle transition: <reason>` (`juggleController.ts:216-219`); executor trace `juggle ladder 4-2-1` (`transitionExecutor.ts:291`) | CONFORMS |
| 26 | §47 | Deterministic harness: actions land on intended beats | R3 asserts the cut beats through `getAutoDJ()` (`autoDJJuggleTransitionReachesTheDecks.test.ts`, fdf858a51); R2 asserts zero seeks on playing decks. Not run in this audit | CONFORMS |
| 27 | §25, §27 (P4, in progress) | Juggle where the music offers it: breakdown, build, phrase end, energy need; inside a single track | `juggleOpportunity` triggers `break` / `build` / `phraseEnd` / `energy` within one phrase (`juggleOpportunity.ts:102-111`) | CONFORMS (in progress) |
| 28 | §24, §28, §31 (P4, in progress) | Stand-alone juggles obey budget, set arc, confidence | Reuses `budgetFor`, `conditions`, `confidencePolicy`, `planJuggle` on the would-be double context (`juggleOpportunity.ts:79-84,114-115`) | CONFORMS (in progress) |
| 29 | §25 bad conditions (P4, in progress) | Key, dense vocals, bass ownership judged for the pair that will actually play | The `next` tease is decided on the double context (master copied onto the idle deck, `juggleOpportunity.ts:46-57,79-84`); for the next track only `compatible` (tempo band + key) is checked (`:117-118`): vocal and bass conflicts with the next track are never evaluated | DEVIATES (in progress) |
| 30 | §17, §35, §44, §31 (pre-existing, made live by P4) | Doubles: straight / offset / payoff without bass collision; beat juggling only from PERFORMER | `double` is the only MUSICAL pattern a same-track double may use (`jugglePlanner.ts:176-177`, `jugglePatterns.ts:351`). It contains 1-beat trades (`jugglePatterns.ts:247`) yet counts as phrase-level (`jugglePlanner.ts:146`), and its PAYOFF layers the two copies still offset by 1, 2, 4, 8 or 16 beats (`jugglePatterns.ts:249-250`, offsets `jugglePlanner.ts:297-300`) with no bass ownership: the same bassline against itself out of step. Bass is only a score term (`jugglePlanner.ts:197-198`), which cannot change the choice when `double` is the only candidate | DEVIATES (pre-existing; P4 makes it reachable by default) |
| 31 | §15 (P4, in progress) | Same track on both decks, independent positions | `loadDoubleToDeck` reuses the decoded buffer and copies the analysis (`DJTrackLoader.ts:226`, a062d35b8) | CONFORMS (in progress) |
| 32 | §16 (P4, in progress) | Double setup: align, bar phase, offset, verify, then permit | Setup / hold-sync / hand-back (P4.3) not committed; nothing to audit | MISSING (in progress) |

Row count from this table (counted by grep over the verdict column): 32 rows. CONFORMS 17 (of them 3 in
progress), DEVIATES 14 (of them 1 in progress and 1 pre-existing made live by P4), MISSING 1 (in
progress), N-A 0.

## 2. Fixes for DEVIATES / MISSING rows

| # | Fix (file, what to change) | Scope |
|---|---|---|
| 3 | `moduleBeatGrid.ts`: read beats-per-bar from the musical-clock meter (`DEFAULT_MUSICAL_CLOCK_SETTINGS.meter`, or song meter metadata where a format carries it) instead of the local constant, and test 3 vs 4 with the same drum evidence already used for rows per beat (downbeat accent on the bar's first beat). Pass a non-1 meter confidence to `buildBeatGrids` `fixed` so `beatGrid.ts:114-116` reports the real certainty | Follow-up (P1) |
| 5 | `moduleBeatGrid.ts:38,172`: confidence from the evidence: drum-confirmed beat level and meter -> 1; speed convention with no drum evidence, or a near tie between levels -> below `POLICY_MIN.beat.beat` (0.8) so the beat-level ladder and beat patterns wait for evidence. Type `confidence: number`, not `1` | Follow-up (P1) |
| 6 | `moduleBeatGrid.ts:104-108`: decide percussion per order position from `identity.timeline` (`getRolesAtPosition`), as `trackerMixAnalysis` does for material, instead of the per-song `identity.roles` | Follow-up (P1) |
| 9 | `DJAutoDJ.ts` `performTrade` (1581-1583): reuse the rule already in `juggleDeckSink` ResyncDeck - within half a beat bend, otherwise one exact re-cue while the incoming is still silent (the first rung is the outgoing's) - and start the ladder only once the measured heard-phase error is under the R2 tolerance (5 ms), else start one bar later | Follow-up (P3); P4.3 hold-sync must follow the same rule |
| 11 | `transitionPlanner.ts` `laddersFor` / `chooseLadder` and `jugglePatterns.ts` `transitionLadder`: make the ladder a whole phrase - e.g. 4-2-1-1 (A4 B4 A2 B2 A1 B1 A1 B1 = 16 bars, the §41 example), 8-4-2-2 (32) - or else place `incomingPosition` on an incoming phrase start so both tracks' 4-bar groups coincide during the trades; assert in R3 that every cut is on a 4-bar group start of both decks | Follow-up (P3) |
| 12 | `chooseLadder` (`transitionPlanner.ts:218-223`): drop the "latest bar boundary" fallback; when no phrase boundary fits, try the shorter ladder, else do not offer the style | Follow-up (P3) |
| 13 | `chooseLadder`: reject a ladder whose cut beats fall inside a vocal phrase of the deck being cut out (outgoing `vocalActivity` per bar) or cut in mid-phrase on the incoming; route `performLadder` through the planner's vocal/bass/material checks (`conditions`) or record why it skips them | Follow-up (P3) |
| 14 | `laddersFor`: take the juggle layer's `confidencePolicy` (beat + sync + phrase + material) for the pair, not grid confidence alone; `scoreStyles` gate adds the phrase-confidence minimum (`POLICY_MIN.phrase.phrase`) | Follow-up (P3) |
| 15 | `transitionPlanner.ts:343,592`: offer SAFE the `[8,4]` ladder only; cap MUSICAL at 2-bar rungs (e.g. 8-4-2-2); allow 1-bar rungs from PERFORMER, matching `MODE_PATTERNS` (`jugglePatterns.ts:349-355`) | Follow-up (P3) |
| 16 | `scoreStyles`: block `juggleTransition` where `PHASE_BUDGET[setPhase].allowed` is false and while the juggle controller's cooldown has not elapsed (pass `budgetFor` result into the planner input, the way `juggleMode` is passed); `performLadder` re-checks the budget and the controller's abort reasons before starting | Follow-up (P3); P4 must count stand-alone juggles in the same budget |
| 17 | Planner: generate 2-3 ladder variants (the phrase-sized shapes from row 11, a variant ending in a 1-bar A+B payoff before the drop in PERFORMER+) and pick by the juggle memory's novelty (`learnedFor` / `lastJuggle`), not one fixed shape | Follow-up (P3) |
| 23 | `transitionPlanner.ts:404-425` (`planBassHandover`): when the pair may not coexist, hand over with the low-band kill (`setDeckEQKill`, as `juggleDeckSink.ts:112-114`) instead of -12 dB; keep -6 dB for the shared bar. One handover rule for transitions and juggles | Follow-up (covers DJ1 (f)) |
| 29 | `juggleOpportunity.ts:117-118`: before choosing `next`, run `conditions()` on the real pair context (master + next track's analysis, not the double copy); fall back to `double` when it reports vocal/bass/key conflicts | P4-scope |
| 30 | `jugglePatterns.ts:237-255` (`double`): re-align the copy to zero offset (one re-cue of the silent copy, as ResyncDeck already does) before the PAYOFF layer, or kill the copy's low band during the layer; move `double` out of `PHRASE_PATTERNS` or split it into a phrase-level double (bar trades only, MUSICAL) and the beat-level escalation (PERFORMER) | P4-scope (P4 makes MUSICAL doubles the default stand-alone juggle) |
| 32 | P4.3 setup must perform §16's six steps in order (reliable beat, align, bar phase, offset from §16's list, verify phase, then permit) and keep the bend-vs-recue rule of row 9 | P4-scope |

## 3. DJ1 (d)-(g) (`thoughts/shared/plans/2026-10-06-fix-all-open.md:242`)

The juggling plan is the only owner music-theory text audited here; it has no explicit rule for
echo-out crossfader shape or filter-sweep law, so (d) and (e) are judged by its general rules
(§42 resolve gracefully, §30 no arbitrary moves) and by what the code does now.

- **(d) echo-out snaps the crossfader = hard cut.** Planned path FIXED: `crossfadeFor` eases to the
  centre over 2 beats, holds through the tail, completes in the last bar (`transitionPlanner.ts:363-368`).
  Legacy fallback still snaps (`DJQuantizedFX.ts:784-788`), reached from `DJAutoDJ.ts:1109` when no plan
  can be made. Verdict: planned path conforms; legacy fallback DEVIATES (§42 spirit). Fix: legacy
  `echoOutTransition` uses the planned curve (or the fallback runs `fallbackPlan` through the executor).
- **(e) crossfade high-pass jumps ~830 Hz -> 10 kHz at 75 %.** Planned path FIXED: continuous curves, no
  step (`transitionPlanner.ts:435-460`). Legacy `beatMatchedTransition` still steps -0.6 -> -1
  (`DJQuantizedFX.ts:495-499`). Verdict: N-A to the juggling plan (no filter-law rule); legacy remains
  a step. Same fix route as (d).
- **(f) bass swap cuts 12 dB, not a kill.** Still -12 dB on BOTH paths: planned `planBassHandover`
  (`transitionPlanner.ts:408`) and legacy `bassSwapTransition` (`DJQuantizedFX.ts:720`). Verdict:
  DEVIATES from §14/§35 ("intentional bass handover", "avoid low-end collision", "cut A bass, bring B
  bass"); the juggle layer already uses true kills (`juggleDeckSink.ts:112-114`). Fix: row 23.
- **(g) key/energy scales differ between server and browser; Unknown key +5 vs clash +50; key
  confidence unused.** Still open. Server key = unnormalised Krumhansl-Schmuckler dot product
  (`server/src/routes/render.ts:373-389`), server energy = `rms / 0.2` (`render.ts:396-403`); local branch
  energy = `analysis.genre.energy` (`DJPlaylistAnalyzer.ts:332`, `DJPipeline.ts:796`). P1.7b unified only
  the BPM in the server branch (`result.bpm = mg.bpm`); key and energy still come from the server's own
  producer. Smart Sort: `KEY_SCORE.clash = 50`, `KEY_UNKNOWN_PENALTY = 5`, no confidence term
  (`DJPlaylistSort.ts:29-37,64-70`). Verdict: DEVIATES from §31 (every decision carries confidence) and
  from the one-producer rule P1 applied to tempo (§2 by analogy). Fix: playlist key/energy from the same
  `DJTrackAnalysis` summary as BPM (extend P1.7a/b), and Smart Sort weights the key term by key
  confidence, treating low confidence as unknown. Not confirmed: which energy scale the browser essentia
  path uses today (looked at `DJPipeline.ts:796` and `DJPlaylistAnalyzer.ts:332` only).

## 4. Not confirmed / where I looked

- Runtime behaviour: nothing was run. Musical effects (2-bar phrase offset in row 11, bass collision in
  row 30, bend length in row 9) are computed from the code, not heard.
- Row 21 user-control abort during the ladder: relied on the existing tick path
  (`juggleController.ts:231`) and the baseline JUG-S43 item; did not trace each user action.
- Row 26: test files exist in the commits; not executed.
- P4 working-tree edits (DJAutoDJ stand-alone section, telemetry) were deliberately not audited. Risk
  noted for the P4 agent: the P4.3 design puts setup / hold-sync / hand-back state inside `DJAutoDJ.ts`;
  §53 and §56 ask that `DJAutoDJ` stay session-level and the juggle implementation not live there.
