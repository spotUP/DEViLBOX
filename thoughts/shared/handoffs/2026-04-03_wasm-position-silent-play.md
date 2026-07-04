---
date: 2026-04-03
topic: wasm-engine-position-sync-and-silent-play
tags: [jamcracker, wasm-engines, audio-routing, playback]
status: final
---

# Session Handoff — 2026-04-03 (WASM Position Sync + Silent First Play)

## FIXED

### 1. Pattern Scrolling for WASM Engines
JamCrackerView renders PatternEditorCanvas in FORMAT MODE. The format mode rAF reads `getFormatPlaybackState()`, but JamCracker never called `setFormatPlaybackRow/Playing`.
- **Fix:** `src/hooks/useJamCrackerData.ts` — calls `setFormatPlaybackRow/Playing` in position callback
- **Also fixed:** DOM idle guard (`PatternEditorCanvas.tsx`) and Pixi ticker (`PixiPatternEditor.tsx`) now check `wasmPos.active`

### 2. Silent First Play
`ToneEngine.stop()` does a mute/unmute cycle on `masterChannel` + `Tone.getTransport().stop()` that resets the Web Audio graph. Native synth audio through `synthBus` is broken without this reset.
- **Fix:** `engine.stop()` + 60ms wait before `await play()` in `handlePlaySong` and `handlePlayPattern`
- **Documented:** `memory/wasm_engine_audio_routing.md`

### 3. Stop Working for JamCracker
`staticRef: null` meant `tryResolveSync()` always returned null. Turntable brake entered scratch mode and killed the engine.
- **Fix:** Static import + `staticRef: JamCrackerEngine`. JamCracker stop bypasses scratch controller.

### 4. Async Race in stopNativeEngines
Dynamic `import().then(clear)` resolved after `startNativeEngines` restarted.
- **Fix:** Static import of `useWasmPositionStore`, synchronous `clear()`. Removed fire-and-forget engine stop.

### 5. Stop Position (partial)
`TrackerReplayer.stop()` uses `wasmPos.row` when replayer has no scheduled state. Also saved in `handlePlaySong` JamCracker stop path.
- **Known issue:** Position sometimes resets to 0 due to `usePatternPlayback` effect re-firing and calling `loadSong` after stop. See "Remaining" below.

### 6. KlysView Stop
Added `getToneEngine().stop()` to KlysView's `handleStop`.

### 7. Vite Warnings
Removed duplicate `case 'ToneAM'`, added `@vite-ignore` to dynamic import.

## REMAINING — Stop Position Race

When the play button stops JamCracker, the position is saved from `wasmPos` BEFORE `replayer.stop()`. But the `usePatternPlayback` effect re-fires after stop and sometimes calls `loadSong → stop()` which resets `currentRow` back to 0. This is intermittent — depends on React effect timing.

**Root cause:** The `usePatternPlayback` effect wasn't designed for WASM singleton engines. It runs the full `loadSong → replayer.play() → startNativeEngines` flow on every play, which races with the direct play/stop in `handlePlaySong`. A proper fix would restructure the effect to skip the `loadSong → replayer.play()` path for WASM singleton formats (similar to the UADE bypass at line 252), but this needs careful testing.

**Quick approach to try:** Add a JamCracker early-return in the `usePatternPlayback` effect (like UADE has) that skips `loadSong → replayer.play()` entirely. The `handlePlaySong` JamCracker path already handles play/stop directly. The effect should just set `hasStartedRef.current = true` and return. This was attempted earlier but removed because it caused audio silence — but that was before the `engine.stop()` fix. It should work now.

## Key Files Changed This Session

| File | What |
|------|------|
| `src/components/tracker/FT2Toolbar/FT2Toolbar.tsx` | JamCracker play/stop bypass, engine.stop() before play |
| `src/components/klystrack/KlysView.tsx` | getToneEngine().stop() in handleStop |
| `src/hooks/useJamCrackerData.ts` | FormatPlaybackState + setFormatPlaybackPlaying |
| `src/engine/replayer/NativeEngineRouting.ts` | staticRef, sync clear, sync stop |
| `src/engine/TrackerReplayer.ts` | wasmPos in stop position, useWasmPositionStore import |
| `src/engine/ToneEngine.ts` | BLEP await, duplicate case fix |
| `src/stores/useWasmPositionStore.ts` | Lightweight WASM position store |
| `src/pixi/views/tracker/PixiPatternEditor.tsx` | wasmPos in ticker |
| `src/components/tracker/PatternEditorCanvas.tsx` | wasmPos idle guard |
| `public/jamcracker/JamCracker.worklet.js` | Removed playing guard |
| `src/engine/FormatPlaybackState.ts` | Existing — drives format mode scrolling |
| `src/lib/file/UnifiedFileLoader.ts` | No changes (reverted eager init) |
| `src/bridge/handlers/writeHandlers.ts` | @vite-ignore on dynamic import |

## Diagnostic Logging Status
All session diagnostics removed. Only pre-existing logging remains.
