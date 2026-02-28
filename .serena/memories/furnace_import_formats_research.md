---
date: 2026-02-26
topic: Furnace format importers and VGM/NSF/SID/SAP/AY handling
tags: [furnace, formats, importers, research]
status: final
---

# Furnace Reference Source: Format Import Analysis

## Critical Finding

**Furnace does NOT import VGM, NSF, SID, SAP, or AY formats.** It only exports to these formats.

Furnace is a multi-system tracker/sequencer that imports other TRACKER formats (MOD, XM, IT, S3M, etc.) and Furnace's own formats (FUR, DMF), then EXPORTS to chip register logs (VGM) or ROM export formats (SAP-R for Atari 2600, ZSM for Sega Genesis, etc.).

---

## Furnace's Import Pipeline

### File Loading Entry Point
- **File**: `/Users/spot/Code/DEViLBOX/Reference Code/furnace-master/src/engine/fileOps/fileOpsCommon.cpp:22`
- **Function**: `bool DivEngine::load(unsigned char* f, size_t slen, const char* nameHint)`

### Load Process (3 Steps)

**Step 1: Zlib Decompression** (lines 49-140)
- Attempts to decompress file as zlib (many Furnace formats are zlib-compressed)
- If decompression fails, treats file as raw binary
- Throws `NotZlibException` if not zlib, falls through to raw handling

**Step 2: Magic Byte Detection** (lines 142-165)
Checks file magic bytes and dispatches to specific loaders:
- `DIV_DMF_MAGIC` (".DelekDefleMask.") → `loadDMF()` (DefleMask 1.x format)
- `DIV_FTM_MAGIC` ("FamiTracker Module") → `loadFTM()` (FamiTracker)
- `DIV_DNM_MAGIC` ("Dn-FamiTracker Module") → `loadFTM()` with flags
- `DIV_FUR_MAGIC` ("-Furnace module-") → `loadFur()` (Furnace native)
- `DIV_FUR_MAGIC_DS0` ("Furnace-B module") → `loadFur()` with variant
- `DIV_FC13_MAGIC`/`DIV_FC14_MAGIC` → `loadFC()` (FamiComposer)
- `DIV_TFM_MAGIC` ("TFMfmtV2") → `loadTFMv2()` (TFM v2)
- `DIV_IT_MAGIC` ("IMPM") → `loadIT()` (Impulse Tracker)
- `DIV_S3M_MAGIC` ("SCRM" at offset 0x2c) → `loadS3M()` (Scream Tracker 3)
- `DIV_XM_MAGIC` ("Extended Module: ") → `loadXM()` (FastTracker II)

**Step 3: MOD and TFEv1 Fallback** (lines 167-173)
- If extension is `.tfe`, tries `loadTFMv1()` (TFM v1)
- Otherwise tries `loadMod()` (ProTracker MOD and variants)

**Step 4: Failure** (lines 175-179)
- If none match, returns false with "not a compatible song" error

---

## Imported Formats (With File Paths)

### 1. **MOD (ProTracker/Amiga/PC)**
- **File**: `fileOps/mod.cpp`
- **Magic Detection**: Byte 1080, 4-byte signature (M.K., M!K!, M&K!, CD81, OKTA, OCTA, etc.)
- **Key Function**: `bool DivEngine::loadMod(unsigned char* file, size_t len)` at line 22

**Data Structures Used**:
- `DivSong ds` — the main song container
- `DivSample* sample` — for 31 samples (line 106)
- `ds.subsong[0]->ordersLen` — order sequence length
- `ds.system` — set based on magic (Amiga vs PC)

**Key Parsing** (lines 50-150):
- Reads header: song name (20 bytes), 31 sample headers
- Sample header format:
  - Name (22 bytes)
  - Length in words (2 bytes, big-endian)
  - Fine tune (4-bit signed)
  - Default volume (1 byte)
  - Loop start (2 bytes, big-endian)
  - Loop length (2 bytes, big-endian)
- Calculates center rate using `pow(2.0, fineTune/96.0) * 8363.0`
- Reads order list, patterns

**Register Mapping**: None — MOD is sample-based, not register-based

### 2. **XM (FastTracker II)**
- **File**: `fileOps/xm.cpp`
- **Magic**: "Extended Module: " at offset 0
- **Key Function**: `bool DivEngine::loadXM(unsigned char* file, size_t len)`

**Parsing Approach**:
- Header: signature, module name, frame delay
- Instruments section: header size, sample count, instruments
- Patterns section: pattern data
- Orders section: order list

**Note**: Line 2652 in `gui/gui.cpp` shows warning that envelope conversion to macros may differ from XM playback.

### 3. **IT (Impulse Tracker)**
- **File**: `fileOps/it.cpp`
- **Magic**: "IMPM" at offset 0
- **Key Function**: `bool DivEngine::loadIT(unsigned char* file, size_t len)`

**Special Handling**: 
- Line 2655 in `gui/gui.cpp` warns that envelopes convert to macros, global/channel volume changes unsupported, NNA not supported

### 4. **S3M (Scream Tracker 3)**
- **File**: `fileOps/s3m.cpp`
- **Magic**: "SCRM" at offset 0x2c
- **Key Function**: `bool DivEngine::loadS3M(unsigned char* file, size_t len)`

**Special Handling**:
- Line 2649 in `gui/gui.cpp` warns OPL instruments may be detuned

### 5. **DMF (DefleMask 1.x)**
- **File**: `fileOps/dmf.cpp` (63955 bytes — very complex)
- **Magic**: ".DelekDefleMask." (16 bytes)
- **Key Function**: `bool DivEngine::loadDMF(unsigned char* file, size_t len)`

**Key Structures**:
- Uses zlib decompression internally
- `SafeReader` for binary parsing (defined in engine/)
- Reads chip system definitions, instruments with FM/ADPCM/wavetable data

### 6. **FUR (Furnace Native)**
- **File**: `fileOps/fur.cpp` (85142 bytes)
- **Magic**: "-Furnace module-" or "Furnace-B module" (16 bytes)
- **Key Function**: `bool DivEngine::loadFur(unsigned char* file, size_t len, int variantID=0)`

**Variants**:
- Vanilla (DIV_FUR_VARIANT_VANILLA = 0)
- B variant (DIV_FUR_VARIANT_B = 1) — DS0 fork

### 7. **FTM (FamiTracker)**
- **File**: `fileOps/ftm.cpp` (99862 bytes)
- **Magic**: "FamiTracker Module" (18 bytes)
- **Key Function**: `bool DivEngine::loadFTM(unsigned char* file, size_t len, bool dnft, bool dnftSig, bool eft)`
- Also handles **DNM** (Dn-FamiTracker) and **EFT** (FamiTracker variants) with flags

**Note**: Handles NES-specific features (DPCM samples, VRC6, Namco 163, Sunsoft)

### 8. **FC (FamiComposer)**
- **File**: `fileOps/fc.cpp` (21532 bytes)
- **Magic**: "SMOD" or "FC14"
- **Key Function**: `bool DivEngine::loadFC(unsigned char* file, size_t len)`

### 9. **TFM (Text Format Module)**
- **Files**: `fileOps/tfm.cpp` (28194 bytes)
- **Magic**: "TFMfmtV2" (8 bytes) for v2
- **Key Functions**:
  - `bool DivEngine::loadTFMv2(unsigned char* file, size_t len)` (magic-based detection)
  - `bool DivEngine::loadTFMv1(unsigned char* file, size_t len)` (extension-based, `.tfe`)

---

## Core Data Structures

### DivSong (Main Song Container)
**File**: `src/engine/song.h`

Key fields populated by importers:
- `std::string name` — song title
- `DivSystem system[32]` — chip systems (GameBoy, NES, Sega Genesis, etc.)
- `std::vector<DivSubSong*> subsong` — subsongs (mostly one per file)
- `std::vector<DivInstrument*> instrument` — instruments
- `std::vector<DivSample*> sample` — samples
- `std::vector<DivPattern*> pattern` — note patterns per channel
- `int version` — tracks source format (DIV_VERSION_MOD, DIV_VERSION_XM, etc.)
- `DivCompatFlags compatFlags` — playback compatibility flags

### DivInstrument (Instrument Definition)
**File**: `src/engine/instrument.h`

Type field determines data layout:
- `DIV_INS_FM` — FM synthesis (Yamaha OPN/OPL)
- `DIV_INS_STD` — standard (volume/arp/duty/filter macros)
- `DIV_INS_GB` — Game Boy specific
- `DIV_INS_AMIGA` — Amiga wavetable
- `DIV_INS_ADPCM_A` / `DIV_INS_ADPCM_B` — ADPCM variants
- etc.

Contains:
- `std::string name`
- `int type`
- `std::vector<int> macro[DIV_INS_MAX_MACROS]` — automation/macros
- FM-specific: `fm` struct with operators, envelope data
- Wavetable pointer for wavetable instruments

### DivPattern (Note Pattern)
**File**: `src/engine/pattern.h`

- `std::vector<DivNote> notes` — notes in pattern
- Each DivNote contains:
  - `short note` — MIDI note (0-119) or special values
  - `signed char oct` — octave
  - `int vol` — volume
  - `short pitch` — pitch bend
  - `std::vector<int> effects` — effect list

### DivSubSong (Subsong/Order List)
**File**: `src/engine/song.h`

- `std::vector<int>* orders` — array of pattern indices per channel
- `int ordersLen` — number of orders
- `int speed` — ticks per row
- `int tempo` — BPM

---

## Helper Classes

### SafeReader (Binary Parsing)
**File**: `src/engine/safeReader.h` / `safeReader.cpp`

Methods used in importers:
- `int readC()` — read 1 byte
- `short readS()` / `readS_BE()` — read 2 bytes (LE/BE)
- `int readI()` / `readI_BE()` — read 4 bytes (LE/BE)
- `String readStringLatin1(int len)` — read fixed-length string
- `int seek(int pos, int whence)` — seek in buffer
- `int tell()` — current position
- Throws `EndOfFileException` on read failure

---

## Export Formats (NOT Import)

These formats are exported TO, not imported FROM:

### VGM (Video Game Music Logging)
- **File**: `src/engine/vgmOps.cpp`
- **Function**: `void DivEngine::performVGMWrite(...)` (massive register write serialization)
- **Purpose**: Log register writes for accurate hardware emulation playback
- **Data**: Register addresses + values per chip, with timing

### ROM Exports
- **Files**: `src/engine/export/` (sapr.cpp, tiuna.cpp, zsm.cpp, ipod.cpp, grub.cpp)
- **Purpose**: Export as playable ROM for specific systems
  - SAP-R: Atari 2600 (7800 cart format)
  - ZSM: Sega Genesis
  - TiUNA: various
  - iPod: classic iPod SCSI protocol
  - GRUB: GameBoy ROM

---

## What's NOT Implemented

❌ **VGM Import** — Furnace can EXPORT to VGM but not import from it
❌ **NSF Import** — Furnace can export NES, but no NSF import
❌ **SID Import** — Furnace has C64 chips, but no 6581/8580 SID file import
❌ **SAP Import** — Furnace exports SAP-R (Atari 2600), but doesn't import SAP/SAP2
❌ **AY Import** — No AY/AYM file import (though AY is a target system)

**Reason**: Furnace is a tracker designed around note/pattern sequencing with chip synthesis, not register log parsing. It doesn't have parsers for "chip register logs" (VGM) or format-specific register data (NSF has custom 6502 code, SID has filter modulation, etc.).

---

## Key Differences from VGM-Style Importers

Furnace importers focus on **musical data** (notes, instruments, patterns), not **hardware register logs**:

1. **Pattern-based**: MOD, XM, IT, S3M all have patterns (2D grid of notes)
2. **Instrument abstraction**: All use DivInstrument which normalizes synthesis (macros, envelopes)
3. **No register capture**: Importers convert musical intent to Furnace equivalent, not replicate register state
4. **System agnostic**: Same MOD file can play on Genesis, NES, C64 by swapping the system

VGM files, by contrast, are **register logs** — they capture exact register writes with timing, which is why they can't be "imported" into a tracker (you can't decompose register sequences back to note/instrument data reliably).

---

## References

- Load dispatcher: `src/engine/fileOps/fileOpsCommon.cpp:22-180`
- MOD import: `src/engine/fileOps/mod.cpp`
- XM import: `src/engine/fileOps/xm.cpp`
- IT import: `src/engine/fileOps/it.cpp`
- S3M import: `src/engine/fileOps/s3m.cpp`
- DMF import: `src/engine/fileOps/dmf.cpp`
- FUR import: `src/engine/fileOps/fur.cpp`
- FTM import: `src/engine/fileOps/ftm.cpp`
- FC import: `src/engine/fileOps/fc.cpp`
- TFM import: `src/engine/fileOps/tfm.cpp`
- VGM export: `src/engine/vgmOps.cpp`
- ROM export: `src/engine/export/*.cpp`
- GUI loader: `src/gui/gui.cpp:2554` (FurnaceGUI::load function)
