---
date: 2026-11-03
topic: Play / Play Pattern ignore the start position on nuade and UADE routes
status: item 1 (Nuade) fixed; item 2 (UADE) open
---

# Play from position on nuade / UADE routes

Owner report 2026-11-03 (prehistoric_tale.hipc): "when i click play or play pattern it always plays from the start not the current position".

## Root cause (code reading + live MCP measurement)

- `TrackerReplayer.play()` passes `initialSongPos` / `initialPattPos` only to Furnace (~line 2471) and libopenmpt (~line 2547).
- Play / Play Pattern start path: `src/hooks/audio/usePatternPlayback.ts` ~495-535 calls `replayer.seekTo(...)`.
  `seekTo` (`src/engine/TrackerReplayer.ts:3881`) moves only the TS scheduler pointers and the displayed row; it forwards to libopenmpt and to `seekCinter4` only.
- `startNativeEngines` (`src/engine/replayer/NativeEngineRouting.ts` ~560+) calls `instance.play()` with no position.
- `UADEEngine.targetOf` (`src/engine/uade/UADEEngine.ts:1204`) and `NuadeEngine.targetOf` (`src/engine/nuade/NuadeEngine.ts:243`) are called only from `nativeRowRequest` (`NativeEngineRouting.ts:539`), the row-preview clip path, never on transport start.

## Measured live

prehistoric_tale.hipc loads as engine Nuade (hippelCoso default = nuade).
`seek_to` position 5 row 0, `play`, `get_playback_state`: UI currentPattern 5, enginePosition songPos 1 row 1. Audio starts at the top; display disagrees. Repeated once, same result.

## Fix needed

1. Nuade: `NuadeEngine.seek(frame)` and worklet `seek` message exist, never called on play.
   Grid row -> `targetOf` gives a tick target; frame comes from the same forward search `RowPreviewStream` uses (`searchForward`, `src/engine/rowPreview/rowPreviewStream.ts`). Reuse it, then post `seek` before/at play.
2. UADE: no seek in `UADEEngine.ts` or its worklet. Needs a fast-forward / silent-render-to-tick message in the worklet + C, WASM rebuild.
3. Regression test: drive transport start with a mock engine; assert the seek sentinel fires with the position's start frame/tick.

## Sibling formats (code reading, not measured)

All nuade / UADE routes ignore the start position: hippelCoso, soundProgrammingLanguage, dynamicSynthesizer, beathoven, timFollin, synthDream.
Known good by code: libopenmpt formats, Furnace, Cinter4 (`seekCinter4`).

## Owner local test once fixed

http://localhost:5174, load prehistoric_tale.hipc, click order position 5, press Play. PASS = audio and playhead start at position 5.

## Done: item 1, Nuade (2026-11-03)

- `TrackerReplayer.play()` now passes `{ songPos, row: pattPos }` to `startNativeEngines` (same source as Furnace's initialSongPos).
- `startNativeEngines` (NativeEngineRouting.ts): for a descriptor with the new optional `startAt(instance, frame)` seam (wasmEngineRegistry.ts), and a start away from position 0 row 0, resolves the frame with `rowStartFrame` and calls `desc.startAt` before `instance.play()`. `rowStartFrame` reuses the row-preview client/worker (RowPreviewStream.searchForward) and reads `clip.startFrame`; no second search.
- Nuade descriptor: `startAt` = `NuadeEngine.seek(frame)`.
- UADE seam: add a `startAt` to the UADE descriptor once a worklet seek exists (UADE is not in WASM_ENGINES for the opaque classic route: it needs its own call site next to `uadeEngine` capture).
- Test: `src/engine/replayer/__tests__/nuadePlayStartsAtThePosition.test.ts`.
