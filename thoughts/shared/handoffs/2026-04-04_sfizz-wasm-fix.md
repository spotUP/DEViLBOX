---
date: 2026-04-04
topic: sfizz-wasm-fix
tags: [sfizz, wasm, synth, audio, debugging]
status: draft
---

# Handoff: Sfizz WASM Fix — Voice Renders Zero Audio

## Task
Fix the Sfizz SFZ sample player WASM synth. Originally crashed with "thread constructor failed" — now initializes but renders zero audio.

## What Was Fixed
1. **pthread crash** — sfizz's FilePool creates std::thread members. Patched `third-party/sfizz/src/sfizz/FilePool.h:373-375` with `#ifndef __EMSCRIPTEN__` guard to remove thread members.
2. **ThreadPool crash** — `globalThreadPool()` in `FilePool.cpp:53` returns nullptr under `__EMSCRIPTEN__`. Synchronous loading in `getFilePromise()` via direct `loadingJob()` call.
3. **FilePool destructor** — guarded thread join calls with `#ifndef __EMSCRIPTEN__`
4. **waitForBackgroundLoading** — no-op under `__EMSCRIPTEN__`
5. **HEAPU8 export** — added to EXPORTED_RUNTIME_METHODS in CMakeLists.txt
6. **Velocity normalization** — SfizzSynth.ts sends 0.0-1.0 float (sfizz HD API) not 0-127 integer
7. **SFZ loading** — fixed message type mismatch (was 'loadSFZ', now writes to MEMFS + loadSfzFile)
8. **Build config** — `sfizz-wasm/CMakeLists.txt` uses `build-wasm-nopthread` libs, `-sUSE_PTHREADS=0`

## Current State — BLOCKED

### Working
- WASM initializes without crash (engine ptr non-zero)
- SFZ loads (1 region, 1 group, 1 preloaded sample)
- MEMFS has both files (`default_sample.wav` 88244 bytes, `default.sfz` 164 bytes)
- Voices activate on noteOn (active voices = 1)
- Audio pipeline works (test sine tone at 0.3 amplitude outputs correctly)
- No assertion failures in debug build

### Not Working
- **sfizz_render_block produces ZERO audio** despite active voices
- Even built-in `sample=*sine` oscillator produces zero (no file I/O involved)
- C-level test with stack-allocated 128-frame buffers: peak=0.000000
- SIMDE_NO_NATIVE (pure scalar fallback) doesn't help — not a SIMD issue
- Debug build (ASSERTIONS=2, DISABLE_EXCEPTION_CATCHING=0) shows no asserts
- Buffer pool works correctly with 128-frame blocks

### Key Diagnostic Output
```
[sfizz-test] osc loaded, regions=1
[sfizz-test] noteOn, voices=1
[sfizz-test] block0: first4=[0.000000,-0.000000,-0.000000,-0.000000] voices=1
[sfizz-test] osc peak=0.000000 after 8 blocks
```

The `-0.000000` values suggest DSP IS computing but results are denormalized/zero. Voices stay active but produce no audio output.

## Next Steps (Deep Investigation Needed)

1. **Add printf to sfizz voice render** — In `Reference Code/sfizz/src/sfizz/Voice.cpp`, find `renderBlock` and add prints at key stages:
   - Does the voice's generator produce non-zero samples?
   - Does the amplitude envelope open (attack > 0)?
   - What's the voice state (playing, released, free)?
   - Are wavetables populated (check first few values)?

2. **Check buffer pool allocation** — In `Synth.cpp:renderBlock`, verify `tempSpan` and `tempMixSpan` are non-null and have correct sizes. The `bufferPool.setNumBuffers(0)` call in `clear()` might not re-allocate after SFZ load.

3. **Check if `clear()` resets samplesPerBlock** — If `loadSfzFile` calls `clear()` which resets the internal block size, the buffer pool might be empty after load. Add `sfizz_set_samples_per_block` after every `sfizz_load_file/string` call.

4. **Try wothke's sfizz WASM** — Check if there's an existing working sfizz WASM port to compare against.

## Critical Files

| File | Purpose |
|------|---------|
| `sfizz-wasm/CMakeLists.txt` | Bridge build config (currently has test tone hack) |
| `sfizz-wasm/common/sfizz_bridge.cpp` | C bridge (has test_render diagnostic + test tone) |
| `public/sfizz/Sfizz.worklet.js` | AudioWorklet (has debug logging) |
| `src/engine/sfizz/SfizzSynth.ts` | TS API layer (has debug logging) |
| `third-party/sfizz/src/sfizz/FilePool.h` | Patched: thread guards |
| `third-party/sfizz/src/sfizz/FilePool.cpp` | Patched: sync loading, no-op waits |
| `third-party/sfizz/build-wasm-nopthread/` | Current build dir (Debug, SIMDE_NO_NATIVE) |
| `Reference Code/sfizz/` | Clean upstream source for comparison |

## Build Commands
```bash
# Rebuild static libs
cd third-party/sfizz/build-wasm-nopthread
emmake make -j8

# Rebuild bridge
cd sfizz-wasm/build
emcmake cmake .. && emmake make

# Deploy
cp sfizz-wasm/build/Sfizz.{js,wasm} public/sfizz/
```

## Cleanup Needed Before Ship
- Remove test tone from `sfizz_bridge.cpp` (testPhase/testActive globals + sin injection in render)
- Remove `sfizz_bridge_test_render` diagnostic function
- Remove debug logging from `Sfizz.worklet.js`
- Remove debug logging from `SfizzSynth.ts`
- Switch build back to Release mode (ASSERTIONS=0, DISABLE_EXCEPTION_CATCHING=1)
- Remove SIMDE_NO_NATIVE flag
