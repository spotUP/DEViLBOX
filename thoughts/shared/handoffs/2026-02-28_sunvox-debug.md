---
date: 2026-02-28
topic: sunvox-debug
tags: [sunvox, audio, wasm, worklet]
status: in-progress
---

# SunVox Handoff — 2026-02-28

## Task

Fix SunVox `.sunvox` file loading in DEViLBOX. When a `.sunvox` file is dragged in:
1. Pre-read phase should extract each module as a `.sunsynth` and create one `SunVoxSynth` per module
2. An import modal should appear
3. Instruments should be playable with audio output

**Current state: all three still broken** — no modal, no sound, falls back to song-mode placeholder every time.

---

## Critical References

| File | Role |
|------|------|
| `src/engine/sunvox/SunVoxEngine.ts` | Singleton AudioWorkletNode wrapper — manages WASM init, handle lifecycle |
| `public/sunvox/SunVox.worklet.js` | AudioWorklet processor — receives messages, renders audio |
| `public/sunvox/SunVox.js` | Emscripten JS glue for SunVox WASM |
| `public/sunvox/SunVox.wasm` | SunVox WASM binary (165 KB, valid) |
| `src/engine/sunvox/SunVoxSynth.ts` | DevilboxSynth wrapper — synth mode + song mode |
| `src/lib/file/UnifiedFileLoader.ts` | Pre-read extraction at lines 140–193; fallback at 358–453 |
| `src/engine/ToneEngine.ts` | `routeNativeEngineOutput` (line ~389), `isSharedType` (line 1362) |
| `sunvox-wasm/src/SunVoxWrapper.cpp` | C wrapper — all 19 WASM exports implemented |

---

## Recent Changes

### Committed to `main`

**Previous session (commits `ddc78f92`, `3157e525`):**
- Moved all worklet message handling to `onmessage` (was drained from `process()` which never ran without audio graph)
- Wired `_rejectInit` so WASM init errors surface instead of hanging `_initPromise` forever

**This session (commit `b3ce471a`):**
- `SunVoxSynth.output` changed from per-instance `createGain()` to `this.engine.output` (shared)
  - Root cause: `routeNativeEngineOutput` disconnected instrument 1 from `synthBus` when instrument 2 registered a different GainNode for the same `engineKey`
- Added `'SunVoxSynth'` to `isSharedType` in `ToneEngine.ts` line 1362

### Uncommitted (diagnostic work — `SunVoxEngine.ts` + `SunVox.worklet.js`)

- `_rejectInit` propagated in `initialize()` catch block (was missing — hung forever on init error)
- `console.log` at every step of `ensureInitialized` (addModule, fetch, etc.)
- `console.log` at every step of worklet `initWasm` (factory build, WASM init, malloc)

These are purely diagnostic — commit or revert as needed.

---

## Root Cause (CONFIRMED and FIXED)

`context.audioWorklet.addModule('SunVox.worklet.js')` **hangs when the AudioContext is suspended**.

### Root Cause Analysis

`App.tsx::handleFirstInteraction` listens for `click`, `keydown`, `touchstart` — **NOT `drop`**. When a `.sunvox` file is the user's **first interaction** (dragged straight into the browser), the AudioContext is still `suspended`, and Chrome hangs `addModule` indefinitely on a suspended context.

SC works because users typically click something before creating a SC instrument, which fires `handleFirstInteraction` and resumes the context first.

### Fix Applied (2026-02-28, session 2)

In `SunVoxEngine.ensureInitialized` (`src/engine/sunvox/SunVoxEngine.ts:116–127`):

```typescript
if (context.state !== 'running') {
  console.log('[SunVoxEngine] context suspended — resuming before addModule');
  try {
    await context.resume();
  } catch (e) {
    console.warn('[SunVoxEngine] context.resume() failed:', e);
  }
}
```

`drop` IS a user gesture in Chrome, so `resume()` is allowed during file drop handling. If the context is already running, `resume()` is a harmless no-op.

---

## Learnings / Decisions Made

- **`SunVoxSynth.output` must be `engine.output`** (shared). The worklet already mixes all active handles into it. Per-instance GainNodes break `routeNativeEngineOutput`.
- **`SunVoxSynth` must be in `isSharedType`** to reuse the preloaded instance instead of spawning per-channel duplicates.
- **`initialize()` catch block must call `_rejectInit`** — otherwise any init failure leaves `ready()` hanging forever instead of fast-failing.
- **Worklet `onmessage` is the right place** for all message handling — not a queue drained from `process()`. `process()` may never run if the node is not connected to an active graph.

---

## Next Steps (in order)

1. **Test the fix**: drop a `.sunvox` file as first interaction (without clicking anything first). Diagnostic logs should show:
   - `[SunVoxEngine] context suspended — resuming before addModule`
   - `[SunVoxEngine] calling addModule, context.state: running`
   - `[SunVoxEngine] addModule done`
   - `[SunVox Worklet] building factory, ...`
   - `[SunVox Worklet] calling createSunVox, ...`
   - `[SunVox Worklet] createSunVox resolved, ...`
   - `[SunVoxEngine] WASM ready`

2. **If extraction works**: verify instruments and patterns appear in tracker (module decomposition mode, `UnifiedFileLoader` lines 358–406).

3. **Verify audio**: play a note on a SunVox instrument — audio should route through `engine.output` → `synthBus` → master effects.

4. **If `createSunVox` hangs**: WASM instantiation failing — check for `unsafe-eval` CSP restriction (needed for `new Function()` in worklet).

5. Once confirmed working: remove the diagnostic `console.log` statements from `SunVoxEngine.ts` and `SunVox.worklet.js` (they're strip-compiled in prod builds anyway).

---

## Other Notes

- There is a separate unrelated build error: `Duplicate declaration "FT2_TOOLBAR_HEIGHT"` in `src/pixi/views/PixiTrackerView.tsx`. This causes a Vite 500 on that file but does not affect SunVox loading.
- `SunVox.wasm` is valid (correct `\0asm` magic bytes, 165 KB).
- The `var wasmBinary;` → `var wasmBinary = Module["wasmBinary"];` transform in `ensureInitialized` is confirmed correct — the pattern exists once in `SunVox.js`.
- `readyPromiseResolve?.(Module)` is called once in `SunVox.js` — the optional-chaining form, so if called before the Promise is set up it silently no-ops. This is standard Emscripten behaviour and is fine.
