---
date: 2026-04-04
topic: hively-fixes-musicline-editor-sequence-editors
tags: [hively, musicline, sequence-editor, pattern-editor]
status: final
---

# Session Handoff — 2026-04-04

## HivelyTracker Standalone Instrument — DONE (but some files may be reverted)

### WASM Fixes (hively-wasm/common/HivelyWrapper.c)
1. **MAX_PLAYERS** 4→16
2. **WO_* wave offset defines** — were completely wrong (off by 202KB), causing crash
3. **ChannelGain[0]** — was 0 from calloc → silence. Set to 256 (unity)
4. **Velocity minimum** — `(64*1)/127=0` silenced notes. Added `if (scaledVol < 1 && velocity > 0) scaledVol = 1;`
5. Rebuilt WASM: `cd hively-wasm/build && emcmake cmake .. && emmake make`

### TypeScript Fixes
- **HivelySynth.ts**: lazy setup via `_setupPromise`, re-upload on preset switch (reuse handle), velocity minimum 64
- **migration.ts**: added `case 'HivelySynth': result.hively = deepMerge(DEFAULT_HIVELY, ...)`  
- **defaults.ts**: DEFAULT_HIVELY envelope extended from 80ms to ~1.3s
- **useInstrumentStore.ts**: HivelySynth config changes re-upload to WASM instead of being skipped
- **hivelyPresets.ts**: added `pe(..., 5, 0)` jump-to-0 on all sustaining presets for plist looping

### Debug Cleanup
- Removed console.warn from HivelySynth, HivelyEngine, InstrumentFactory
- Removed port.postMessage debug from Hively.worklet.js

## MusicLine Instrument Editor — Phase 1-3 DONE (files may be reverted by agent conflicts)

### Phase 1: WASM API (MusicLineWrapper.cpp + CMakeLists.txt)
- Added: `ml_read/write_inst_u8/u16/s16`, `ml_get/set_effect_flag`, `ml_get_inst_title/name`, `ml_dump_inst_offsets`, `ml_get_inst_sizeof`
- Added worklet handlers: `read-inst-field`, `write-inst-field`, `get/set-effect-flag`, `get-inst-title`, `read-inst-all`, `get-inst-offsets`
- Rebuilt WASM: `cd musicline-wasm/build && emcmake cmake .. && emmake make`

### Phase 2: Factory Content
- Copied 46 waves + 7 instruments + 3 samples to `public/musicline/factory/`
- Created `public/musicline/factory/manifest.json`

### Phase 3: DOM Editor (MusicLineControls.tsx)
- Full rewrite with 3-column Amiga-style layout
- Left: Wave Length, Volume, Finetune, Semitone, Glide, Transposable
- Center: 10 FX toggle buttons
- Right: All 10 FX detail panels (Envelope, Vibrato, Tremolo, Arpeggio, Transform, Phase, Mix, Resonance, Filter, Loop)
- Fixed "Load a MusicLine song" gate — now shows defaults when no song loaded

### Phase 4 (Pixi): NOT STARTED

## Sequence Editors — IN PROGRESS (agents running, file conflicts)

### Completed: HivelyControls Perf List
- Replaced 150 lines of DOM dropdowns/inputs with PatternEditorCanvas in format mode
- Uses existing adapter: `hivelyAdapter.ts` → `HIVELY_PERFLIST_COLUMNS`, `hivelyPerfListToFormatChannel`, `makePerfListCellChange`

### In Progress (4 agents dispatched, conflicting with each other):
1. **FC adapter** — FCControls synth macro + arpeggio → PatternEditorCanvas
2. **SidMon/DigMug/Fred/SoundMon** — 16-step arpeggio SequenceEditors → PatternEditorCanvas  
3. **InStereo2/SonicArranger** — triple arpeggio tables → PatternEditorCanvas
4. **DeltaMusic1/SidMon1** — sound table + arpeggio + waveforms → PatternEditorCanvas

### Agent Conflict Issue
Multiple agents writing to different files simultaneously caused file reverts. Next session should:
1. Wait for all agents to complete
2. Check which files still have the agents' changes vs reverted
3. Re-apply any reverted changes manually

## Files Changed (may need re-application)

| File | Change |
|------|--------|
| `hively-wasm/common/HivelyWrapper.c` | MAX_PLAYERS, WO_* defines, ChannelGain, velocity |
| `public/hively/Hively.worklet.js` | Clean debug logs |
| `src/engine/hively/HivelySynth.ts` | Lazy setup, re-upload, velocity |
| `src/engine/hively/HivelyEngine.ts` | Clean debug handler |
| `src/engine/InstrumentFactory.ts` | Clean debug log |
| `src/stores/useInstrumentStore.ts` | HivelySynth config re-upload |
| `src/lib/migration.ts` | HivelySynth migration case |
| `src/types/instrument/defaults.ts` | DEFAULT_HIVELY envelope |
| `src/constants/hivelyPresets.ts` | Jump-to-0 loop commands |
| `musicline-wasm/common/MusicLineWrapper.cpp` | Instrument parameter API |
| `musicline-wasm/CMakeLists.txt` | New WASM exports |
| `public/musicline/MusicLine.worklet.js` | Parameter handlers + clean debug |
| `src/engine/musicline/MusicLineEngine.ts` | readInstAll, writeInstField, etc. |
| `src/components/instruments/controls/MusicLineControls.tsx` | Full rewrite |
| `src/components/instruments/controls/HivelyControls.tsx` | PatternEditorCanvas perf list |
| `public/musicline/factory/*` | 46 waves + 7 instruments + 3 samples |

## MusicLine Worklet Debug Logging
The worklet keeps getting debug logging re-added (different variable names each time). Remove any `_dbgCount`, `_dbgN`, `[ML-DBG]` blocks from `public/musicline/MusicLine.worklet.js`.
