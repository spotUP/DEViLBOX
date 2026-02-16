# Furnace .fur Import Debugging Report

**Date:** February 16, 2026 (Updated)  
**Status:** 🟡 AUDIBLE - Audio is now playing, but playback is inaccurate.
**Test File:** Balmeranda.fur (version 223, old format, TIA platform)

> **Note:** For overall project status, see: [PROJECT_STATUS_2026-02-15.md](PROJECT_STATUS_2026-02-15.md)

---

## EXECUTIVE SUMMARY

**Issue:** Furnace .fur files now produce audio, but playback is inaccurate (pitch, timing, or chip parameters).

**Progress:** 7 debugging phases completed:
- ✅ Phase 1: Instruments now upload to WASM
- ✅ Phase 2: Binary format corrected
- ✅ Phase 3: Macros encoded
- ✅ Phase 4: Raw binary bypass removed
- ✅ Phase 5: Macro value corruption fixed
- ✅ Phase 6: Macro positioning corrected
- ✅ Phase 7: Audio silence resolved (Verified 2026-02-16)

**Status:** Audio is audible. Current issues involve accuracy and chip-specific behavior.

**Priority:** P1 - Accuracy and Refinement

---

## Problem Statement

Furnace .fur files import successfully into DEViLBOX tracker and now produce audio, but playback is inaccurate:
- Notes play at incorrect pitches or with wrong timing
- Instruments may have incorrect volume or timbre
- Chip-specific features (e.g., TIA AUDC) may not be correctly initialized

---

## Root Cause Analysis - Completed Phases

### Phase 1: Instruments Never Uploaded to WASM ✅

**Discovery:** Parsed instruments were converted but never sent to WASM engine.

**Fix:** Modified `InstrumentFactory.ts` to call `uploadInstrumentFromConfig()` during Furnace instrument creation.

**Result:** Instruments now upload, but with wrong format causing "Invalid instrument magic" errors.

---

### Phase 2: Binary Format Mismatch ✅

**Discovery:** WASM expects custom binary format with magic bytes `0xF0 0xB1`, not the INS2 format from .fur files.

**Investigation:**
- Examined `furnace-wasm/common/FurnaceDispatchWrapper.cpp` line 3633
- WASM rejects "FINS" and "INS2" formats
- Requires specific header structure with uint32 offsets

**Fix:** Created `src/lib/export/FurnaceInstrumentEncoder.ts` (316 lines) to encode proper binary format:
- Magic bytes: `0xF0 0xB1`
- Version: `0x01`
- Type: instrument chipType (8 for TIA)
- 32-byte header with offsets: totalSize, fmOffset, stdOffset, chipOffset, sampleOffset
- Name length + name bytes
- FM operator data (24 bytes each, only for chipType 0-3)
- STD/macro data (15 macro slots)

**Result:** WASM accepts format, logs "Loaded full instrument" messages, but still no audio.

---

### Phase 3: Macros Not Encoded ✅

**Discovery:** `stdOffset` was always 0 in encoded binary - macro data never written.

**Investigation:**
- Instruments loaded but WASM had no volume/arp/duty envelopes
- TIA instruments require macros for sound shaping

**Fix:** Implemented macro encoding in encoder:
- 7-byte header per macro: len, delay, speed, loop, release, mode, open
- Data values: `len × 4 bytes` (int32 values)
- 15 macro slots total (volMacro, arpMacro, dutyMacro, waveMacro, pitchMacro, etc.)

**Result:** Macros encoded, stdOffset populated, but still silent.

---

### Phase 4: Raw Binary Bypass Rejected ✅

**User Requirement:** "no quick fix, root cause fixes only" / "do it properlu" / "no shortcuts"

**Removed:** Shortcut code in `FurnaceDispatchSynth.ts` that used `config.rawBinaryData` directly instead of encoding.

**Enforced:** All instruments must go through parse → encode → upload pipeline.

**Result:** Proper architecture in place, but audio still broken.

---

### Phase 5: Macro Value Corruption ✅

**Discovery:** Loop and release values of 255 (representing -1 in uint8) were being converted to 0.

**Bug:** JavaScript `||` operator treats 255 as truthy but 0 as falsy:
```typescript
// WRONG - converts 255 to 0
writer.writeUint8(macro.loop || 255);

// CORRECT - preserves 255
writer.writeUint8(macro.loop !== undefined ? macro.loop : 255);
```

**Fix:** Changed all macro field writes to use `!== undefined` checks.

**Result:** Macro values preserved correctly, but still no sound.

---

### Phase 6: Macro Positioning Bug ✅ (MOST RECENT FIX)

**Discovery:** Macros have a `code` field (0=volume, 1=arp, 2=duty, etc.) indicating position in 15-slot array.

**Bug:** Encoder was writing macros sequentially:
```typescript
// WRONG - writes first macro at position 0, second at position 1
for (let i = 0; i < config.macros.length; i++) {
  writeMacro(config.macros[i]);
}
```

**Impact:** For TIA instruments, volume macro (code=0) MUST be at position 0. If any other macro was first in the array, it would be written at position 0, leaving the volume macro at the wrong position → no sound.

**Fix:** Create 15-slot array indexed by `code` field:
```typescript
const macrosByCode: any[] = new Array(15).fill(null);
for (const macro of config.macros) {
  const code = (macro as any).code;
  if (code !== undefined && code < 15) {
    macrosByCode[code] = macro;
  }
}

// Write all 15 slots in order (by code position)
for (let i = 0; i < 15; i++) {
  const macro = macrosByCode[i];
  if (macro && macro.data && macro.data.length > 0) {
    writeMacro(macro);
  } else {
    writeEmptyMacro();
  }
}
```

**Result:** Macros positioned correctly by code field. Build successful.

---

### Phase 7: Audio Silence Resolved ✅

**Status:** Audio is now audible. The root cause of the previous silence is believed to be fixed, likely due to correct macro positioning and instrument encoding.

---

## Current Status

### ✅ Working Components

1. **Parser** (`FurnaceSongParser.ts`):
   - Correctly parses old format (v223) .fur files
   - Extracts INS2 instrument blocks
   - Parses MA (macro) feature blocks
   - Captures macro `code`, `type`, `length`, `loop`, `release`, `mode`, `delay`, `speed`, `data[]`
   - All 11 instruments parsed with 1 macro each

2. **Converter** (`InstrumentConverter.ts`):
   - Converts ParsedInstrument to InstrumentConfig
   - Passes macros array through to engine
   - Maps TIA type 8 to FurnaceTIA synth

3. **Encoder** (`FurnaceInstrumentEncoder.ts`):
   - Creates valid `0xF0 0xB1` binary format
   - Writes 32-byte header with correct offsets
   - Encodes name, FM data (if applicable), macro data
   - Positions macros by `code` field into 15-slot array
   - Preserves loop/release values of 255
   - WASM accepts and loads instruments successfully

4. **Upload** (`FurnaceDispatchSynth.ts`):
   - Dynamically imports encoder (code-split)
   - Encodes from config (no raw binary shortcuts)
   - Uploads to WASM engine
   - WASM logs: "Loaded full instrument 0: Balmeranda (type 8)"

5. **Pattern Playback**:
   - Notes trigger correctly
   - BPM calculation correct (125 BPM, speed 6)
   - Instruments selected properly
   - Timing accurate

### ❌ Broken Components

1. **Playback Accuracy**:
   - Audio is audible but often incorrect (wrong pitch, timing glitches).
   - Chip parameters (AUDC for TIA, ADSR for SID) need fine-tuning.
   - Per-operator macros may not be correctly mapped yet.

---

## Technical Details

### File Format Analysis

**Input Format (INS2 from .fur file):**
```
Magic: "INS2"
Version: uint16
Type: uint8
Features: Variable blocks (NA=name, FM=operators, MA=macro)
Macro block: code, length, loop, release, mode, type, delay, speed, data[]
```

**Output Format (0xF0 0xB1 for WASM):**
```
Offset 0-1:   Magic bytes 0xF0 0xB1
Offset 2:     Version (0x01)
Offset 3:     Type (chipType, 8 for TIA)
Offset 4-7:   Total size (uint32, backpatched)
Offset 8-11:  FM offset (uint32, 0 for TIA)
Offset 12-15: STD offset (uint32, points to macro data)
Offset 16-19: Chip offset (uint32, unused)
Offset 20-23: Sample offset (uint32, unused)
Offset 24-31: Reserved (8 bytes, all 0)
Offset 32+:   Name length (uint16) + name bytes
Offset N+:    15 macros × (7-byte header + data values)
```

### Macro Format (7-byte header + data)

```
Byte 0: length (uint8)
Byte 1: delay (uint8)
Byte 2: speed (uint8)
Byte 3: loop point (uint8, 255 = no loop)
Byte 4: release point (uint8, 255 = no release)
Byte 5: mode (uint8)
Byte 6: open (uint8, 0=closed, 1=open)
Bytes 7+: data values (length × 4 bytes, int32)
```

### Macro Codes (Position in 15-slot array)

```
0  = volMacro (volume envelope) - CRITICAL for TIA sound
1  = arpMacro (arpeggio)
2  = dutyMacro (duty cycle)
3  = waveMacro (waveform)
4  = pitchMacro (pitch modulation)
5  = ex1Macro (extra 1)
6  = ex2Macro (extra 2)
7  = ex3Macro (extra 3)
8  = algMacro (algorithm)
9  = fbMacro (feedback)
10 = fmsMacro (frequency modulation sensitivity)
11 = amsMacro (amplitude modulation sensitivity)
12 = panLMacro (pan left)
13 = panRMacro (pan right)
14 = phaseResetMacro
```

---

## Test Results - Last Import

**File:** Balmeranda.fur  
**Instruments:** 11 (all TIA platform 21, chipType 8, type 8)  
**Patterns:** 24 patterns, 38 positions, 64 rows each  
**Channels:** 4

---

## Open Questions

### Critical Unknowns

1. **Macro Data Values:**
   - Are the volume macro data values correct?
   - Expected: [15, 14, 13, 12, 11, 10, 9, 8] or similar descending volume envelope

2. **WASM Macro Parsing:**
   - Does WASM correctly read the encoded macro format?
   - Are there endianness issues with int32 values?
   - Does TIA platform expect different macro layout?

---

## Next Steps (When Resuming)

### Immediate Actions

1. **Fix Chip Type Mappings:**
   - Correct incorrect mappings in `FurnaceSongParser.ts` where `FurnaceChipType` was used instead of `FurnaceDispatchPlatform`.

2. **Verify Macro Accuracy:**
   - Add logging to verify macro data arrives correctly in C++ code.

3. **Type System Fixes:**
   - Add `code` to Global FurnaceMacro Type.
   - Remove Type Casts.

---

## Modified Files Summary

### Created Files

1. **src/lib/export/FurnaceInstrumentEncoder.ts** (316 lines)
   - Implements complete `0xF0 0xB1` binary format
   - Macro positioning by `code` field

### Modified Files

2. **src/lib/import/formats/FurnaceSongParser.ts**
   - Enhanced logging for old format parsing.
   - Captures rawBinaryData.

3. **src/engine/furnace-dispatch/FurnaceDispatchSynth.ts**
   - Always encodes from config using FurnaceInstrumentEncoder.

4. **src/engine/InstrumentFactory.ts**
   - Added `uploadInstrumentFromConfig()` call for Furnace instruments.

5. **src/types/instrument.ts**
   - Global `FurnaceMacro` still lacks `code` field (needs fixing).

---

**Conclusion:** 6 major bugs fixed, audio silence resolved. Accuracy is now the primary goal.
