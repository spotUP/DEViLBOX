---
date: 2026-10-11
topic: Auto DJ juggling that engages - stand-alone juggles, juggle-transition style, module beat grid
tags: [dj, auto-dj, juggling, beat-grid, tempo, nudge, reachability]
status: draft
---

# Auto DJ juggling - build it properly

Owner order 2026-10-11 (thoughts/lars/todos.md DJ-H, line 172-175):

> "a juggle is not only a transition, it could happen anywhere in an artistic
> way to make the music better and excite the crowd"

Three parts, plus the defects that block them:

1. **Stand-alone juggles anywhere in the set.** Triggers: break, build, phrase
   end, energy. The idle deck is loaded with a double of the playing track (or
   the already pre-rendered next track), the juggle runs, control hands back to
   the playing deck.
2. **Juggle-transition as a planner-chosen transition style**, replacing the
   broken prelude (`DJAutoDJ.maybeStartJugglePrelude`). Phase correction of a
   playing deck is a rate bend (nudge), never a seek.
3. **Module beat grid from the song's own timing** (rows / speed / BPM), one
   tempo source per track (playlist store, deck and analysis agree).

Finish line: all four reachability tests in "Checklist" pass through
`getAutoDJ()`; `npm run type-check` clean; ledger items JUG-S26.2, JUG-S27.1,
DJ-F(2), DJ-H, DJ-K (tempo-source part) and the key-lock-latency item ticked
with commits; owner listening checks collected under "Manual verification".

---

## 1. Current state (measured from code, 2026-10-11)

Why juggling never engages, in the domain's terms: **a juggle needs two
playing, phase-locked decks with trusted grids, and Auto DJ never produces that
state outside the last bars before a transition.**

| # | Finding | Evidence |
|---|---------|----------|
| C1 | Outside a mix only one deck plays, so `conditions()` always adds `both decks must play`. No code ever loads the idle deck for a juggle. | `src/engine/dj/autodj/juggle/jugglePlanner.ts:98-99`; no `loadDouble` anywhere (grep `loadDouble|instantDouble|cloneDeck|duplicateDeck` over `src/`: 0 hits) |
| C2 | Prelude starts the incoming deck 8 bars early, fixed, regardless of pattern length; returns when `incomingStart < 0` (common: mix-in near the start). | `src/engine/dj/DJAutoDJ.ts:1674-1679` |
| C3 | Prelude **seeks a playing deck** up to half a bar: `phaseAlign(idle, active, 'bar')` after `play()`. `phaseAlign` always seeks. | `DJAutoDJ.ts:1694-1696`; `src/engine/dj/DJAutoSync.ts:100-134` |
| C4 | After the prelude, `triggerTransition` re-plans (`finalizePlan`, new `incomingPosition`) and the executor **seeks the incoming deck that is already playing** to the new plan's position. | `DJAutoDJ.ts:1089` -> `1533-1546`; `src/engine/dj/autodj/transitionExecutor.ts:237` |
| C5 | During `status === 'transitioning'` the juggle tick passes `NORMAL_MIX`, so the controller aborts any prelude juggle with "transition took over" the moment the transition starts. | `DJAutoDJ.ts:1649`; `juggleController.ts:231` |
| C6 | `DeckEngine.nudge()` only calls `replayer.setNudge()`; Auto DJ decks play in audio mode (pre-rendered WAV), so a nudge is a no-op there. Also affects MCP `dj_nudge` / `DJActions.nudgeDeck` on audio decks. **Unverified at runtime** - from code reading; probe P0.2 confirms. | `src/engine/dj/DeckEngine.ts:857-859`, `DJActions.ts:629-633` |
| C7 | `detectBPM()` ignores speed: it returns the Fxx/Txx tick tempo (or header BPM) as the musical BPM. A song at speed 3 is reported at half its tempo, speed 12 at double. `_speed` parameter unused. | `src/engine/dj/DJBeatDetector.ts:24-104` (param `_speed` at :83) |
| C8 | Four tempo sources for one track: audio analysis `analysis.bpm` (deck grid, `DJTrackAnalysis`), `detectBPM` (deck `detectedBPM` on remote/cached loads, UI browsers), cached `bpm`, server `/render/analyze` bpm (playlist store). The 94 vs 140.95 split in DJ-K is two of these. | `DJTrackLoader.ts:263,273,339,346,383,390,451-458,488-494`; `DJPipeline.ts:766-771`; `DJPlaylistAnalyzer.ts:313,331,503,567` |
| C9 | Module tempo enters `DJTrackAnalysis` only as a 0.45-confidence hypothesis; the grid is always audio-detected, so `beatGrid.confidence` is often < 0.8 and `deckSyncConfidence` < 0.6 -> "unstable sync", "low confidence". | `src/engine/dj/autodj/trackAnalysis.ts:111-124,192-195,242`; `beatGrid.ts:166-167` |
| C10 | A key-locked audio deck plays ~91 ms behind (SoundTouch FIFO), but `getHeardPosition()` subtracts only output latency, so phase locks against a key-locked deck are 91 ms off. | `DeckEngine.ts:966-970`; todos.md:166 |

Reusable mechanisms found (searched: `nudge`, `phaseAlign`, `quantizedPlay`,
`timeOrderPositions`, `rowSeconds`, `applyAnalysisToDeck`,
`loadPreRenderedTrackToDeck`, `getAudioBuffer`, `budgetFor`, `conditions`,
`harmonicCompatibility`, `engageAutoKeyLock`, `PATTERN_BUILDERS`, `trade()`,
`release()`, juggle test harnesses):

- `timeOrderPositions()` / `rowSeconds()` - `src/engine/dj/autodj/trackerMixAnalysis.ts:30-74`: already walks the order list with Fxx/Txx and returns per-row times. The module grid is built on it, not beside it.
- `buildBeatGrids()` - `beatGrid.ts:100`: the one grid builder; gains a fixed-meter input instead of a second builder.
- `DJPipeline.applyAnalysisToDeck()` - `DJPipeline.ts:739`: the one place a deck gets its analysis (pre-rendered load already uses it, `DJTrackLoader.ts:205-207`).
- `quantizedPlay()` - `DJAutoSync.ts:206-254`: start a stopped deck on the master's next bar.
- `restMultiplier` / `setPlaybackRate()` checkpointing - `DeckEngine.ts:822-838`, `DeckAudioPlayer.ts:282-335`: the rate path a bend rides on.
- Juggle stack `src/engine/dj/autodj/juggle/*`: planner budget (`budgetFor`), `conditions`, `trade()` / `release()` builders, executor, sink. Stand-alone juggles and the ladder reuse them.
- `engageAutoKeyLock` / `releaseAutoKeyLock` - `transitionExecutor.ts:127-140`.
- Test harness - `src/engine/dj/__tests__/autoDJJuggleReachesTheDecks.test.ts` (fake engine, fake timers, `getAutoDJ()`, corpus analyses).

---

## 2. Levels considered (analysis before the first edit)

- **Tempo disagreement (part 3).** Levels: (a) presentation - pick one number
  to display; (b) analysis - one function produces tempo + grid for a module and
  every consumer reads it; (c) data - store the module grid in the audio cache.
  Root is (b): the defect is that four producers exist. (a) is a band-aid; (c)
  follows from (b) via `DJ_ANALYSIS_VERSION` bump, no new storage.
- **Turntable jumps (C3/C4).** Levels: (a) visual smoothing of the platter;
  (b) phase-correction algorithm - bend, never seek, a playing deck; (c)
  transition orchestration - never start the incoming deck before the executor
  owns it. Root is (b) + (c). (a) would hide an audible skip.
- **Juggling never engages (C1/C5/C9).** Levels: (a) loosen gates
  (thresholds); (b) produce the two-deck state the gates rightly require
  (load a double, phase-lock it); (c) better grids so confidence is real.
  Root is (b) + (c). (a) is the red-flag "tolerate" fix and is rejected.

---

## 3. Phases

### Phase P0 - Probes (measure before coding)

No product code. Results recorded in this file under "P0 results" before P1.

- **P0.1** Count today's juggle reachability: with MCP, Auto DJ on, mode MUSICAL, one 10-minute run; read `dj_auto_dj_explain` juggle telemetry `safety` every minute. Expected: `blocked: both decks must play` outside the pre-transition window. Record the reason histogram.
- **P0.2** Confirm C6: MCP `dj_get_state` on an Auto DJ deck (playbackMode `audio`), call `dj_nudge` with a large offset, read the deck position before/after over 2 s vs the other deck. Expected: zero change.
- **P0.3** Tempo truth for the DJ-K pair: compute `timeOrderPositions()` for `ultraux vision` and `imaginia` (scratch script in the session scratchpad, imports the real module), print initial speed/BPM, the Fxx/Txx changes, walk duration, musical BPM `6*bpm/speed`; compare with the playlist store value (94) and the deck value (140.95) and the rendered WAV duration. Names which producer is wrong.
- **P0.4** Module walk vs render agreement on the affected subset only: the 30 most recently played tracker tracks in the owner's playlists (`dj_get_playlist_state`), ratio `walkEnd / renderedDuration`. Decides the acceptance tolerance (P1 default 2 %). Resumable: rows appended to `test-data/module-grid-agreement.json`, skip rows already present.
- **P0.5** Key-lock latency: read the SoundTouch FIFO size from `DeckKeyLock` config and measure with the existing latency probe used for the 103 vs 12 ms figure (todos.md:166). Record the number the code will report (P2.4), not a constant.

Success: five numbers/histograms recorded; C6 confirmed or struck from the plan.

### Phase P1 - Module beat grid, one tempo source (part 3)

**P1.1 New pure module** `src/engine/dj/autodj/moduleBeatGrid.ts`

```ts
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { timeOrderPositions, rowSeconds } from './trackerMixAnalysis';

/** Tracker convention: 4 rows a beat, 4 beats a bar (also used by trackerMixAnalysis). */
export const TRACKER_ROWS_PER_BEAT = 4;
export const TRACKER_BEATS_PER_BAR = 4;
/** Walk-vs-render agreement needed before the song's timing is trusted (P0.4 sets it). */
export const MODULE_GRID_TOLERANCE = 0.02;

export interface ModuleBeatGrid {
  beats: number[];      // seconds, on the rendered audio
  downbeats: number[];  // seconds; bar 1 = row 0 of every order position
  bpm: number;          // musical BPM, time-weighted over the song: 6 * tickBpm / speed at 4 rows a beat
  beatsPerBar: number;
  confidence: 1;
  source: 'module';
}

/** Musical BPM of a tick tempo and speed (4 rows a beat). */
export function musicalBpm(speed: number, tickBpm: number): number {
  return 60 / (TRACKER_ROWS_PER_BEAT * rowSeconds(speed, tickBpm));
}

/** The song's own grid, or null when the timing walk does not match the rendered audio. */
export function moduleBeatGrid(song: TrackerSong, renderedDurationSec: number): ModuleBeatGrid | null {
  const { positions, rowTimes } = timeOrderPositions(song);
  const walkEnd = positions[positions.length - 1]?.end ?? 0;
  if (walkEnd <= 0 || renderedDurationSec <= 0) return null;
  const scale = renderedDurationSec / walkEnd;
  if (Math.abs(scale - 1) > MODULE_GRID_TOLERANCE) return null;
  const beats: number[] = []; const downbeats: number[] = [];
  let weighted = 0;
  rowTimes.forEach((times, p) => {
    for (let r = 0; r < times.length; r += TRACKER_ROWS_PER_BEAT) {
      const t = times[r] * scale;
      beats.push(t);
      if (r % (TRACKER_ROWS_PER_BEAT * TRACKER_BEATS_PER_BAR) === 0) downbeats.push(t);
    }
    const dur = positions[p].end - positions[p].start;
    const rows = Math.max(1, times.length);
    weighted += (60 * rows / TRACKER_ROWS_PER_BEAT / Math.max(1e-6, dur)) * dur;
  });
  return { beats, downbeats, bpm: Math.round((weighted / walkEnd) * 100) / 100, beatsPerBar: TRACKER_BEATS_PER_BAR, confidence: 1, source: 'module' };
}
```

**P1.2 Extend `timeOrderPositions()`** (`trackerMixAnalysis.ts:42`) to honour
`Dxx` pattern break (rows truncate at the break row + 1, the next position
starts at the break target row) and to stop at a backward `Bxx` (song loop).
Without it songs with breaks fail the P1.1 agreement check and silently fall
back to the audio grid. `trackerMixAnalysis` gets the same (correct) timing.

```ts
// inside the row loop, after the tempo scan:
const brk = breakAt(song.format, pattern, r); // { kind: 'D' | 'B', target } | null, reads effTyp 0x0D / 0x0B (S3M/IT: 0x03 / 0x02)
times.push(t); t += rowSeconds(speed, bpm);
if (brk) { if (brk.kind === 'B' && brk.target <= pos) { stop = true; } nextStartRow = brk.kind === 'D' ? brk.target : 0; break; }
```

Effect numbering is read from the same table `isTempoCommand` uses (one
format switch for tempo and flow commands, `trackerMixAnalysis.ts:36-39`).

**P1.3 `detectBPM()` returns musical BPM** (`DJBeatDetector.ts:24`): scan Fxx/Txx
speed AND tempo; result `musicalBpm(speed, tempo)` of the dominant pair. Fixes
the 10 UI call sites (`DJPlaylistModal`, `DJPlaylistPanel`, `DJModlandBrowser`,
`DJFileBrowser`, `DJView`) and the loader at once. `confidence: 'exact'` keeps
its meaning.

**P1.4 `buildBeatGrids()` gains a fixed meter** (`beatGrid.ts:12-21,100`):

```ts
export interface BeatGridInput {
  // ...existing
  /** Known meter and phase (module timing): skips the phase search, grid confidence = this value. */
  fixed?: { beatsPerBar: number; phase: number; confidence: number };
}
// in buildBeatGrids:
if (input.fixed) { beatsPerBar = input.fixed.beatsPerBar; phase = input.fixed.phase; meterConfidence = input.fixed.confidence; }
else if (extended && beats.length >= 8) { /* existing search */ }
...
const gridConfidence = input.fixed ? input.fixed.confidence : (beats.length === 0 ? 0 : Math.min(1, 0.5 * bpmConfidence + 0.5 * regularity));
```

**P1.5 `buildDJTrackAnalysis()` uses the module grid when it exists** (`trackAnalysis.ts:186-195,242-248`):

```ts
const mg = song ? moduleBeatGrid(song, durationSec) : null;
const tempo = mg
  ? { beats: mg.beats, downbeats: mg.downbeats, bpm: mg.bpm, bpmConfidence: 1, timeSignature: mg.beatsPerBar, fixed: { beatsPerBar: mg.beatsPerBar, phase: 0, confidence: 1 } }
  : { beats: analysis.beats, downbeats: analysis.downbeats, bpm: analysis.bpm, bpmConfidence: analysis.bpmConfidence, timeSignature: analysis.timeSignature };
const grids = buildBeatGrids({ ...tempo, extended: ext, durationSec });
// bpm / bpmConfidence / tempoHypotheses / analysisConfidence.beatGrid read `tempo`, not `analysis`;
// tempoHypotheses(tempo.bpm, tempo.bpmConfidence, onsetsPerBeat, null) when mg (the module IS the normal hypothesis).
// extra field on DJTrackAnalysis: tempoSource: 'module' | 'audio'
```

Bump `DJ_ANALYSIS_VERSION` 2 -> 3 (`trackAnalysis.ts:24`) so cached summaries
rebuild; `DJPipeline.ts:167` already re-analyses on a version mismatch.

**P1.6 Deck grid and BPM read the analysis** (`DJPipeline.applyAnalysisToDeck`, `DJPipeline.ts:765-772`):

```ts
beatGrid: trackAnalysis
  ? { beats: trackAnalysis.beatGrid.beats.map((b) => b.time), downbeats: trackAnalysis.downbeats.bars.map((b) => b.start), bpm: trackAnalysis.bpm, timeSignature: trackAnalysis.meter.beatsPerBar }
  : { beats: analysis.beats, downbeats: analysis.downbeats, bpm: analysis.bpm, timeSignature: analysis.timeSignature },
detectedBPM: trackAnalysis?.bpm ?? analysis.bpm,
effectiveBPM: (trackAnalysis?.bpm ?? analysis.bpm) * Math.pow(2, deckState.pitchOffset / 12),
```

The interim `detectedBPM` written by `loadAudioToDeck` (`DJEngine.ts:206-209`)
and the loader (`DJTrackLoader.ts:263-273,339-346,383-390,451-458,488-494,577-583,625-631`)
now comes from the fixed `detectBPM` and is replaced by the analysis value as
soon as `applyAnalysisToDeck` runs. Same song, same function, same number.

**P1.7 Playlist BPM from the same analysis.**
- `DJAutoDJ.anticipate()` (`DJAutoDJ.ts:1521-1523`): write `{ bpm: summary.bpm, djSummary: summary }` always (not only when `!track.djSummary`), so the playlist converges on the deck's number.
- `DJPlaylistAnalyzer.ts:313,331,503`: `bpm` from `summaryFromPipeline(pipelineResult, track.id, song)` where `song = getCachedSong(fileName) ?? await parseModuleToSong(new File([bytes], name))` for non-audio, non-SID files (the one parse path, `src/lib/import/parseModuleToSong.ts:48`). Server branch (`:567`): same, with the server's duration.

**P1 automated verification**
- `npm run type-check`
- `VITEST_MAX_WORKERS=2 npx vitest run src/engine/dj/autodj/__tests__/moduleBeatGrid.test.ts src/engine/dj/__tests__/detectBPMIsSpeedAware.test.ts src/engine/dj/__tests__/autoDJModuleTempoIsTheOneTempo.test.ts`
- Pure tests (where they live, `moduleBeatGrid.test.ts`): speed 6 / tempo 125 -> 125 BPM; speed 3 -> 250; Dxx at row 32 halves the pattern; backward Bxx ends the walk; render 5 % longer -> null; downbeat every 16 rows from each pattern start.
- Regression `detectBPMIsSpeedAware.test.ts`: song with F03 + F7D reports 250, not 125 (fails on current `DJBeatDetector.ts`).

**P1 as built (decisions and corrections, 2026-10-11)**
- **P1.3 premise was wrong.** `6 * tempo / speed` assumes 4 rows a beat. Owner test FAIL on 272983a45: "ultraux vision" (speed 3 / tempo 141) read 272-282; the owner hears ~136-141, a beat every 8 rows. Rows per beat now come from the song (`songRowsPerBeat`, `moduleBeatGrid.ts`): the 24-ticks-a-beat convention (`musicalClock.rowsPerBeat`, the Auto Dub rule: 4 rows at speed 6, 8 at speed 3) is the default; the percussion channels' backbeat (snare-like sound on beats 2 and 4) replaces it with half that when it fits clearly better (margin 0.15) and the tempo stays in 60-200 BPM. Only the finer level may replace it: a half-time kick-1 / snare-3 pattern must not halve a song (corpus tracker track stays 125). ultraux vision now: **141 BPM**, 8 rows a beat. The speed 3 / tempo 125 numbers in R1 and the P1 tests are 125, not 250.
- **One BPM per track:** grid BPM and `detectBPM` both report the speed/tempo pair the song plays longest (not a time-weighted mean: ultraux vision's closing slow-down dragged that to ~136).
- **No stretch onto the render:** beats sit at the walk's times; a render longer than the walk is its tail. Stretching moved the corpus tracker track 125 -> 123. The 2 % agreement check stays (P0.4 default, not yet measured).
- **Capped preview renders:** the playlist analyser renders 90 s; `renderCapSec` skips the length check and grids the rendered part.
- **Versioning:** `DJ_ANALYSIS_VERSION` 3 marks the analysis/summary format; the audio-cache gate is now `DJ_AUDIO_ANALYSIS_VERSION` (still 2). Bumping the cache gate would re-analyse every cached track for nothing (the audio analysis did not change, and the cache version never rebuilt playlist summaries). No persisted shape changed (`tempoSource` lives on DJTrackAnalysis only), so no localStorage migration. Stale playlist BPMs converge through anticipate (P1.7a) and the analyser.
- **Walk:** S3M/IT effects are normalised to XM numbering by their importers, so `isTempoCommand`'s 0x14 branch was a defect (S3M/IT speed changes unseen, XM Kxx read as tempo); fixed. E6x pattern loops / EEx pattern delay are not followed: such songs fail the agreement check and use the audio grid.
- **Fixed meter:** bars are the module's downbeats (a Dxx-shortened pattern makes a short bar) instead of `phase: 0`.
- **Manual deck loads (found by live MCP probe):** `loadPlaylistTrackToDeck` left `beatGrid` null (cached-audio path never applied the analysis; render paths applied it before `loadAudioToDeck`, whose .wav fileName change clears the grid, with the previous song). All paths now apply after the load (4ab6c5b1c). DJ view browsers that load without `loadPlaylistTrackToDeck` were not checked.

**P1 success criteria**: for a module whose walk matches its render, deck
`detectedBPM`, deck `beatGrid.bpm`, `trackAnalysis.bpm` and playlist `bpm` are
equal to 0.01 BPM; `trackAnalysis.beatGrid.confidence === 1`;
`tempoSource === 'module'`. For a mismatching render all four equal the audio
value and `tempoSource === 'audio'`.

### Phase P2 - Phase correction bends, never seeks, a playing deck (DJ-F (2))

**P2.1 `DeckEngine.bendRate(ratio, durationMs)`** (`DeckEngine.ts`, next to `nudge`, :857):

```ts
/** Temporary rate bend around the rest rate (a jog-wheel push). Store pitch is not touched. */
bendRate(ratio: number, durationMs: number): void {
  if (this._repitchLocked || this._isScratchActive) return;
  const r = Math.max(0.94, Math.min(1.06, ratio));
  clearTimeout(this._bendTimer);
  if (this._playbackMode === 'audio') { this.audioPlayer.setPlaybackRate(this.restMultiplier * r); this.stemPlayer.setPlaybackRate(this.restMultiplier * r); }
  else this.replayer.setTempoMultiplier(this.restMultiplier * r);
  this._bendTimer = setTimeout(() => this.setPitch(this._currentPitchSemitones), durationMs);
}
```

Restore goes through `setPitch()` (the one rate path, key-lock aware) - no
second restore path. `dispose()` and `stop()` clear `_bendTimer`.

**P2.2 `DeckEngine.nudge()` in audio mode** routes to `bendRate(1 + offset * 0.01, ticks * 20)`; tracker mode unchanged. Fixes C6 for `DJActions.nudgeDeck` and MCP `dj_nudge`.

**P2.3 `phaseAlign()` method by deck state** (`DJAutoSync.ts:100`):

```ts
export function phaseAlign(deckId: DeckId, otherDeckId: DeckId, mode: SyncMode = 'beat', method: 'auto' | 'seek' = 'auto'): void {
  // ...existing phase math -> errorSec = phaseDiff * period
  const playing = isDeckPlaying(deckId); // engine first, store fallback (same pattern as DJAutoDJ.deckPlaying)
  if (method === 'auto' && playing) { bendToPhase(deckId, errorSec); return; }
  const seekTarget = thisPosition + errorSec;
  if (seekTarget < 0) return;
  seekDeck(deckId, seekTarget);
}

/** Close a phase error on a playing deck by a rate bend: up to 6 %, at least 1 %, finished in about 2 s for small errors. */
export function bendToPhase(deckId: DeckId, errorSec: number): void {
  if (Math.abs(errorSec) < 0.003) return;
  const amount = Math.min(0.06, Math.max(0.01, Math.abs(errorSec) / 2));
  getDJEngine().getDeck(deckId).bendRate(errorSec > 0 ? 1 + amount : 1 - amount, (Math.abs(errorSec) / amount) * 1000);
}
```

Callers keep their call; behaviour changes only for playing decks
(`DJQuantizedFX.ts:452,597,633,700,777`, `DeckEngine.ts:1291`,
`juggleDeckSink.ts:107`, `DJActions.ts:190,297`, `DJAutoSync.ts:145,250,346`).
`DJKeyboardHandler.tsx:316,392` (the user's own sync key) pass `'seek'`
explicitly: a user-pressed sync stays an instant snap.

**P2.4 Heard position includes key-lock latency** (C10): `DeckKeyLock.latencySec()` returns the FIFO latency measured in P0.5 when active, 0 when bypassed; `DeckEngine.getHeardPosition()` subtracts it; `getCurrentPosition()` in `DJAutoSync.ts:368` reads the heard position (`deckPositionAt` already models the store clock; it gains the latency term). Phase math in P2.3 then locks what the listener hears.

**P2 automated verification**
- `npm run type-check`
- `VITEST_MAX_WORKERS=2 npx vitest run src/engine/dj/__tests__/deckBendRestoresTheRate.test.ts src/engine/dj/__tests__/autoDJPhaseCorrectionNeverSeeksAPlayingDeck.test.ts`
- Unit (where it lives): `bendRate` in audio mode sets `restMultiplier * r` then restores exactly `restMultiplier` (fake timers); scratch active -> no change; key lock on -> restore keeps SoundTouch compensation.
- Regression: `dj_nudge` on an audio deck changes the playback rate (fails today, C6).

**P2 as built (2026-10-11, deviations from the text above)**
- P0.5 measured offline, not in the browser: a native impulse probe of the
  wrapper's SoundTouch setup (48 kHz, 128-frame blocks) gave 90.7 / 87.0 /
  90.7 / 83.3 ms at 0 / -1 / +1 / -3 semitones; `SETTING_INITIAL_LATENCY`
  reports 91.7 / 88.2 / 94.6 / 81.4 ms. The code reports that setting: new
  wrapper binding `getLatencyFrames`, the worklet posts `{type:'latency'}`
  after init and every parameter change, `DeckKeyLock.latencySec()` returns
  it while routed through the worklet. WASM rebuilt (emcc 4.0.16).
- `getCurrentPosition()` (DJAutoSync) reads `DeckEngine.getHeardPosition()`
  for audio decks instead of the store anchor: the anchor lags a seek until
  the next 20 Hz deck-state write, so a correction right after seek + play
  (the prelude) measured the deck at its pre-seek position. Tracker decks and
  a missing engine keep the anchor.
- `bendToPhase` divides the bend length by the fader rate (a bend of `a`
  gains `rest * a` track seconds per second). With key lock on, `bendRate`
  also moves the SoundTouch compensation so the bend keeps the key.
- `stop()` ends a pending bend (restores the fader rate), not only clears the
  timer; the restore skips while a scratch holds the deck.
- R2 enters through the juggle prelude (the only live phase correction of a
  playing deck through `getAutoDJ()` today). P3.8a deletes the prelude: R2
  must then move to the ladder setup with the same assertions.

**P2 success criteria**: across one simulated Auto DJ juggle-transition
(P3 reachability test) zero `seek` calls land on a deck whose `isPlaying()` is
true; phase error after the bend < 5 ms.

### Phase P3 - Juggle-transition as a transition style (part 2)

**P3.1 Style** (`src/engine/dj/autodj/types.ts:569-579`): add `'juggleTransition'` to `TransitionStyle` and `TRANSITION_STYLES`. Plan field:

```ts
export interface DJTransitionPlan {
  // ...existing
  /** juggleTransition only: the trading ladder that runs before the release. */
  juggle?: { ladderBars: number[]; tradeBeats: number };
}
```

**P3.2 Planner input** (`transitionPlanner.ts`, `TransitionPlanInput`): `juggleMode: JuggleMode`; `sessionController.ts:222,231` passes `s.autoDJJuggleMode`.

**P3.3 Scoring** (`scoreStyles`, `transitionPlanner.ts:215-274`), after the cut block:

```ts
// A juggle transition (juggling plan section 26): trade the two tracks down a ladder into the incoming drop.
const juggleOk = ctx.juggleMode !== 'OFF' && ctx.juggleMode !== 'SAFE'
  && (ctx.tempoBand === 'none' || ctx.tempoBand === 'normal')
  && ctx.clashRisk <= HARMONIC_CLASH_REJECT && ctx.vocalRisk < 0.5 && ctx.drumScore >= 0.5
  && gridConf >= POLICY_MIN.phrase.beat && ctx.ladderFits;
if (juggleOk) add('juggleTransition', 0.5 + ctx.creativeRisk * 0.3 + (ctx.setPhaseIsPeak() ? 0.2 : 0) + (ctx.juggleMode === 'PERFORMER' || ctx.juggleMode === 'AGGRESSIVE' || ctx.juggleMode === 'CHAOS' ? 0.15 : 0), 'compatible grids, keys and drums: trade the tracks into the drop');
```

Same thresholds as the juggle layer (`POLICY_MIN`, `HARMONIC_CLASH_REJECT`) -
one gate vocabulary. Repetition penalty `rep()` applies as for every style.

**P3.4 Ladder and timing** in `planTransition` (`transitionPlanner.ts:446+`):
`ladderBars = gridConf >= POLICY_MIN.beat.beat ? [4, 2, 1] : [8, 4]`;
`tradeBeats = 2 * sum(ladderBars) * beatsPerBar` (each rung: outgoing then
incoming). The release is the existing curve machinery with
`durationBars = 1` (crossfader to incoming on the drop). `incomingPosition` =
incoming mix-in (`chooseMixIn`, drop preferred) minus `tradeBeats` seconds;
`ladderFits` = that is >= 0 and the outgoing has `tradeBars + 2` bars of room
(else try the shorter ladder; else not offered). `startTimeSec` is the trade
start. `DJAutoDJ.getTransitionDurationSec()` (`DJAutoDJ.ts:1389`) adds
`plan.juggle.tradeBeats` so the trigger lead covers the ladder.

**P3.5 Ladder pattern** (`jugglePatterns.ts`): new builder, not offered to the
stand-alone planner (absent from `MODE_PATTERNS`):

```ts
export function transitionLadder(p: PatternParams & { ladderBars: number[]; target: 'A' | 'B' }): DJJugglePattern {
  const b = newBuilder();
  for (const bars of p.ladderBars) trade(b, p.primary, bars * p.beatsPerBar, 1, bars >= 4 ? 'ESTABLISH' : 'INTENSIFY', bars >= 2 ? 'bar' : 'beat');
  phase(b, 'RELEASE', b.beat, b.beat);
  release(b, p.target, b.beat, 'release into the incoming drop');
  return finish('transitionLadder', p, b, { energyProfile: 'BUILD', reason: `${p.ladderBars.join(' -> ')} bar trades into the incoming`, targetDeck: p.target });
}
```

`DJJugglePatternType` gains `'transitionLadder'`; `PATTERN_INTENSITY.transitionLadder = 0.6`.

**P3.6 Controller entry** (`juggleController.ts`): 

```ts
/** Run the planned ladder now (transition executor's trade stage). Resolves when released or aborted. */
performLadder(input: TickInput, ladder: { ladderBars: number[]; target: AB }): Promise<JuggleExecutionResult>
```

Builds the pattern with `primary = input.masterDeck`, starts it on the next
bar of the master clock through the existing `start()` path (history, memory,
telemetry, abort checks unchanged), resolves from `exec.done`. Add
`onFinish?: (r: JuggleExecutionResult) => void` to `JuggleControllerDeps`,
called from `finish()` (P4 uses it too).

**P3.7 Executor trade stage** (`transitionExecutor.ts`):

```ts
export interface ExecuteOptions {
  // ...existing
  /** juggleTransition: perform the ladder between the incoming start and the release. */
  performTrade?: (juggle: NonNullable<DJTransitionPlan['juggle']>) => Promise<{ completed: boolean }>;
}
// run(): after "Start" (incoming play on the grid, :258-261) and before the curve interval:
if (plan.style === 'juggleTransition' && plan.juggle && opts.performTrade) {
  trace.events.push(`juggle ladder ${plan.juggle.ladderBars.join('-')}`);
  const r = await opts.performTrade(plan.juggle);
  if (cancelled) return;
  if (!r.completed) trace.events.push('ladder aborted: release now');
}
```

The incoming deck is cued while stopped (`:237`, unchanged and correct) and
started on the grid like every transition - no early start, no seek of a
playing deck.

**P3.8 Auto DJ wiring** (`DJAutoDJ.ts`):
- Delete `maybeStartJugglePrelude()` (`:1657-1703`), `jugglePreludeStarted` (`:139-140,345,1249`) and the call at `:1634`.
- `executePlan()` (`:1549`) passes `performTrade: (j) => this.getJuggle().performLadder(this.tickInput('JUGGLE_TRANSITION'), { ladderBars: j.ladderBars, target: this.ab(this.idleDeck) })`. `tickInput()` is extracted from `juggleTick` (`:1636-1650`) so both build the input one way.
- `juggleTick` performance mode: `this.execution?.plan.style === 'juggleTransition' && j.isActive() ? 'JUGGLE_TRANSITION' : transitioning ? 'NORMAL_MIX' : 'JUGGLE'` (fixes C5).
- `finalizePlan()` (`:1533`): when the anticipated `this.plan` exists and its incoming analysis is the deck's, keep it (no re-plan between anticipation and trigger for any style; the re-plan moved `incomingPosition` under C4). Re-plan only when `this.plan` is null.

**P3 automated verification**
- `npm run type-check`
- `VITEST_MAX_WORKERS=2 npx vitest run src/engine/dj/__tests__/autoDJJuggleTransitionReachesTheDecks.test.ts src/engine/dj/autodj/__tests__/transitionPlannerJuggleStyle.test.ts src/engine/dj/__tests__/autoDJBeatJuggling.test.ts src/engine/dj/__tests__/autoDJGoldenTransitions.test.ts src/engine/dj/__tests__/autoDJPlannedTransitionReachesTheDecks.test.ts`
- Unit (`transitionPlannerJuggleStyle.test.ts`): offered for a compatible corpus pair in MUSICAL; not offered in OFF/SAFE, extreme tempo band, key clash, vocal risk, or no room; ladder `[4,2,1]` at grid 1, `[8,4]` at grid 0.7; `incomingPosition + tradeBeats*beatSec` equals the mix-in.
- Existing golden/plan tests keep passing (style list grew; no other style's score moved).

**P3 as built (2026-10-11, deviations from the text above)**
- `juggleMode` is optional on `TransitionPlanInput` (default OFF), so every
  existing caller and golden test plans exactly as before.
- Ladders: `laddersFor()` = `[4,2,1]` then `[2,1]` on a beat-level grid,
  `[8,4]` then `[4,2]` on a phrase-level grid ("try the shorter ladder" read
  as the halved ladder).
- The ladder's start is aimed so it ends where an ordinary transition would
  hand over (the preliminary mix-out plus the provisional length), clamped to
  the room; the first phrase that fits made the outgoing leave at a third of
  the corpus track. When no boundary fits from the aim, the latest bar start
  that leaves the room.
- Mix-in: the drop when it has the ladder's length before it, else the best
  mix-in when it has; a mix-in at the start (most intros, e.g. the corpus) is
  traded from and the release lands the ladder's length later. Without this
  the style was never offered on a track whose mix-in is 0.
- Gates tested where they live (`scoreStyles`): the corpus clash pair is
  resolved by the key solver (semitone shift, clash risk 0.07) and the vocal
  pair's overlap risk is 0.28, so a whole plan cannot show those gates.
- Release: `crossfadeFor` / `planBassHandover` / `filterFor` treat
  `juggleTransition` like `hardCut` (a cut at the start of the release bar,
  full-range EQ, no filter); `humanize.startOffsetMs` is 0 (cuts from the
  first beat). `fallbackPlan` drops the `juggle` field.
- `DJJugglePatternType` gains `transitionLadder`; the planner's candidates are
  `LibraryPatternType` (all but the ladder); `PATTERN_BUILDERS` is keyed by
  the library type.
- `performLadder` starts on the bar the incoming started on (within a quarter
  beat), else the next bar; the executor's `onSweepStarted` still fires before
  the ladder (the poll loop's completion check also needs the outgoing
  stopped, which only the executor's finish does).
- The ladder setup (Auto DJ `performTrade`) bends the incoming onto the
  outgoing's bars before trading: R2 now proves the bend there (incoming grid
  40 ms off its audio start).
- `finalizePlan` keeps the anticipated plan only while it still holds: same
  deck roles, the outgoing deck analysed, the same incoming track
  (analysis id), its start not passed. Otherwise it re-plans (plan text said
  "re-plan only when null").
- Added (found while wiring): the transition watchdog was a fixed 45 s; an
  8-4 ladder at 125 BPM is 46 s. It is now max(45 s, (wait to start + trade +
  release) x 1.5 + 10 s) per executed plan; regression in R3's file.
- Added: the executor never seeks an incoming deck that already plays (the
  user started it); it keeps its place and is bent into phase.
- Juggle sink (must-do from review): `ResyncDeck` measures the double's
  offset from the other deck's live position, bends a playing copy within
  half a beat and re-cues it with one exact seek only for a larger offset
  (re-cueing the silent copy a bar ahead is musically a cue jump).
  `JumpToBar` stays a seek: it is a cue jump by intent (needle drop on the
  call / response / fill material, on the bar the deck is cut in on, the deck
  silent until then); it now lands on the master's phase.
- R3 shares `src/engine/dj/__tests__/juggleTransitionHarness.ts` with R2; the
  harness warms the trigger's dynamic imports (a cold import let the fake
  clock pass the plan start).

**P3 success criteria**: the ladder pattern fires 6 cuts + 1 release on
master-grid beats `0, 16, 32, 40, 48, 52, 56` (4/4, ladder 4-2-1) +-1 executor
tick; final crossfader on the incoming; outgoing stopped at the end of the
release; zero seeks on playing decks.

### Phase P4 - Stand-alone juggles anywhere in the set (part 1)

**P4.1 Triggers** - new pure function in `src/engine/dj/autodj/juggle/juggleOpportunity.ts`:

```ts
export type JuggleTrigger = 'break' | 'build' | 'phraseEnd' | 'energy';
export interface JuggleOpportunity { trigger: JuggleTrigger; source: 'double' | 'next'; startBeat: number; reason: string }

/**
 * Whether to set up a stand-alone juggle now. Evaluates the master deck as if
 * the idle deck held a phase-locked double (same analysis, sync 1): the
 * planner's own budget, conditions and confidence policy decide, plus a
 * musical trigger within the next phrase. Null = not now (reasons in `why`).
 */
export function juggleOpportunity(ctx: DJJugglePerformanceContext, mode: JuggleMode, next: { analysis: DJTrackAnalysis; compatible: boolean } | null, why: string[]): JuggleOpportunity | null
```

- Hypothetical context: `ctx` with the idle deck replaced by the master's state (`playing: true`, `sameTrackOnBothDecks: true`, `deckSyncConfidence: 1`); then `budgetFor()` + `conditions()` + `confidencePolicy()` (no new thresholds).
- Triggers, first match wins: `break` - `nextSection.kind === 'breakdown'` starts within one phrase; `build` - `nextSection.kind` in `build | pre-drop` within one phrase; `phraseEnd` - `phrasePosition >= 0.75` and `phraseConfidence >= POLICY_MIN.phrase.phrase`; `energy` - `targetEnergy - energy >= 0.15`.
- Transition guard: `transitionApproachingSec === null || > setupSec + patternSec + 30`.
- Source: `next` when the next track is pre-rendered, `compatible` (tempo band `none|normal` from `solveTempo`, `harmonicCompatibility` clash <= reject) and the transition is <= 180 s away (a tease of what comes); otherwise `double`.

**P4.2 Load a double** - `DJTrackLoader.loadDoubleToDeck(source: DeckId, target: DeckId): Promise<boolean>`:
- Reuse the source deck's decoded buffer: extract the post-decode tail of `DeckAudioPlayer.loadAudioFile()` (`DeckAudioPlayer.ts:~105-135`, from `new Tone.ToneAudioBuffer(audioBuffer)` on) into `useDecodedBuffer(audioBuffer, peaks)`; `loadAudioFile` calls it after decoding; new `DeckEngine.loadDecodedAudio(buffer, peaks)` calls it directly. No re-decode, no re-render.
- `DJEngine.loadDecodedAudioToDeck(id, audioBuffer, meta, song?)` shares the store-update tail with `loadAudioToDeck` (`DJEngine.ts:179-217`) - extract `afterAudioLoaded(id, info, meta, song)`; song = `getCachedSong(fileName)` (the remap at `:186` mutates per deck, so the source deck's object is never reused).
- Analysis: `getDJPipeline().applyAnalysisToDeck(target, sourceDeckPipelineAnalysis)` is not available (the pipeline result is not kept per deck), so the target's store fields `trackAnalysis, beatGrid, musicalKey, keyConfidence, detectedBPM, frequencyPeaks, rmsDb, peakDb` are copied from the source deck in one `setDeckState` - same track, same analysis object, no second analysis.

**P4.3 Setup / hold / hand-back** in `DJAutoDJ` (new private section next to `juggleTick`):

```ts
private standalone: { phase: 'loading' | 'cued' | 'running'; trigger: JuggleTrigger; source: 'double' | 'next'; deck: DeckId; since: number } | null = null;
```

1. In `juggleTick`, when `status === 'playing'`, mode != OFF, `!j.isActive()`, `!this.standalone`, `!this.preloading` and `juggleOpportunity(...)` returns an opportunity -> `startStandalone(op)`.
2. `startStandalone`: crossfader stays on the master (`setCrossfader(active === 'A' ? 0 : 1)`); `double` -> `loadDoubleToDeck(active, idle)`; `next` -> `loadPreRenderedTrackToDeck(pre.data, pre.track, idle)`, `this.preRenderedTrack = null`, `this.preloadedDeck = idle` (the later transition finds it loaded, `DJAutoDJ.ts:997-999`). Cue (deck stopped, seek is correct): `double` -> master position at its next downbeat; `next` -> incoming `bestMixIn` snapped to a phrase start. `syncBPMToOther(idle, active)`, `engageAutoKeyLock(idle, |semitones| > 0.5)`, then `quantizedPlay(idle, 'bar')` (`DJAutoSync.ts:206`).
3. Hold-sync while `standalone` exists and both play: each juggle tick, `bendToPhase(idle, phaseErrorSec)` when the heard-position error > 3 ms (P2.3/P2.4).
4. The controller's normal `tick()` now sees two playing decks and plans with its full library (`double`-family patterns allowed because `sameTrackOnBothDecks`; trades/call-response for `next`). `masterDeck` stays the active deck, so `release()` hands back to it.
5. Hand-back on `onFinish` (P3.6), on abort, or when no pattern started within 2 phrases of `quantizedPlay`: stop the idle deck, `releaseAutoKeyLock(idle)`, `resetDeckAfterTransition(idle)` (existing), crossfader on the master, `this.standalone = null`; `double` -> idle deck left loaded but stopped (the next preload loads over it). Decision-log entry `JUGGLE` with trigger + source + outcome.

**P4.4 Interlocks** (one owner of the idle deck at a time):
- `preloadNextTrack()` (`DJAutoDJ.ts:780`) only renders to memory while `standalone` is set (already the case for the pre-render path; the direct-load fallbacks in `skip`/`playTrackAt`/Mix Now at `:415-490` call `this.endStandalone('user control: skip')` first).
- `triggerTransition()` (`:955`) calls `endStandalone('transition')` first; the transition-guard in P4.1 makes this the exception.
- `disable()` (`:344`) ends it.

**P4.5 Telemetry**: `JuggleTelemetry` gains `standalone: { trigger, source, phase } | null`; the debug view row that shows `safety` shows `setting up: double on B (build)` while loading/cued. MCP `dj_auto_dj_explain` already forwards the telemetry object.

**P4 automated verification**
- `npm run type-check`
- `VITEST_MAX_WORKERS=2 npx vitest run src/engine/dj/__tests__/autoDJStandaloneJuggleReachesTheDecks.test.ts src/engine/dj/autodj/juggle/__tests__/juggleOpportunity.test.ts src/engine/dj/__tests__/loadDoubleReusesTheDecodedBuffer.test.ts src/engine/dj/__tests__/autoDJJuggleGateLiveState.test.ts src/engine/dj/__tests__/autoDJLongSetSimulation.test.ts`
- Unit (`juggleOpportunity.test.ts`): each trigger fires on its corpus section; OPENING/RECOVERY phase -> null with the budget reason; cooldown not elapsed -> null; transition within setup window -> null; `next` chosen only when compatible and <= 180 s.
- `loadDoubleReusesTheDecodedBuffer.test.ts`: `decodeAudio` call count 0 for the double; target deck `trackAnalysis` is the source's object.
- Long-set simulation: one simulated hour in MUSICAL -> stand-alone juggles within the budget (<= 15 % of the set, >= 180 s apart in CRUISING), every one handed back (idle deck stopped, crossfader on master), `openWork() === 0` at the end.

**P4 success criteria**: with one deck playing a module track (grid confidence 1) in MUSICAL/CRUISING, cooldown elapsed and a build ahead within a phrase, Auto DJ loads the double, starts it on the master's downbeat with heard-phase error < 5 ms after the bend, performs one pattern (crossfader moves >= 2), and hands back: idle stopped, crossfader on the master within 1 bar of the pattern end.

**P4 as built (2026-10-11, deviations from the text above)**

Owner rule source: the music-theory juggling plan
`thoughts/shared/plans/2026-10-08-auto-dj-beat-juggling-plan.md` (cited as
"owner §N") wins over this plan; audit
`thoughts/shared/research/2026-10-11_juggling-vs-music-theory-plan.md` rows 29, 30, 32
were closed here.

- Migration (8.2): `autoDJJuggleMode` is not persisted anywhere (no zustand
  persist middleware on `useDJStore`, not in the DJ environment snapshot
  `src/lib/dj/djEnvironment.ts`, not in saved projects; grep of `juggleMode` over
  `src/`). So there is no stored OFF to tell apart from a user's OFF and no
  migration: the default is MUSICAL from this build on; a user's OFF lasts the
  session as before. Test: R4 file, "Auto Juggle defaults to MUSICAL".
- Owner §53 ("do not rewrite DJAutoDJ into a giant controller"): the setup,
  hold and hand-back live in `src/engine/dj/autodj/juggle/standaloneJuggle.ts`
  (`StandaloneJuggle`), not in `DJAutoDJ`; Auto DJ only lends the idle deck
  (`idleDeckBusy`, `nextOption`, `loadNextForTease`) and calls `end()` at the
  interlocks.
- P4.1: the double context's `deckSyncConfidence` is the master grid's
  confidence (what the controller computes for two copies of one grid), not 1.
  The opportunity also runs `planJuggle` on that context: no pattern for the
  double, no setup (MUSICAL's only same-track pattern is `double`, which needs
  intensity >= 0.45). The transition guard keeps room for the mode's longest
  pattern. Owner §25: a `next` tease is judged by `conditions()` on the real
  pair (next track from its cue on the idle deck at the master's tempo, built
  by the controller's `buildContext`); any conflict or an unjudged pair means
  the double (audit row 29).
- P4.2: `useDecodedBuffer` is named `adoptDecodedBuffer` (not a hook). No
  tracker song on the double: the song a deck holds is remapped in place to
  that deck's instrument ids and `getCachedSong` can return that very object,
  so a second load would remap it twice; the pattern view stays on the source
  deck. Cached stems are looked up with the source's file bytes.
- P4.3 setup follows owner §16 in order: the master's grid (reliable beat),
  cue on the master's next downbeat while stopped, tempo match, start on that
  bar (`quantizedPlay`, now cancellable), measured heard beat phase within 5 ms
  (`verified`), and only then does the controller plan; the offset comes from
  the pattern's ResyncDeck (owner §16 list). Hold-sync bends in beat phase
  (keeps a whole-beat offset). Stand-alone juggles start in `playing` and in
  `transition-pending` (a pre-rendered next track only exists there).
- Owner §43 (never fight the user): a track the user loads on the idle deck,
  or the crossfader moved off the master while no pattern runs, makes the layer
  let go of the deck without stopping it (decision log `JUGGLE`).
- Owner §17/§35/§44 (audit row 30): `double` is phrase-level now - SETUP
  offset, 2-bar then 1-bar trades, the silent copy re-cued to zero offset and
  its bass killed before the 1-bar layered payoff, released with the reset
  (9 bars, `patternBars` 9). Beat juggling a double is PERFORMER's
  (beatTrade / transformer). MUSICAL is the owner's table: phrase trading plus
  call-response, fills and doubles - `drumBassTrade` (1-bar cuts) moved out of
  MUSICAL (PERFORMER and up keep it). `fillTrade`'s layered drop kills the fill
  deck's bass. Test: every MUSICAL pattern cuts on bars only and every layer
  has one bass owner.
- P4.4: pause also hands back (no poll loop would hold or end it); an idle deck
  holding the next track for its transition (preloaded, no pre-render left) is
  never used for a double. Hand-backs at the interlocks are immediate (the
  transition / skip needs the deck now); pattern aborts still resolve through
  the release (owner §42).
- P4.5: the debug view gains a "Stand-alone" row; while nothing is set up,
  Safety reads `stand-alone: <why not>` (the planner's own "both decks must
  play" said nothing with one deck playing).
- Budget (owner §24/§28/§31): stand-alone juggles count in the controller's
  one history, cooldown and juggled fraction (the same `budgetFor` the
  transition ladder's follow-up will use).
- R4 negative case: a transition 40 s away (not 20 s): at 20 s the planner's
  own "transition imminent" blocks; 40 s shows the stand-alone guard itself.
- P4.LS: its own file (`autoDJStandaloneJuggleLongSet.test.ts`) through
  `getAutoDJ()`, sharing `standaloneJuggleHarness.ts` with R4; the corpus
  `drops` analysis tiled to an hour through the real builder. Measured: in
  MUSICAL on one track with no transition, ONE double per hour - `double` is
  MUSICAL's only same-track pattern and the planner never repeats the last
  pattern (owner §49 / scenario 10); in a real set the transitions in between
  free it again. PERFORMER (beatTrade / transformer / loopTighten on a double)
  is run for 30 min to prove repeated juggles keep the cooldown and fraction.
  The file runs ~6.5 min on this machine (1 h of fake clock at 500 ms polls).
- Not done here (P3-scope audit rows, left for the follow-up agent): ladder
  length / phrase alignment, ladder budget bypass, ladder mode table, module
  grid confidence 1.

### Phase P5 - Ledger, docs, cleanup

- **P5.1** Tick in `thoughts/shared/plans/2026-10-08-auto-dj-world-class-progress.md`: JUG-S26.2 (P3 test), JUG-S27.1 (P4 test), recompute the count line with the checkbox grep.
- **P5.2** Tick in `thoughts/lars/todos.md`: DJ-F (2), DJ-H plan + build items, DJ-K tempo-source part (style choice part stays open), key-lock latency (P2.4).
- **P5.3** `docs/MCP_DEBUGGING_GUIDE.md`: the juggle telemetry `standalone` field and `tempoSource` on `dj_get_state` deck analysis.
- **P5.4** Handoff `thoughts/shared/handoffs/2026-10-xx_dj-juggling.md` if anything is left open.

---

## 4. Reachability tests (one per feature, through `getAutoDJ()`)

All four copy the harness of `src/engine/dj/__tests__/autoDJJuggleReachesTheDecks.test.ts` (mocked `DJEngine` fake decks with a wall-clock position, mocked `DJQuantizedFX`, `DJPerSongFx`, playlist injected with `importPlaylists` because of FOUND-1). Sentinels wrap the real export with a counter via `vi.mock(path, async (orig) => ...)`. All are under `src/**` and so inside the `test:ci` include glob (`vite.config.ts:125`).

| ID | File | Entry | Sentinel | Asserted numbers |
|----|------|-------|----------|------------------|
| R1 | `src/engine/dj/__tests__/autoDJModuleTempoIsTheOneTempo.test.ts` | `getAutoDJ().enable()`, preload completes, `anticipate()` runs; incoming loaded through `loadPreRenderedTrackToDeck` | `moduleBeatGrid` call count >= 2 (anticipate + deck load) | a corpus module at speed 3 / tempo 125: deck `detectedBPM`, deck `beatGrid.bpm`, `trackAnalysis.bpm`, playlist track `bpm` all = 250.00; `trackAnalysis.beatGrid.confidence` = 1; `tempoSource` = 'module' |
| R2 | `src/engine/dj/__tests__/autoDJPhaseCorrectionNeverSeeksAPlayingDeck.test.ts` | Auto DJ enabled, planned juggle transition (same setup as R3, one deck started 40 ms off-grid) | `bendRate` call count >= 1 | fake decks record `seek()` while `isPlaying()`: count 0; heard-phase error after the bend < 5 ms |
| R3 | `src/engine/dj/__tests__/autoDJJuggleTransitionReachesTheDecks.test.ts` | Auto DJ enabled, mode PERFORMER, compatible corpus pair, poll loop runs to completion | `transitionLadder` builder call count = 1; plan `style === 'juggleTransition'` | mixer crossfader receives the ladder sequence (0/1 alternating, 6 cuts + release) at master beats 0, 16, 32, 40, 48, 52, 56 (+-1 tick); final crossfader = incoming; outgoing stopped; zero seeks on playing decks |
| R4 | `src/engine/dj/__tests__/autoDJStandaloneJuggleReachesTheDecks.test.ts` | Auto DJ enabled, one deck playing, mode MUSICAL, set phase CRUISING, corpus track with a build within a phrase, controller cooldown elapsed | `loadDoubleToDeck` call count = 1; controller `counts.started` = 1 | idle deck starts on the master's downbeat (start position = master position at that downbeat +- 5 ms); >= 2 crossfader moves during the pattern; after `onFinish`: idle `isPlaying()` false, crossfader on the master, telemetry `standalone` null; negative case in the same test: transition 20 s away -> `loadDoubleToDeck` count 0 |

Each test is written first and seen failing (Gate 2).

---

## 5. Checklist

Count: 37 of 46 done.

P0 - probes
- [ ] JUGX-P0.1 juggle-block reason histogram (10 min, MCP)
- [ ] JUGX-P0.2 confirm audio-mode nudge no-op (C6)
- [ ] JUGX-P0.3 tempo truth for ultraux vision / imaginia
- [ ] JUGX-P0.4 walk-vs-render agreement, 30 recent tracker tracks, resumable rows
- [ ] JUGX-P0.5 key-lock latency read from the code + measured

P1 - module grid, one tempo source
- [x] JUGX-P1.1 `moduleBeatGrid.ts` + pure tests - 9bfba2fde (revised bc4de83b9: no stretch onto the render; e5ede3d05: rows per beat from the song)
- [x] JUGX-P1.2 `timeOrderPositions` honours Dxx / backward Bxx + tests - 9bfba2fde
- [x] JUGX-P1.3 `detectBPM` speed-aware + regression test (fails before) - 272983a45 (premise wrong, owner FAIL) -> corrected e5ede3d05 (ultraux vision fixture, fails on 272983a45 with 282)
- [x] JUGX-P1.4 `buildBeatGrids` fixed meter - 4fd33dd62
- [x] JUGX-P1.5 `buildDJTrackAnalysis` uses the module grid; `tempoSource`; version 3 - bc4de83b9
- [x] JUGX-P1.6 `applyAnalysisToDeck` deck grid + BPM from the analysis - 43ffd0835; manual-load grid loss fixed 4ab6c5b1c
- [x] JUGX-P1.7a `anticipate()` writes playlist bpm + summary - 44397bc39 (swept into another agent's commit "fix(server): build the API without the frontend app graph"; content is this item)
- [x] JUGX-P1.7b playlist analyzer local + server branches through the same analysis - 8911ea27f
- [x] JUGX-P1.R1 reachability test R1 red, then green - 44397bc39 (red seen at P1.6 on the playlist bpm; numbers updated to 125 in e5ede3d05)
- [x] JUGX-P1.TC type-check clean - after 4ab6c5b1c

P2 - bend, never seek, a playing deck
- [x] JUGX-P2.1 `DeckEngine.bendRate` + unit test - deb43fcca
- [x] JUGX-P2.2 audio-mode `nudge` -> bend + regression test (fails before) - deb43fcca
- [x] JUGX-P2.3 `phaseAlign` auto method + `bendToPhase`; keyboard sync passes 'seek' - f25d132a4
- [x] JUGX-P2.4 heard position includes key-lock latency - fd16700f9
- [x] JUGX-P2.R2 reachability test R2 red, then green - f25d132a4
- [x] JUGX-P2.TC type-check clean - fd16700f9 (tsc -b --force clean at each P2 commit)

P3 - juggle-transition style
- [x] JUGX-P3.1 style + plan `juggle` field - 303d512b7
- [x] JUGX-P3.2 planner input `juggleMode` from the session controller - 303d512b7
- [x] JUGX-P3.3 `scoreStyles` gate + score - 303d512b7
- [x] JUGX-P3.4 ladder, `incomingPosition`, room check, trigger lead - 303d512b7 (ladder aimed at the hand-over, see P3 as built)
- [x] JUGX-P3.5 `transitionLadder` pattern - 9b7fb7a8b
- [x] JUGX-P3.6 `performLadder` + `onFinish` - 9b7fb7a8b
- [x] JUGX-P3.7 executor trade stage - fdf858a51 (+ no seek of an already-playing incoming)
- [x] JUGX-P3.8a prelude deleted (method, flag, call) - fdf858a51; R2 moved to the ladder setup
- [x] JUGX-P3.8b `JUGGLE_TRANSITION` mode during the ladder (C5) - fdf858a51 (red: 'transition took over')
- [x] JUGX-P3.8c `finalizePlan` keeps the anticipated plan (C4) - fdf858a51 (red: executed t7, anticipated t0)
- [x] JUGX-P3.U planner style unit tests - 303d512b7, 9b7fb7a8b (`src/engine/dj/autodj/__tests__/transitionPlannerJuggleStyle.test.ts`)
- [x] JUGX-P3.R3 reachability test R3 red, then green - fdf858a51 (red with the trade stage unwired: ladder built 0 times)
- [x] JUGX-P3.TC type-check clean - after fdf858a51

P4 - stand-alone juggles
- [x] JUGX-P4.1 `juggleOpportunity` + unit tests - 81d6cffb1; pair judged by the planner's conditions ff29d23a4 (audit row 29)
- [x] JUGX-P4.2 `loadDoubleToDeck` (decoded-buffer reuse, analysis copy) + test - a062d35b8 (red with a re-decoding version: 2 decodes)
- [x] JUGX-P4.3 setup / hold-sync / hand-back - 20c58189e (in `standaloneJuggle.ts`, owner §53; owner §16 order, audit row 32)
- [x] JUGX-P4.4 interlocks (preload, skip, Mix Now, play-at, transition, disable; + pause, user takes the idle deck) - 20c58189e
- [x] JUGX-P4.5 telemetry `standalone` + debug view row - 42e3ae481
- [x] JUGX-P4.LS long-set simulation budget + leak assertions - 20c58189e (`autoDJStandaloneJuggleLongSet.test.ts`: MUSICAL 1 h, PERFORMER 30 min)
- [x] JUGX-P4.R4 reachability test R4 red, then green - 20c58189e (red with the opportunity unwired and the default OFF: 3 of 3 failed)
- [x] JUGX-P4.TC type-check clean - after 20c58189e

P5 - ledger, docs
- [ ] JUGX-P5.1 world-class progress ledger ticked + count recomputed
- [ ] JUGX-P5.2 todos.md ticked
- [ ] JUGX-P5.3 MCP debugging guide
- [ ] JUGX-P5.4 handoff (only if anything is left open)

---

## 6. Automated verification (summary)

Per phase as listed above. Never the full suite by hand (hooks run it on push).
Targeted runs only, `VITEST_MAX_WORKERS=2`, one test command at a time.
`npm run type-check` after every phase.

## 7. Manual verification (owner; collected under "Blocked on me")

LOCAL first: `npm run dev:fullstack`, browser at `http://localhost:5174`, DJ view.
LIVE after push: `https://devilbox.uprough.net` (confirm `version.json` buildHash first).

- **M1 Tempo agrees.** Load a module playlist; open the playlist panel and a deck with the same track. PASS: playlist BPM = deck BPM (e.g. the DJ-K track no longer 94 vs 140.95). FAIL: two numbers.
- **M2 No turntable jumps.** Auto DJ on, Auto Juggle PERFORMER, let three transitions run. PASS: no platter or waveform jump on a playing deck; the sound never skips. FAIL: what DJ-F described.
- **M3 Juggle transition sounds musical.** Same session. PASS: at least one transition audibly trades 4 -> 2 -> 1 bars and lands on the incoming drop; the debug view shows `juggleTransition`. FAIL: blend only, or trades off the beat.
- **M4 Stand-alone juggle.** Auto Juggle MUSICAL, one long module track playing, wait through a build. PASS: the idle deck loads the same track, a juggle happens on the phrase, the set returns to the single deck; it does not repeat within ~3 minutes. FAIL: never fires (read the debug view `safety` line and report it), or the idle deck is left playing.
- **M5 Owner check 8** (listening: two-deck relationship, trading, call/response, doubles, escalation, release, variety, human quality) - JUG-PG-N.1.

---

## 8. Owner decisions needed

1. **DECIDED (owner 2026-10-11): existing PHASE_BUDGET.** Original note: **How often stand-alone juggles may fire.** Recommended default: the existing
   set-phase budget (`PHASE_BUDGET`, `jugglePlanner.ts:39-48`) - none in
   OPENING/RECOVERY, at least 180 s apart and at most 15 % of the set while
   CRUISING in MUSICAL, tighter (90 s, 35 %) at PEAK; modes scale it. No new
   knob.
2. **DECIDED (owner 2026-10-11): Auto Juggle defaults ON (`MUSICAL`).** Implement in P4 with the migration below. Original note: **Default Auto Juggle mode.** Today `OFF` (`useDJStore.ts:524`), so nothing
   fires until the owner switches it on. Recommended default: `MUSICAL` for new
   sessions (phrase/bar trades, doubles, call/response; no beat chops). If
   `autoDJJuggleMode` is persisted, the change goes through a versioned
   migration (`src/lib/persistence/migrations/`), not a silent default flip.

## 9. Not in this plan

- DJ-K style choice ignoring its own tempo verdict (`longBlend` picked under `tempoPlan.method === 'avoid'`) - separate planner fix; this plan only removes the tempo-source disagreement behind it.
- DJ-F candidate (3) clock re-anchoring of the turntable angle.
- FOUND-1 DJStemPreloader module cycle - tests keep the `importPlaylists` workaround.
- Open JUG pattern items (JUG-S10.1, S17.x, S18.1, S20.1) - pattern-library depth, independent of engagement.

## P0 results

(filled in by P0 before P1 starts)
