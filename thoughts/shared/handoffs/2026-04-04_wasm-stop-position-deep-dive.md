---
date: 2026-04-04
topic: wasm-engine-stop-position-deep-dive
tags: [jamcracker, wasm-engines, usePatternPlayback, stop-position, worker-renderer]
status: final
---

# Session Handoff — WASM Engine Stop Position (Deep Dive)

## Problem
Pressing spacebar/stop during JamCracker playback — pattern editor jumps to row 0 instead of staying at current position. ~80-90% failure rate.

## ALL CHANGES REVERTED — codebase is back to pre-session state

Only cleanup: removed leftover `stopRow`/`unfreeze` references from previous session's working tree.

## CONFIRMED FACTS (from code reading + diagnostic logs)

### Fact 1: Position IS saved correctly on stop
Log: `[JC DATA] STOP: currentRow=8 playPos=0 editPos=0 channels.length=4`
- `useJamCrackerData.currentRow` holds the correct row (8) after stop
- `channels.length=4` — PatternEditorCanvas does NOT unmount
- Position is correctly preserved in React state

### Fact 2: JamCracker uses FORMAT MODE rendering
- JamCrackerView passes `formatCurrentRow={currentRow}` to PatternEditorCanvas
- PatternEditorCanvas RAF enters `if (isFormatModeRef.current)` block (line 2198)
- FORMAT mode RAF reads position from FormatPlaybackState (fps) during play, `formatCurrentRowRef` when stopped
- `formatCurrentRowRef.current` = `formatCurrentRow ?? 0` (line 133) = `currentRow` from useJamCrackerData = 8 ✓

### Fact 3: The FORMAT RAF row→0 log NEVER fires
Even with `if (newRow === 0 && prevRow > 0) console.warn(...)` at the top of the format mode RAF, the log never fires. This means `formatCurrentRowRef.current` is NOT 0 when the RAF reads it.

### Fact 4: Worker renderers use cursor.rowIndex when isPlaying=false
- `TrackerGLRenderer.ts:439`: `const currentRow = isPlaying ? playRow : cursor.rowIndex;`
- `TrackerCanvas2DRenderer.ts:147`: `const centerRow = isPlaying ? playRow : cursor.rowIndex;`
- When `playback.isPlaying=false`, both renderers use `cursor.rowIndex`

### Fact 5: In format mode, cursor updates are NOT sent to the worker
- `PatternEditorCanvas.tsx:1842`: `if (isFormatModeRef.current) return;`
- The cursor store subscription skips posting cursor updates to the worker in format mode
- Worker's `cursor.rowIndex` stays at 0 (its initial value) — NEVER updated for JamCracker

### Fact 6: usePatternPlayback effect restarts the engine after stop
- Effect re-fires with `needsReload=true` → calls `loadSong → replayer.play() → startNativeEngines`
- Engine restarts from position 0, sends new position callbacks with row 0
- This sets `fps.isPlaying=true` again with `fps.row=0`, then the worker gets `{row: 0, isPlaying: true}`

### Fact 7: The stop→restart cycle is caused by async play() race
- `forcePosition()` (TrackerReplayer.ts:676/682) calls `store.play()` fire-and-forget
- `store.play()` is async (awaits unlockIOSAudio + Tone.start)
- If user stops before play() resolves, stop sets isPlaying=false, then play() resolves setting isPlaying=true
- Effect sees isPlaying=true → enters play branch → restarts engine

## ROOT CAUSE (two independent issues, both contribute)

### Issue A: Worker cursor never updated in format mode
When playback stops and `playback.isPlaying=false`, the worker falls back to `cursor.rowIndex` which is 0 because format mode skips cursor messages to the worker (line 1842).

**Fix**: In the format mode RAF stop transition (`prevPlaying && !newPlaying`), post a `{type: 'cursor', cursor: {rowIndex: lastRow}}` message to sync the worker.

### Issue B: Engine restart after stop overrides position
The usePatternPlayback effect restarts the engine (loadSong → play → startNativeEngines) after stop due to the async play() race. The restarted engine sends position updates from row 0, overriding any saved position.

**Fix**: Either:
- A generation counter in `useTransportStore.play()` that aborts if stop() was called during the async gap
- OR: A JamCracker bypass in usePatternPlayback (like UADE has) that prevents the effect from calling loadSong/play

**BOTH issues must be fixed for the stop position to work reliably.**

## Key Files

| File | Line | What |
|------|------|------|
| `PatternEditorCanvas.tsx` | 1842 | `if (isFormatModeRef.current) return;` — skips cursor→worker |
| `PatternEditorCanvas.tsx` | 2198-2262 | Format mode RAF loop |
| `PatternEditorCanvas.tsx` | 2233 | `fps.isPlaying ? fps.row : formatCurrentRowRef.current` |
| `TrackerGLRenderer.ts` | 439 | `isPlaying ? playRow : cursor.rowIndex` ← cursor.rowIndex=0 |
| `TrackerCanvas2DRenderer.ts` | 147 | Same pattern |
| `tracker-render.worker.ts` | 60-64 | Worker state init: `cursor = {rowIndex: 0}` |
| `useJamCrackerData.ts` | 52,60,142-148 | Position state, activePos switch, position callback |
| `JamCrackerView.tsx` | 98-105 | channels.length guard, formatCurrentRow prop |
| `usePatternPlayback.ts` | 214-632 | Main effect with needsReload loop |
| `useTransportStore.ts` | 214-232 | Async play() action |
| `TrackerReplayer.ts` | 635-683 | forcePosition() — fire-and-forget play() |
| `NativeEngineRouting.ts` | 555-564 | Position callback wiring |

## Failed approaches this session (do NOT repeat)

1. ❌ Throttle timer fix in useTransportStore — not the root cause
2. ❌ Frozen flag in useWasmPositionStore — display driven by format mode, not wasmPos
3. ❌ JamCracker bypass in usePatternPlayback play branch — broke re-play after stop
4. ❌ JamCracker guard in stop branch (no hasStarted reset) — didn't prevent engine restart
5. ❌ preservePosition param in TrackerReplayer.stop() — engine restart still sends row 0
6. ❌ stopRow field in useWasmPositionStore — format mode doesn't read wasmPos
7. ❌ Generation counter in play() alone — doesn't fix worker cursor issue
8. ❌ Cursor sync in format RAF stop transition alone — engine restart overrides it
