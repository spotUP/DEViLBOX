# Furnace .fur Import Debugging Report

**Date:** February 10, 2026  
**Status:** ⚠️ INCOMPLETE - Audio Still Silent  
**Test File:** Balmeranda.fur (version 223, old format, TIA platform)

---

## Problem Statement

Furnace .fur files import successfully into DEViLBOX tracker but play completely silent despite:
- Notes triggering correctly
- Instruments loading successfully  
- WASM engine accepting instrument data
- No errors in console

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

**Result:** Macros positioned correctly by code field. Build successful. **Audio test incomplete.**

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

1. **Audio Output**:
   - WASM render logs: `maxRaw=0, maxOut=0` (completely silent)
   - No waveform generation despite notes triggering
   - All 11 TIA synth instances created successfully
   - Chips initialized, instruments loaded, but produce zero output

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

### Console Logs (Last Test)

```
[FurnaceParser OLD] Inst 0 parsed 1 macros
[FurnaceParser OLD] Inst 0 rawBinaryData captured: 179 bytes, first 4 bytes: INS2

[FurnaceEncoder] Encoding instrument 0: "Balmeranda"
[FurnaceEncoder] Writing 1 macros at offset 71
[FurnaceEncoder] Macro details: [{…}]  ← Collapsed, need to expand
[FurnaceEncoder] Encoded 176 bytes
[FurnaceEncoder] First 16 bytes (hex): f0 b1 01 08 b0 00 00 00 00 00 00 00 47 00 00 00

[FurnaceDispatch] Loaded full instrument 0: Balmeranda (type 8)

[TrackerReplayer] Triggering synth note: inst=1 type=FurnaceTIA note=C1 vel=1.00

[FurnaceDispatch] render #500: maxRaw=0, maxOut=0  ← SILENT!
```

### Binary Analysis

Encoded bytes: `f0 b1 01 08 b0 00 00 00 00 00 00 00 47 00 00 00`

- `f0 b1` = Magic ✅
- `01` = Version ✅
- `08` = Type (TIA chipType 8) ✅
- `b0 00 00 00` = Total size 176 bytes ✅
- `00 00 00 00` = FM offset 0 (no FM data for TIA) ✅
- `47 00 00 00` = STD offset 71 (macros at byte 71) ✅

**STD offset is non-zero, macros are being written.**

---

## Open Questions

### Critical Unknowns

1. **Macro Data Values:**
   - Are the volume macro data values correct? (need to expand `[{…}]` log)
   - Are they all zeros? That would explain silent output.
   - Expected: [15, 14, 13, 12, 11, 10, 9, 8] or similar descending volume envelope

2. **Macro Code Field:**
   - Is `code=0` being read correctly from INS2 format?
   - If `code` is undefined or wrong, volume macro might not be at position 0

3. **WASM Macro Parsing:**
   - Does WASM correctly read the encoded macro format?
   - Are there endianness issues with int32 values?
   - Does TIA platform expect different macro layout?

4. **Type Field Mismatch:**
   - Parser logs: `type=0` for macros
   - Is this the correct type value for volume macros?
   - Does WASM use `type` field or just position?

### Debugging Gaps

- Never expanded the `Macro details: [{…}]` console log to see full object
- No logging of actual int32 values being written to binary
- No verification that `code` field exists on parsed macros
- No WASM-side logging of macro data being read

---

## Next Steps (When Resuming)

### Immediate Actions

1. **Add Enhanced Logging:**
   ```typescript
   // In FurnaceInstrumentEncoder.ts (ALREADY ADDED, need to rebuild)
   console.log(`[FurnaceEncoder] First macro code=${firstMacro.code} data=[${firstMacro.data}]`);
   ```

2. **Rebuild and Re-test:**
   ```bash
   npm run build
   # Re-import Balmeranda.fur
   # Expand console logs to see macro data array
   ```

3. **Verify Macro Code Field:**
   - Check if `code` field exists on FurnaceMacro type in `types/instrument.ts`
   - Current global type lacks `code` field (only in parser's local interface)
   - May need to add to global type or cast in converter

4. **Test with Simple Instrument:**
   - Create minimal TIA instrument in Furnace with known volume macro
   - Export as .fur, import into DEViLBOX
   - Compare parsed macro data with original

### Secondary Investigation

5. **Hexdump Comparison:**
   ```bash
   # Compare encoded binary vs original INS2 from .fur file
   # Verify macro data is identical
   ```

6. **WASM Debugging:**
   - Add logging to `FurnaceDispatchWrapper.cpp` macro parsing (lines 3696-3733)
   - Rebuild WASM with debug output
   - Verify macro data arrives correctly in C++ code

7. **Alternative Test:**
   - Try importing newer .fur format (FINS instead of INS2)
   - See if newer format has different macro structure
   - May reveal issues with old format parsing

### Type System Fixes

8. **Add `code` to Global FurnaceMacro Type:**
   ```typescript
   // In src/types/instrument.ts
   export interface FurnaceMacro {
     code?: number;  // 0=volume, 1=arp, 2=duty, etc.
     type: number;
     data: number[];
     loop?: number;
     release?: number;
     mode?: number;
     delay?: number;
     speed?: number;
     open?: boolean;
   }
   ```

9. **Remove Type Casts:**
   - Once `code` is in global type, remove `(macro as any).code` casts
   - Ensures type safety throughout pipeline

---

## Modified Files Summary

### Created Files

1. **src/lib/export/FurnaceInstrumentEncoder.ts** (316 lines)
   - `BinaryWriter` class with writeUint8/16/32, writeInt32, writeString, writeMagic
   - `patchUint32()` for backpatching header offsets
   - `encodeFurnaceInstrument()` main encoder function
   - Implements complete `0xF0 0xB1` binary format
   - Macro positioning by `code` field

### Modified Files

2. **src/lib/import/formats/FurnaceSongParser.ts**
   - Line 947-952: Enhanced logging for old format parsing
   - Captures rawBinaryData (no longer used for upload)
   - Logs macro count per instrument
   - Local FurnaceMacro interface includes `code` field

3. **src/engine/furnace-dispatch/FurnaceDispatchSynth.ts**
   - Line 132-140: `uploadInstrumentFromConfig()` rewritten
   - Removed raw binary bypass shortcut
   - Always encodes from config using FurnaceInstrumentEncoder
   - Dynamic import for code splitting

4. **src/engine/InstrumentFactory.ts**
   - Line 438: Added `uploadInstrumentFromConfig()` call for Furnace instruments
   - Ensures instruments upload during creation, not just on param changes

5. **src/types/instrument.ts**
   - Added `FurnaceConfig.furnaceIndex?: number`
   - Added `FurnaceConfig.rawBinaryData?: Uint8Array` (legacy, not used)
   - Global `FurnaceMacro` still lacks `code` field (needs fixing)

### Reference Files (Not Modified)

6. **furnace-wasm/common/FurnaceDispatchWrapper.cpp**
   - Line 3633: Magic byte check for `0xF0 0xB1`
   - Line 3644-3695: Header parsing
   - Line 3696-3733: Macro parsing (15 slots expected)

---

## Architecture Overview

```
.fur file (INS2 format)
  ↓
FurnaceSongParser.parseFurnaceInstrument()
  - Extracts rawBinaryData (captured but unused)
  - Parses MA blocks into macros[]
  - Each macro: code, type, length, loop, release, mode, delay, speed, data[]
  ↓
InstrumentConverter.convertInstrument()
  - Maps ParsedInstrument → InstrumentConfig
  - Passes macros array through unchanged
  - Sets synthType="FurnaceTIA" for type 8
  ↓
InstrumentFactory.createInstrumentFromConfig()
  - Creates FurnaceDispatchSynth instance
  - Calls uploadInstrumentFromConfig(config.furnace, config.name)
  ↓
FurnaceDispatchSynth.uploadInstrumentFromConfig()
  - Dynamic import of FurnaceInstrumentEncoder
  - Calls encodeFurnaceInstrument(config, name)
  - Uploads binary to FurnaceDispatchEngine
  ↓
FurnaceInstrumentEncoder.encodeFurnaceInstrument()
  - Creates 0xF0 0xB1 binary format
  - Positions macros by code field (0-14)
  - Returns Uint8Array
  ↓
FurnaceDispatchEngine.uploadFurnaceInstrument()
  - Sends binary to WASM worklet
  - WASM parses and loads instrument
  ↓
FurnaceDispatchWrapper.cpp setInstrumentFull()
  - Validates magic bytes
  - Parses header, name, macros
  - Loads into TIA chip emulator
  ↓
TIA chip plays notes...
  ❌ EXCEPT IT DOESN'T - maxRaw=0, maxOut=0
```

---

## Performance Notes

- Build time: ~1.5 seconds
- Dynamic import of encoder: ~50ms (code-split, only loads when needed)
- Encoding time: <1ms per instrument
- Binary size: 126-198 bytes per TIA instrument (depends on name length and macro data)

---

## User Requirements (Saved to Memory)

**Critical principle:** NO SHORTCUTS when debugging. Always fix root cause properly.

Quotes from user:
- "no quick fix, root cause fixes only"
- "i already told you once to not take this shortcut do it properlu"
- "'memory' no shortcuts when debugging ALWAYS fix the root cause properly"

This guided all architectural decisions and prevented taking raw binary bypass shortcuts.

---

## Conclusion

**5 major bugs fixed, 1 audio issue remains.**

The import pipeline is architecturally sound with proper parsing, encoding, and upload. Binary format matches WASM expectations. Instruments load successfully. But audio output is completely silent (`maxRaw=0, maxOut=0`).

**Most likely remaining issues:**
1. Macro data values are all zeros (volume envelope missing)
2. Macro `code` field not being read correctly from parser
3. WASM macro interpretation differs from our encoding

**Next debug session must:**
- Expand console logs to see actual macro data arrays
- Verify `code` field exists and equals 0 for volume macros
- Add int32 value logging to encoder
- Compare encoded binary with working Furnace instruments

**Estimated time to fix:** 1-2 hours once macro data values are visible in logs.

---

## Files for Reference

- `/Users/spot/Code/DEViLBOX/src/lib/export/FurnaceInstrumentEncoder.ts`
- `/Users/spot/Code/DEViLBOX/src/lib/import/formats/FurnaceSongParser.ts`
- `/Users/spot/Code/DEViLBOX/src/engine/furnace-dispatch/FurnaceDispatchSynth.ts`
- `/Users/spot/Code/DEViLBOX/src/engine/InstrumentFactory.ts`
- `/Users/spot/Code/DEViLBOX/src/types/instrument.ts`
- `/Users/spot/Code/DEViLBOX/furnace-wasm/common/FurnaceDispatchWrapper.cpp` (reference)

Test file: `Balmeranda.fur` (version 223, 11 TIA instruments, 24 patterns)
