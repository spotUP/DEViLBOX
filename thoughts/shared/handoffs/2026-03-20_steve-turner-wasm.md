---
date: 2026-03-20
topic: steve-turner-wasm-engine
tags: [steve-turner, wasm, amiga, instrument-preview, mute-solo]
status: draft
---

# Steve Turner WASM Engine — Handoff

## What Works
- **C replayer** — 1200+ lines, faithful ASM translation with 7-phase envelope, vibrato, pitch slide
- **WASM build** — 18KB, Emscripten, shadow DMA registers for sample looping
- **Song playback** — offroad.jpo plays correctly at ~100Hz ($1BC0 timer), loops correctly in native test
- **Pattern parsing** — 8 patterns × 64 rows, split at block boundaries, BPM=250 for 100Hz
- **Pattern order** — all 8 positions in songPositions (was hardcoded to [0])
- **Synth editor** — SteveTurnerControls (Envelope/Vibrato/Misc tabs) in both SynthTypeDispatcher + SynthControlsRouter
- **Synth info** — registered in amigaSynths.ts, categories.ts, amigaSynthLayouts.ts, PixiEditInstrumentModal.tsx
- **Type system** — SteveTurnerSynth in SynthType, ToneEngine, InstrumentFactory
- **Note preview C code** — player_note_on/off exports in WASM, paula channel 0

## What Needs Fixing

### 1. Mute/Solo (HIGH PRIORITY)
The DOM UI's mute/solo buttons go through:
- `useTrackerStore.toggleChannelMute` → `forwardWasmMuteStates` → `getGainEngine()` → `getActiveGainEngine()` (from useMixerStore)
- `getActiveGainEngine` checks `fmt.steveTurnerFileData` in the format store
- **Root cause unclear**: the engine starts (`SteveTurner loaded & playing` in logs) which proves `steveTurnerFileData` IS in the song object. But `getActiveGainEngine` may not find it.
- **Debug approach**: Add console.log INSIDE `getActiveGainEngine` at the steveTurner check to see if it's reached. Also check if any earlier `else if` branch catches first (e.g., a stale engine from a previously loaded format).

### 2. Speed Override (MEDIUM)
- Parser sets `initialSpeed: 9` and `setSpeed(9)` is called in UnifiedFileLoader
- But the transport store shows `speed: 6` after load
- Fixed `setOriginalModuleData` to include `initialBPM`/`initialSpeed` so `usePatternPlayback` can read them
- The `usePatternPlayback` now uses `modData?.initialSpeed ?? transportSpeed` (was hardcoded to 6)
- May still need verification that the `originalModuleData` is set before `usePatternPlayback` reads it

### 3. Song Looping (MEDIUM)
- C replayer loops correctly (native test confirms `finished=0` after 6000 ticks)
- Browser: tracker replayer reaches end of pattern order → triggers `stopNativeEngines` → kills audio
- Fix: either set `restartPosition: 0` so tracker loops, or make the tracker replayer not stop WASM engines on song end

### 4. Instrument Preview (LOW)
- `player_note_on` works in C (tested natively)
- SteveTurnerSynth eagerly inits engine in constructor
- Engine output connects to `audioContext.destination` for preview
- Issue: complex lifecycle between eager init, startNativeEngines, pause/resume

### 5. Pattern Data Accuracy (LOW)
- Note values and row positions come from the parser's decode of the binary pattern blocks
- Parser and C replayer process the same bytes — need tick-by-tick comparison
- The note-to-XM mapping (`xmNote = b + 13`) may need calibration against the freq table

## Key Files
| File | Purpose |
|------|---------|
| `steve-turner-wasm/src/steveturner/steveturner.c` | C replayer (1200+ lines) |
| `steve-turner-wasm/src/steveturner/steveturner_wrapper.c` | WASM bridge with pause/resume/noteOn |
| `steve-turner-wasm/src/steveturner/paula_soft.c` | Paula emulator with shadow DMA |
| `steve-turner-wasm/CMakeLists.txt` | Emscripten build |
| `public/steveturner/SteveTurner.{js,wasm,worklet.js}` | WASM output |
| `src/engine/steveturner/SteveTurnerEngine.ts` | Singleton engine |
| `src/engine/steveturner/SteveTurnerSynth.ts` | Instrument synth (note preview) |
| `src/components/instruments/controls/SteveTurnerControls.tsx` | Knob editor UI |
| `src/lib/import/formats/SteveTurnerParser.ts` | Binary parser |
| `src/stores/useMixerStore.ts` | getActiveGainEngine (mute/solo routing) |
| `src/stores/useTrackerStore.ts` | forwardWasmMuteStates (DOM UI mute path) |

## Files Modified (beyond new files)
- `src/types/instrument/base.ts` — SteveTurnerSynth in SynthType union
- `src/types/instrument/exotic.ts` — SteveTurnerConfig interface
- `src/types/instrument/defaults.ts` — DEFAULT_STEVE_TURNER + InstrumentConfig field
- `src/engine/TrackerReplayer.ts` — steveTurnerFileData on TrackerSong
- `src/engine/ToneEngine.ts` — SteveTurnerSynth in 3 switch/list locations
- `src/engine/InstrumentFactory.ts` — SteveTurnerSynth case
- `src/engine/replayer/NativeEngineRouting.ts` — WASM engine entry
- `src/stores/useFormatStore.ts` — steveTurnerFileData field
- `src/stores/useMixerStore.ts` — getActiveGainEngine check
- `src/hooks/audio/usePatternPlayback.ts` — steveTurnerFileData + transportSpeed
- `src/lib/file/UnifiedFileLoader.ts` — setOriginalModuleData with BPM/speed
- `src/lib/import/formats/SteveTurnerParser.ts` — parser changes
- `src/components/instruments/editors/SynthTypeDispatcher.tsx` — editor dispatch
- `src/components/instruments/editors/UnifiedInstrumentEditor.tsx` — editorMode mapping
- `src/components/tracker/SynthControlsRouter.tsx` — DOM UI controls routing
- `src/pixi/views/instruments/amigaSynthLayouts.ts` — Pixi layout
- `src/pixi/dialogs/PixiEditInstrumentModal.tsx` — Pixi synth type sets
- `src/constants/synthCategories/amigaSynths.ts` — synth info
- `src/constants/synthCategories/categories.ts` — category list
