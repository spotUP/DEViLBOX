---
date: 2026-04-06
topic: tfmx-wasm-playback
tags: [tfmx, wasm, playback, handoff]
status: final
---

# Handoff: TFMX Native WASM Playback

## What Was Done

### TFMX WASM Full-Module Playback Engine
Replaced UADE for TFMX audio with libtfmxaudiodecoder WASM engine:

1. **C API** (`tfmx-wasm/src/tfmx_synth.cpp`):
   - `tfmx_load_module(mdat, smpl, subsong)` — writes both files to MEMFS as mdat.song/smpl.song, uses `tfmxdec_load()` for multi-file pairing
   - `tfmx_module_render()` — renders audio + increments samples counter
   - `tfmx_get_samples_rendered()` — returns playback position for pattern tracking
   - `tfmx_module_voice_volume/voices/mute_voice/song_end/songs/duration` — full control API
   - Build: `FORCE_FILESYSTEM=1` for MEMFS, all 10 new functions in EXPORTED_FUNCTIONS

2. **Worklet** (`public/tfmx/TFMX.worklet.js`):
   - `loadModule`/`modulePlay`/`moduleStop`/`moduleMuteVoice` message handlers
   - Module render path in `process()` with ~10Hz position updates
   - Position counter uses `-= threshold` to prevent drift

3. **TFMXEngine** (`src/engine/tfmx/TFMXEngine.ts`):
   - `loadTune(mdat, smpl)`, `play()`, `stop()`, `pause()`, `onPositionUpdate()`
   - Error handler drains `_moduleLoadedResolvers` to prevent hung promises
   - `setMuteMask()` for per-voice mute control

4. **NativeEngineRouting** (`src/engine/replayer/NativeEngineRouting.ts`):
   - TFMXModule entry: `fileDataKey='tfmxFileData'`, `formats=['TFMX']`, `suppressNotes=true`
   - Custom position sync: converts `samplesRendered` → row/position, feeds both `useWasmPositionStore` AND `FormatPlaybackState`
   - Excluded from generic `onPositionUpdate` handler
   - Stop via async `dynamicResolver` for engines without `staticRef`

5. **Routing** (`AmigaFormatParsers.ts`):
   - TFMX path sets `format='TFMX'`, `tfmxFileData`, `tfmxSmplData` (no more UADE dependency)
   - Falls back to UADE on native parse failure

6. **Plumbing**:
   - `TrackerSong` gains `tfmxFileData`, `tfmxSmplData`, TrackerFormat gains `'TFMX'`
   - `useFormatStore` stores/resets both fields
   - `usePatternPlayback` passes them to `replayer.loadSong()`
   - UADE companion file cache survives WASM reinit

### Pattern Scrolling
- wasmPos allowed in format mode when FormatPlaybackState isn't active
- FormatPlaybackState also driven from WASM position updates (dual feed)
- Early exit guard simplified to just `wasmPos.active`

### UADE Companion File Fix
- Companion files cached in JS-side Map in UADE worklet
- Re-registered after every WASM reinit via `_restoreCompanionFiles()`

## Known Issues / Future Work
- Position tracking is time-based (samplesRendered / samplesPerRow), not tick-exact
- libtfmxaudiodecoder has internal `songPosCurrent` but no C API to query it
- Pattern scroll speed depends on correct BPM/speed from TFMXParser
- TFMX 7V (hip7) format not tested with WASM path — may need separate handling
- Some TFMX files share sample banks across multiple mdat files (e.g. turrican series) — companion file name mismatch

## Key Files
| File | Purpose |
|------|---------|
| `tfmx-wasm/src/tfmx_synth.cpp` | C wrapper with module playback API |
| `tfmx-wasm/CMakeLists.txt` | Build config (FORCE_FILESYSTEM, exports) |
| `public/tfmx/TFMX.{js,wasm,worklet.js}` | Built WASM + worklet |
| `src/engine/tfmx/TFMXEngine.ts` | Singleton engine with module playback |
| `src/engine/replayer/NativeEngineRouting.ts` | TFMXModule registry entry + position sync |
| `src/lib/import/parsers/AmigaFormatParsers.ts` | TFMX routing (format='TFMX') |
| `src/stores/useFormatStore.ts` | tfmxFileData/tfmxSmplData storage |
| `src/hooks/audio/usePatternPlayback.ts` | Passes tfmxFileData to replayer |
| `src/components/tracker/PatternEditorCanvas.tsx` | wasmPos + FormatPlaybackState scroll |
| `public/uade/UADE.worklet.js` | Companion file cache for reinit |
