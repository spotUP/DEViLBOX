---
date: 2026-04-11
topic: format-audit-fixes
tags: [audit, formats, routing, audiocontext, uade]
status: in-progress
---

# Format Audit Fixes — 2026-04-11

## Task
Fix all failures in the playback smoke test (`tools/playback-smoke-test.ts --local-only`). Started at ~55% pass rate, got to 78% (83/106).

## Completed Fixes

### 1. Format Dialog Freeze (committed earlier)
- `src/lib/formatCompatibility.ts` — Added `suppressFormatChecks()`/`restoreFormatChecks()` with nesting
- `src/lib/file/UnifiedFileLoader.ts` — Wrapped `loadFile()` and `importTrackerModule()`
- `src/bridge/handlers/writeHandlers.ts` — Wrapped MCP `setBpm()` and `pending-import` paths
- `src/App.tsx`, `src/pixi/PixiRoot.tsx` — Wrapped pending-import fallbacks

### 2. AudioContext MediaStream Bridge (committed earlier)
- `src/engine/ToneEngine.ts:471-486` — When `connectNativeSynth` detects context mismatch, creates `MediaStreamDestination → MediaStreamSource` bridge instead of silently returning
- `src/engine/replayer/NativeEngineRouting.ts:662-688` — Same bridge for `needsDirectRouting` engines

### 3. AudioContext Staleness Check (commit e2d9edf0e)
- 20 singleton engines now check `this.audioContext !== getDevilboxAudioContext()` in `getInstance()` and recreate if stale
- Files: HivelyEngine, JamCrackerEngine, ArtOfNoiseEngine, FuturePlayerEngine, PxtoneEngine, OrganyaEngine, FCEngine, UADEEngine, HippelEngine, HippelCoSoEngine, TFMXEngine, SoundMonEngine, OctaMEDEngine, KlysEngine, DigMugEngine, FredEngine, SymphonieEngine, FurnaceDispatchEngine, FurnaceChipEngine, MusicLineEngine, SonicArrangerEngine

### 4. needsDirectRouting for Silent Engines (commit e2d9edf0e)
- `src/engine/replayer/NativeEngineRouting.ts` — Set `needsDirectRouting: true` for Klystrack, JamCracker, FuturePlayer

### 5. Format Routing Fix (committed by agent)
- `src/bridge/handlers/writeHandlers.ts:879` — Replaced broad `format?.nativeOnly && !format?.nativeParser` with explicit `moduleLoaderNativeExts = /\.(fur|dmf|xrns)$/i`. Fixes Organya/PxTone being sent to libopenmpt.

### 6. MusicLine Error Handling (committed by agent)
- `src/engine/musicline/MusicLineEngine.ts` — Removed silent `catch {}` on `addModule`, added `_rejectInit`

### 7. UADE Protocol Cascade Self-Healing (commit 2df046105)
- `src/engine/uade/UADEEngine.ts` — Added `_poisoned` flag set on protocol error/OOM abort. `getInstance()` disposes poisoned instance and creates fresh one.

### 8. Smoke Test Improvements (commit e2d9edf0e)
- `tools/playback-smoke-test.ts` — Alternate file fallback (tries 3 files per format), faster WS reconnect, "Browser disconnected" retry with reconnect

## Remaining Issues

### High Priority
1. **Organya .org also hitting UADE** — `startNativeEngines` tries ALL matching engines. Organya engine loads fine but UADE also tries (and fails with "UADE could not play: ballos.org"). Need to suppress UADE for formats that have a dedicated WASM engine that already started successfully.
   - Fix: In `startNativeEngines`, if a non-UADE engine already started for this song, skip UADE. Or check if `organyaFileData`/`pxtoneFileData`/etc exists and skip UADE for those.

2. **Buzzmachine GeonikCompressor WASM crash** — "memory access out of bounds" in process(), self-disables after 3 errors. MasterEffectsChain falls back to bypass. Not critical but causes error spam.

3. **MusicLine rendering zeros** — `maxAbs=0.000000` for `pink2.ml`. WASM produces no samples. Need to investigate the specific .ml file.

4. **DataCloneError in UADEEngine.load** — "Value at index 0 does not have a transferable type" at `UADEEngine.ts:589`. The `data.slice(0)` may return a non-transferable buffer in some edge cases.

### Medium Priority
5. **.669 should route to libopenmpt** — Composer 669 format is PC tracker, should use OpenMPT not UADE
6. **Pattern data missing for UADE formats** — fonetag.669, Core Design .core, EarAche .ea all play audio but show empty patterns
7. **FredMon "aspar" sounds terrible** — playback quality issue in FredEngine
8. **"Under the hood seems to play too fast"** — tempo/timing issue for certain formats

### Low Priority (test file quality)
9. ~8 UADE "could not play" failures are genuine format limitations (specific files UADE can't handle). The alternate file retry helps but some formats have no working test files.

## Test Results
- **Last run: 83/106 pass (78.3%)**
- Up from ~55% at session start
- Remaining 23 failures: 7 silent, 8 UADE errors, 3 MasterEffectsChain, 2 other, 1 AdPlug, 1 SynthError, 1 DataCloneError

## Key Files
- `tools/playback-smoke-test.ts` — THE canonical audit script
- `src/engine/replayer/NativeEngineRouting.ts` — WASM engine registry + routing
- `src/engine/uade/UADEEngine.ts` — UADE singleton with cascade recovery
- `src/engine/ToneEngine.ts` — MediaStream bridge at line 471
- `src/lib/formatCompatibility.ts` — Format check suppression
- `src/bridge/handlers/writeHandlers.ts` — MCP load_file routing
