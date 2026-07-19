---
date: 2026-03-06
topic: furnace-wasm-sequencer-testing
tags: [furnace, wasm, sequencer, playback, bugs]
status: in-progress
---

# Furnace WASM Sequencer — Testing Results

## Fixes Applied This Session

### 1. furnaceNative pipeline (FIXED)
- `furnaceNative` data wasn't flowing from parser through FT2Toolbar import path to format store
- Fixed in: `ModuleLoader.ts`, `FT2Toolbar.tsx`, `useModuleImport.ts`

### 2. Worklet init race condition (FIXED)
- `TrackerReplayer.play()` checked `getWorkletNode()` before dispatch engine finished initializing
- Fixed in: `TrackerReplayer.ts` — now awaits `_initPromise`

### 3. Note pitch offset (FIXED)
- Notes uploaded as `octave*12 + note` (0-179) but WASM sequencer expects `+60` (Furnace C++ convention)
- Result: all notes played ~5 octaves too low
- Fixed in: `FurnaceSequencerSerializer.ts` — adds +60 to note values (253/254/255 special values pass through)

### 4. Tempo/timing (FIXED)
- `seqSetTempo` worklet handler passed `hz` as `tempoN` — wrong argument mapping
- Tick rate divider never set — defaulted to 60.0 regardless of song's hz
- `samplesPerTick` not recalculated for sequencer
- Fixed in: `FurnaceSequencerSerializer.ts` (sends separate `setTickRate` + `seqSetTempo` messages)
- Fixed in: `FurnaceDispatch.worklet.js` (correct args, divider sync)

### 5. seqStop crash on song switch (FIXED)
- Switching songs caused `furnace_seq_stop` to dispatch through stale chip handle → memory access OOB
- Fixed in: `FurnaceDispatch.worklet.js` — guard `seqStop` with `this.sequencerActive`, reset on load

## Known Limitations

### Multi-chip songs
- Sequencer only links to ONE dispatch handle (first chip)
- Songs with multiple chips (e.g., NES + VRC6, YM2151 + SegaPCM) will only play channels on the first chip
- Channels on second chip are silent
- Need channel-to-chip mapping to fix properly

## Testing Results by Chip Type

### Game Boy (platform 6) — GOOD
- `cheap.fur`: plays correctly after pitch + tempo fixes
- 4 channels, single chip, 18 instruments loaded

### NES 2A03 (platform 8) — MOSTLY GOOD
- Standard 5-channel NES songs: ~98% correct
- Multi-chip NES songs (with expansion): second chip channels silent (known limitation)
- Some minor synth issues remain

### AY-3-8910 — SYNTH PROBLEMS
- Songs in `demos/ay8910/` have noticeable synth issues
- Likely chip dispatch problems (envelope handling, noise, tone mixing)
- TODO: investigate specific broken behaviors

### Arcade chips — SYNTH PROBLEMS
- Songs in `demos/arcade/` have many synth issues
- Covers wide range: YM2151 (OPM), SegaPCM, QSound, Namco WSG, Taito systems
- Many are multi-chip (known limitation)
- TODO: investigate per-chip

### C64/SID — NOT YET TESTED

### Genesis/YM2612 — NOT YET TESTED

### PC Engine — NOT YET TESTED

### SNES — NOT YET TESTED

## Architecture Notes

### Sequencer pipeline
```
FurnaceSongParser.ts → buildFurnaceNativeData() → FurnaceNativeData
    ↓
FT2Toolbar.tsx (handleModuleImport) → applyEditorMode({ furnaceNative })
    ↓
useFormatStore → furnaceNative stored
    ↓
usePatternPlayback → passes furnaceNative to loadSong()
    ↓
TrackerReplayer.play() → detects furnaceNative → uploads to WASM sequencer
    ↓
FurnaceSequencerSerializer.ts → uploadFurnaceToSequencer()
    ↓
FurnaceDispatch.worklet.js → furnace_seq_tick() drives playback
    ↓
FurnaceSequencer.cpp → processRow() → dispatchCmd() → chip emulation
```

### Key files
- `src/lib/export/FurnaceSequencerSerializer.ts` — uploads pattern data to WASM
- `public/furnace-dispatch/FurnaceDispatch.worklet.js` — AudioWorklet, tick processing
- `furnace-wasm/common/FurnaceSequencer.cpp` — C sequencer core (processRow, nextTick, effects)
- `furnace-wasm/common/FurnaceDispatchWrapper.cpp` — C chip dispatch wrapper
- `src/engine/TrackerReplayer.ts` — play/stop, WASM sequencer activation
- `src/engine/furnace-dispatch/FurnaceDispatchEngine.ts` — TS API to worklet

## TODO
- [ ] Debug AY-3-8910 synth issues
- [ ] Debug arcade chip synth issues
- [ ] Test C64/SID, Genesis, PC Engine, SNES
- [ ] Implement multi-chip dispatch (channel → chip handle mapping)
- [ ] Upload compat flags per song (affects effect processing behavior)
- [ ] Upload groove data per song
- [ ] Clean up debug logging in TrackerReplayer.ts
- [ ] Consider import code refactor (3 parallel import paths → 1)
