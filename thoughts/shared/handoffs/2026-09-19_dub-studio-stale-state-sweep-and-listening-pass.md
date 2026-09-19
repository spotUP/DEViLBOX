---
date: 2026-09-19
topic: Dub Studio — stale-state sweep, the EQ/bus UI going dead, and the first real listening pass
tags: [dub, autodub, stale-state, musical-clock, mcp, listening-review, x17, x9, x21, o2]
status: implemented
---

# Session handoff — 2026-09-19

21 commits, `985a43fbb..c1a147396`, all pushed, full suite green at every push.

## Task(s)

1. **"find and fix everything stale properly you keep finding stale stuff"** — a systematic
   sweep of one defect class rather than the one-at-a-time whack-a-mole of previous sessions.
2. **"fix both"** — (a) instrument the playing-but-silent incident, (b) sweep the remaining
   divergence classes.
3. **X17** — "i see no action in the eq and dub bus sliders at all they use to move".
4. **The first real listening pass** on the performer (O2), which closed X2 and X14 by ear and
   found a genuine musical bug the measurements had missed.

## The through-line

Nearly every bug this session was **one fact with two owners that silently diverge**. Worth
holding onto, because it kept reappearing in shapes that looked unrelated:

| Where | The two copies |
|---|---|
| `currentGlobalRow` vs `currentRow` | pattern-granular vs per-row position |
| toolbar handlers | render-captured value vs live store |
| MCP server vs bridge | which tools exist |
| EQ snapshot | offline classifier vs live audio |
| `beatPhase`, `dubGrid` | a musical quantity vs a hardcoded constant |
| deck faders | store baseline vs what a move is doing right now |

**A constant standing in for a live signal is the same fault as a stale copy.** That framing is
what found the last and worst bug of the session.

## Recent changes

### Stale-state sweep

- **`resolveTransportRow`** (`src/lib/dub/transportRow.ts`) — every stale transport-row read
  swept; the class is guarded by a test. (`8d0645e7b`)
- **Registered toolbar handlers** (`FT2Toolbar.tsx`) — `handleUndo`/`handleRedo` froze
  `currentPatternIndex` and `handleSave` froze the whole song. Undo was **silent data
  corruption**, not a dead button: it wrote the recovered pattern into whichever pattern
  happened to be open when the toolbar unmounted. Save was worst — already *half* converted to
  `getState()`, so it would have written a mix of current and stale that no reload can detect.
  Tested as a class: `src/components/tracker/__tests__/ft2ToolbarRegisteredHandlers.test.ts`
  walks register block → ref wiring → handler bodies and fails on any render-scoped value read
  without a live re-read. Unclassified new subscriptions fail it too. (`10f78e90a`)
- **MCP tool wiring invariant** — `src/bridge/__tests__/mcpToolWiring.test.ts`. Found
  `get_arrangement_state`: declared, described, in the help catalogue, **no handler anywhere**,
  never implemented in any branch. Left declared (removing an advertised tool is a product
  call) and recorded as a known-dead exemption that is itself asserted. (`4070157a5`)
- **Silence watchdog** — `src/lib/audio/playbackSilenceWatchdog.ts` + `get_playback_silence`.
  Reporter, never a repairer: a version drop takes the mix away for bars and a "fixing"
  watchdog would fight the performer. `SilenceClock` measures elapsed time between sporadic
  polls; silence that began before anyone looked under-reports, which is the right direction
  for something deciding whether to call a fault. (`4070157a5`)

### X17 — three faults wearing one symptom

Each alone was enough to freeze the UI, which is why fixing the first changed nothing visible.

1. **EQ snapshot gated on the offline classifier.** `_eqSnapshot` was built only
   `if (analysis)` from `useTrackerAnalysisStore.currentAnalysis`, which exists only after the
   user runs the ONNX capture-and-classify pipeline **by hand**. Loading a song does not run it,
   so `improvTick` hit `if (!snapshot) return` every tick of an ordinary session. Now fed from
   the live audio bus. Energy is read live **even when analysis exists**, because `genre.energy`
   is one number for the whole song — `energy-reactive` computed `(energy - prevEnergy) === 0`
   forever. (`d104b1f5b`)
2. **`beatPhase` quantized to the row grid.** From `computeMusicalPosition(<integer row>)`, so at
   speed 12 (8 rows/bar) `(barPos*4) % 1` was only ever 0.0 or 0.5 — and `beat-sync` is
   `sin(phase*2π)`, **zero at both**. The driver ran, applied, reported no error, and moved the
   EQ by `2.4e-16`. (`d104b1f5b`)
3. **Deck bus faders were never on the live channel**, and the naive fix would have made them
   lie: `LIVE_HOLD_MS` is 400 ms but a tape hold keeps the return at 0 for *bars*, so a one-shot
   announcement flicks the fader to 0 then climbs back while the audio is still killed. Held
   announcements now refresh every 150 ms (`announceHeld` / `releaseHeldAnnouncement`).
   (`d9a37a512`)

### The listening pass

- **`dubGrid.ts` ran on a beat twice as long as the music.** `ROWS_PER_BEAT = 4` hardcoded,
  under a comment saying rows-per-beat is really `24 / ticksPerRow` and that deriving it from
  live speed was "tracked separately (the MusicalClock work)". **That work had landed**;
  this file was never moved onto it. At speed 6 the constant is right, so it survived. "world
  class dub" runs at **speed 12** → 2 rows/beat. Every quantize boundary was computed against a
  beat of twice the real length, so a move aimed at the next offbeat landed up to a quarter beat
  away — 125 ms at 120 BPM. (`dbc2ab321`)

## Critical references

- `src/engine/dub/dubGrid.ts:32` — `ROWS_PER_BEAT`, now only for callers that mean the
  convention; `liveRowsPerBeat()` below it is what the grid uses.
- `src/lib/dub/musicalClock.ts:94` — `rowsPerBeat(ticksPerRow, beatUnit)`. **The canonical
  answer. Two files had reinvented it as a constant by the end of today.**
- `src/engine/dub/AutoDub.ts` — `resolveBeatPhase()` (sub-row beat phase, re-anchored each
  beat); the EQ snapshot block (`if (analysis || liveAudio)`); `liveEnergy`,
  `liveFrequencyPeaks`.
- `src/engine/dub/AutoEQDriver.ts` — `getAutoEqDiag()`, surfaced via `get_auto_dub_state`.
  **Every gate in `improvTick` is a silent early return**; an inert driver and one holding still
  look identical. This counter is what turned "the EQ is dead" into two specific faults.
- `src/engine/dub/DubBus.ts` — `announce` / `announceHeld` / `releaseHeldAnnouncement`,
  `ANNOUNCE_REFRESH_MS = 150`. Must stay well under `LIVE_HOLD_MS` in
  `src/hooks/useLiveDubParam.ts:26` (400 ms); `dubBusHeldAnnounce.test.ts` holds the two
  together since they live in different files.
- `src/hooks/useProjectPersistence.ts:1080` (boot branch), `:1252` (`discardRecovery`).

## Learnings

- **`DubBusPanel` renders only in the DJ Sampler and DrumPad — never in the tracker Dub Deck.**
  It already had `useLiveDubParam` wired, so earlier announce work looked correct and changed
  nothing the user could see. The deck has its own controls (`DubDeckStrip`, tabs
  perform/eq/bus; the EQ tab is a generic `Fil4EqPanel` driven by `effect.on('params')`).
  **Check which panel is actually on screen before concluding a UI fix failed.**
- **`userMuteMask` reads backwards**: a SET bit means AUDIBLE. `65535` is everything *playing*.
  Misreading it produced a confident diagnosis of a mute leak that did not exist. Documented at
  the read site in `readHandlers.ts`.
- **A weak pass is worth naming as one.** X9's sends looked clean, but the fire log showed
  `ghostReverb`/`echoBuildUp` had never fired — the ratcheting path had not run. Driving it
  directly was a different and much stronger result.
- **Fixed-width source slices in tests rot.** `dryBusRegression` read `dispose()` as
  `+3000` chars; the assertion target sat at offset 2989. Two added lines failed a test whose
  subject was untouched. Brace-match instead.
- **Flaky gates get switched off.** The dist-scanning deploy guard took 5.7 s under full-suite
  load and tripped vitest's 5 s default, blocking a push over a guard that had found nothing
  wrong. Given an explicit 30 s timeout rather than a weaker assertion.
- **Don't ship a plausible fix you cannot reproduce.** For X21 the obvious fix (reset the editor
  on discard) would destroy a song loaded while the prompt is open, since the prompt is not
  modal.

## Artifacts

- Ledger (authoritative): `thoughts/shared/plans/2026-09-17-dub-studio-progress.md` — every X
  thread carries its measurement, and closed entries keep the wrong turns.
- Plan: `thoughts/shared/plans/2026-09-17-dub-studio-revised-ai-performer-plan.md`
- New tests: `ft2ToolbarRegisteredHandlers`, `mcpToolWiring`, `dubBusHeldAnnounce`,
  `playbackSilenceWatchdog`, plus additions to `autoDubEQ` and `dubGrid`.

## State

Gates A–L closed. M–O done except O2. **X threads: 18 of 19.**

## Next steps

1. **O2 re-listen, after the `dubGrid` fix — the one thing that matters.** LOCAL
   `http://localhost:5174` (live is `985a43fbb`, older than all of today; CI dead on GitHub
   billing). Load `public/data/songs/mod/world class dub.mod`, expand DUB DECK, Bus ON, STYLE =
   King Tubby, AUTO DUB, Play Song. Previous verdict: *"it didnt feel very nicely synced"*,
   *"i disrupted the song more than add to it it felt off"*. The eight questions are at
   `progress.md:701`. If a move still lands wrong, capture `get_performance_journal` for the
   intention behind it.
2. **X10** — the last open X thread. Dub bus clipping "most of the time"; measured once at peak
   0.86 with no clipping, so one sample does not clear it.
3. **Watch for a third `rowsPerBeat` reinvention.** Two turned up today. A grep for hardcoded
   `4` against row/beat maths would be cheap insurance.
4. Optional: `get_arrangement_state` — delete the declaration, or implement it. Product call.

## Other notes

- **Never run `npm run test:ci` by hand** — hooks run it; targeted tests + `npm run type-check`.
- Deploy is `git push origin main`; CI has been dead on billing since 2026-08-23, so live still
  serves `985a43fbb`. `scripts/deploy-manual.sh` exists and refuses to sync a bundle containing
  `localhost:3011`.
- MCP measuring gotcha: the agent's own Chrome and the user's browser are separate sessions.
  Confirm which one you are reading before reporting (`get_playback_state` is a quick tell).
  This was got wrong once already on this project.
- `set_auto_dub_config` with only `enabled: true` preserves the user's persona and intensity.
