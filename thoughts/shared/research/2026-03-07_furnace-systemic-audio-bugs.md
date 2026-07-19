---
date: 2026-03-07
topic: furnace-systemic-audio-bugs
tags: [furnace, wasm, audio, bugs, compat-flags, chip-flags]
status: draft
---

# Furnace Systemic Audio Bugs — Root Cause Analysis

## TL;DR

The WASM infrastructure is actually solid (94% method coverage, all frequency calcs,
all sample/wavetable/instrument systems work). The bugs are in the **data pipeline**:
song metadata not flowing from .fur file → WASM engine.

## Root Causes Found

### 1. Chip Flags NOT Parsed from .fur Files — CRITICAL
- FurnaceSongParser.ts SKIPS the 128-byte chip flags block: `reader.skip(128)`
- Each chip has flags like `clockSel` (NTSC/PAL/Dendy), chip model, etc.
- `furnace_dispatch_create()` passes empty `DivConfig` → platforms use NTSC defaults
- PAL C64 songs play 3.8% too fast, PAL NES songs have wrong APU clock
- Some chips have flags beyond clock: chip model selection, special modes
- File: `src/lib/import/formats/FurnaceSongParser.ts:1026-1033`

### 2. Tuning NOT Sent to WASM — HIGH
- FurnaceSongParser extracts `module.tuning` from .fur file
- But it's NOT included in `furnaceData` output (line 2234-2245)
- NOT in FurnaceNativeData type definition
- FurnaceDispatchEngine has NO `setTuning()` method
- WASM export `furnace_dispatch_set_tuning()` EXISTS but is never called
- All songs play at 440.0 Hz regardless of song setting
- File: `src/lib/import/formats/FurnaceSongParser.ts:668,1040,2234-2245`

### 3. Dual Macro Engine — FIXED (this session)
- Wrapper's macro engine ran alongside platform's native macros
- Caused double register writes, gate retriggering, volume drift
- Fixed by removing wrapper macro engine entirely

### 4. Instrument Data Gaps — FIXED (this session)
- Old INST format parser missing FM macros, release points, extended macros
- Missing chip-specific decoders for 60+ instrument types
- Fixed by completing old format parser + adding 6 chip decoders

## What's Actually Working

- Engine stub: 17/18 methods implemented (only PC Speaker missing)
- Frequency calculations: calcBaseFreq, calcFreq, calcArp, calcBaseFreqFNumBlock — all correct
- Sample/wavetable upload: complete pipeline with all 16 sample depths
- Macro engine: macroInt.cpp compiled in, platforms handle macros natively
- Compat flags: parsed from .fur AND sent to WASM (both dispatch and sequencer)
- Grooves: parsed and uploaded to WASM sequencer
- All 143 platforms compile and link
- All sound cores (reSID, ymfm, etc.) compiled in

## Remaining Fixes Needed

### P0 — Fix chip flags pipeline
1. Parse 128-byte chip flags block in FurnaceSongParser.ts
2. Store in FurnaceNativeData (per-chip flags array)
3. Add WASM API: `furnace_dispatch_set_flags(handle, flagsData, len)`
4. Wire through worklet to pass flags after chip creation
5. Each platform's `setFlags(config)` will receive correct clock/model

### P1 — Fix tuning pipeline
1. Include tuning in furnaceData output from FurnaceSongParser
2. Add tuning to FurnaceNativeData type
3. Add `setTuning(value)` method to FurnaceDispatchEngine
4. Call it during song load

## Files Referenced

- `src/lib/import/formats/FurnaceSongParser.ts:1026-1033` — chip flags skipped
- `src/lib/import/formats/FurnaceSongParser.ts:668,1040` — tuning parsed
- `src/lib/import/formats/FurnaceSongParser.ts:2234-2245` — tuning not in output
- `src/engine/furnace-dispatch/FurnaceDispatchEngine.ts` — no setTuning method
- `furnace-wasm/common/FurnaceDispatchWrapper.cpp:389-932` — create with empty flags
- `furnace-wasm/common/FurnaceDispatchWrapper.cpp:1164-1170` — setTuning exists
- `furnace-wasm/common/furnace_preempt.h:395` — default tuning 440.0
- `third-party/furnace-master/src/engine/platform/c64.cpp:902-954` — setFlags example
