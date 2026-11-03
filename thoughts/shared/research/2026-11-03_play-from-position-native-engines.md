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

## Done: item 2, classic UADE (2026-11-03)

- C: `uade_wasm_skip_frames(frames)` (uade-wasm/src/entry.c, next to `uade_wasm_render`) reads and discards PCM through the same `guarded_read` path, so tick counters and Paula state end where playing that far would leave them. Exported in uade-wasm/build.sh. WASM rebuilt with the repo script; public/uade/UADE.js and UADE.wasm are tracked and updated.
- Worklet (public/uade/UADE.worklet.js): `seek` message stores `_seekFrame`; `play` applies it AFTER the stopped-song reload (a reload restarts the song and would undo an early skip), then clears it.
- TS: `UADEEngine.seek(frame)` posts `seek`; the `UADEEditable` descriptor got `startAt` -> `seek`, so the existing `startNativeEngines` seam (rowStartFrame, position 0 row 0 stays plain) covers it. No separate call site was needed: UADEEditable IS a registry descriptor.
- Test: src/engine/replayer/__tests__/uadePlayStartsAtThePosition.test.ts (fails with the `startAt` line removed, verified).
- Not verified live (no browser run): audible start at the position on a real UADE song, and that the preview frame rate equals the worklet's render rate. Owner test: http://localhost:5174, load a classic UADE module, click order position 5, Play; hard reload first (worklet + wasm changed).
- Other UADE routes not through UADEEditable (if any) are untouched.
- Commit status: NOT committed. The pre-commit gate fails on src/__tests__/ci/regression.test.ts (dynamic imports of useInstrumentStore / useFormatStore / effect defaults hang to the 30 s timeout), which also hangs with the UADE edits reverted, so it is not from this change (likely another agent's WIP in the import graph). Work is in the tree, uncommitted: commit by path once that suite is green.
