# DJ View Regression Fix Session — Handoff 2026-05-09

## Summary

Massive DJ view regression fix session. Started with a completely broken DJ view (songs stopping, crashes, freezes, echo, broken crossfader, Auto DJ not advancing) and systematically fixed ~20 bugs across 20 commits. All changes are on `main`, 19 commits pushed to origin, 1 local-only.

## Commits This Session (oldest → newest)

| SHA | Description |
|-----|-------------|
| `2fdab3526` | loopEnd=0 bug fix, fader ResizeObserver, AutoDJ staleCount, 14 regression tests |
| `f31aa1cad` | `skipTransition()` — immediate crossfade on skip (no quantize delay) |
| `147a6b655` | Oh Snap crashes — playlist reorder bounds, pipeline null guard, worker try-catch, 7 tests |
| `1311b9cdb` | Playlist migration safety — never-wipe guard, cloud auto-restore, 4 contract tests |
| `6a47182f5` | Panel selector consolidation — 25+ selectors → grouped useShallow |
| `57903a7dd` | Modal selector consolidation, structuredClone+throttle for pushUndo |
| `9608b037e` | Batch 3 — deck B pattern view, local file support, selector storms, FX release handlers, 17 tests |
| `19aa1eb63` | Immer Draft proxy fix — `current()` unwrap for pushUndo/clonePlaylist/undo/redo, 8 tests |
| `82e97fefa` | Action column truncation fix |
| `629ea58a1` | Rehydration try-catch safety |
| `759f6a156` | IndexedDB `getAll()` OOM crash + analysis render limit + context menu analyze, 3 tests |
| `22bdb7670` | Auto DJ modal close-on-outside-click, snappier skip crossfade, analysis improvements |
| `483f9e3e4` | Preview play await, smart sort on Auto DJ enable, duplicate case fix |
| `fa82ba6e1` | TFMX/FRED analysis — companion download before render, route FRED locally, 5 tests |
| `2a1218dba` | Pipeline cache 0-byte audio fix + live load companion downloads, 5 tests |
| `b3ee755fb` | Crossfader animation (property name) + DJ echo prevention (masterChannel mute), 7 tests |
| `be553d19c` | Crossfader rAF batching fix + Auto DJ force-complete + syncDeckState + 200MB limit, 7 tests |
| `dce6c183b` | **Auto DJ transition sweep guard** — prevents premature completeTransition, 10 tests |

**Not yet pushed:** `dce6c183b` (local only, needs `git push origin main`)

## Uncommitted Changes (minor, unrelated to DJ work)

- `data/devilbox.db` — local DB file
- `src/components/instruments/KontaktPlayer.tsx` — minor fix
- `src/engine/TrackerReplayer.ts` — +1 line
- `src/engine/furnace-dispatch/FurnaceDispatchEngine.ts` — 14 lines changed
- `src/generated/changelog.ts` — auto-generated
- Various submodule pointer changes in `third-party/`

These are NOT DJ-related and should not be committed as part of this work.

## Regression Test Suite

**File:** `src/engine/dj/__tests__/djViewRegressions.test.ts`
**Count:** 49 tests, all passing
**Wired into:** `test:ci` (runs on pre-commit and CI)

Tests cover: loopEnd bug, deck B totalPositions, Auto DJ local file support, selector consolidation, FX pad release handlers, Immer Draft safety, keyboard safety, memoized virtualItems, pipeline cache hits, companion downloads, crossfader animation, DJ echo prevention, Auto DJ deck detection, file size limits, transition sweep guard (10 tests).

## Remaining Bugs (8 pending todos)

### High Priority

1. **`dj-drumpad-audio-death`** — Playing drumpads while pulling joystick with Auto DJ running kills all audio
   - **Diagnosed:** DubBus `mini-drain` spam — rapid `wireMasterInsert`/`unwireMasterInsert` cycles at ~line 3694/3748 of `DubBus.ts`
   - Each pad release triggers drain, new pad press aborts it immediately
   - The wire/unwire master insert during transition may disconnect audio graph permanently
   - **Start here:** Look at `DubBus.ts` lines ~2505 (mini-drain), ~3694 (wireMasterInsert), ~3748 (unwireMasterInsert)

2. **`dj-fader-range`** — Channel faders can't be pulled all the way down, stops at middle position
   - Likely UI scaling issue — the fader track height doesn't match the control range
   - Check `MixerChannelStrip.tsx` — ResizeObserver was added for this but may not fully fix it

3. **`dj-deck2-oscilloscope`** — Deck 2 shows oscilloscope instead of pattern data
   - Deck A shows pattern data correctly, Deck B falls back to oscilloscope
   - Partially fixed in `9608b037e` but may still be broken
   - Check `DJDeck.tsx` — pattern view needs correct `songData`/`totalPositions` for deck B

### Medium Priority

4. **`dj-playlist-preview-play`** — Preview play button in playlist doesn't work
   - May be related to async play() handling

5. **`dj-mpk-mini-mapping`** — AKAI MPK Mini knobs mapped to wrong DJ parameters
   - Check `src/midi/performance/parameterRouter.ts` PARAMETER_ROUTES table

6. **`dj-sample-pack-default`** — Add "Sammy Blammy Samples" pack as server default + drum pad bank 2
   - Need to find the uploaded pack, deploy to server, wire into drum pad presets

### Lower Priority / Infrastructure

7. **`dj-cloud-analysis-cache`** — CORS blocks localhost → production for analysis cache
   - Analysis results should persist on Hetzner so songs are only analyzed once globally

8. **`dj-localhost-live-db-sync`** — Dev should use live Hetzner analysis DB
   - localhost analysis reads/writes should hit production server

## Key Architecture Notes

### DJ Audio Path (echo was here, now fixed)
```
Source Audio → DeckAudioPlayer → DJMixer (crossfader) → DJMixer limiter → Tone.getDestination()
                                                                              ↑
ToneEngine masterChannel ──── MUTED when _djModeActive=true ────────────────┘
```
The echo bug was ToneEngine's `masterChannel` also routing to destination. Fixed by `setDJMode(true)` keeping it muted. All restore paths (`stop()`, `setMasterVolume()`) check `_djModeActive`.

### Auto DJ State Machine
```
idle → preloading → ready → transitioning → idle
                                    ↑
                         transitionSweepStarted flag
                         prevents premature completion
```
Key file: `src/engine/dj/DJAutoDJ.ts` (~1220 lines)
- `pollLoop()` at ~line 461 — 500ms polling, state-based
- `triggerTransition()` at ~line 882 — loads track, starts sweep
- `completeTransition()` at ~line 1142 — stops outgoing, resets state
- `syncDeckState()` — detects which deck is actually playing

### Crossfader
- Store property is `crossfaderPosition` (NOT `crossfader`)
- `setCrossfader()` in `DJActions.ts` uses direct `setState` (NOT `batchDJSet` which uses rAF deferral)
- `crossfaderSweep()` in `DJQuantizedFX.ts` uses `setInterval` at 16ms (works in background tabs)

### Immer Safety
All mutations inside Zustand `set()` that need to snapshot state must use `current(state)` from `immer` — NOT `structuredClone` or `JSON.parse(JSON.stringify())` which throw on Draft proxies.

## Key Files

| File | Purpose |
|------|---------|
| `src/engine/dj/DJAutoDJ.ts` | Auto DJ state machine, transitions, polling |
| `src/engine/dj/DJQuantizedFX.ts` | Crossfade sweeps, filter effects, echo out |
| `src/engine/dj/DJActions.ts` | Central DJ action functions |
| `src/engine/dj/DJPipeline.ts` | Audio analysis pipeline |
| `src/engine/dj/DJTrackLoader.ts` | Track loading, companion file handling |
| `src/engine/dj/DeckAudioPlayer.ts` | Per-deck audio playback |
| `src/engine/ToneEngine.ts` | Audio engine, `_djModeActive` flag |
| `src/engine/dub/DubBus.ts` | Dub effects bus, master insert wire/unwire |
| `src/stores/useDJStore.ts` | DJ state store (Zustand + Immer) |
| `src/stores/useDJPlaylistStore.ts` | Playlist state, undo/redo |
| `src/components/dj/DJDeck.tsx` | Deck UI component |
| `src/components/dj/DJPlaylistPanel.tsx` | Playlist panel with virtualized list |
| `src/components/dj/DJPlaylistModal.tsx` | Playlist management modal |
| `src/engine/dj/__tests__/djViewRegressions.test.ts` | 49 regression tests |
