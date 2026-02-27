# MusicLine Editor

**Status:** NATIVE_SAMPLER — parser extracts PCM samples, uses Sampler engine
**Parser:** `src/lib/import/formats/MusicLineParser.ts`
**Extensions:** `ml.*`, UADE eagleplayer
**Reference files:** `Reference Music/Musicline Editor/` (818 files)
**Reference source:** `Reference Code/musicline-vasm/Mline116.asm`

---

## Overview

MusicLine Editor is an Amiga tracker with a unique chunk-based file format using
an `"MLEDMODL"` magic header. It supports variable channel counts, RLE-compressed
pattern data, arpeggios, and instrument waveform synthesis. PCM samples are stored
with optional delta packing.

**Primary reference:** `Reference Code/musicline-vasm/Mline116.asm` (verified 1:1
against binary layout).

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0x00    4     "MLED" (first half of magic)
0x04    4     "MODL" (second half of magic; combined "MLEDMODL")
0x08    4     sizeField (uint32BE) — size of extra header bytes following
0x0C    N     Extra header (N = sizeField bytes; version-dependent, e.g. 4, 8, 12)
0x0C+N  ...   Chunk stream (variable)
```

First chunk starts at `offset = 8 + 4 + sizeField = 12 + sizeField`.

---

## Chunk Format

Each chunk header:
```
Offset  Size  Description
------  ----  -----------
0x00    4     Chunk ID (ASCII 4CC)
0x04    4     Chunk data size (uint32BE, not including this 8-byte header)
0x08    ...   Chunk data
```

### Chunk Order

```
VERS (optional) → TUNE → PART×N → ARPG×M → INST×I → SMPL×S → INFO (optional)
```

---

## TUNE Chunk (40-byte fixed header + variable channel data)

```
Offset  Size  Description
------  ----  -----------
0x00    32    Song title (ASCII, null-padded)
0x20    2     Tempo (uint16BE)
0x22    1     Speed (ticks per row)
0x23    1     Groove (swing setting)
0x24    2     Volume (uint16BE, 0–200)
0x26    1     Play mode flags
0x27    1     Number of channels
0x28    ...   numChannels × uint32BE: per-channel chnl_Data byte counts
  ...         For each non-zero count: that many bytes of chnl_Data
```

### chnl_Data Entry (2 bytes, uint16BE)

```
byte0 (HIGH_BYTE):  Low 8 bits of part number
byte1 (LOW_BYTE):
  bit5 = 0 → Play-part entry:
    bits 7:6 = high 2 bits of part number → partNum = (bits7:6 << 8) | byte0
    bits 4:0 = transpose offset (0x10 = no transpose; range −16..+15 semitones)
  bit5 = 1 → Control command:
    bits 7:6 = 01 → STOP (silence voice)
    bits 7:6 = 10 → JUMP (byte0 = target position index)
    bits 7:6 = 11 → WAIT (byte0 = wait count; bits 4:0 = new speed if non-zero)
```

Default fill: `0x0010` (play PART 0, no transpose).

Song position advances when the current PART's row 128 wraps to 0.

---

## PART Chunk (single-voice data, 128 rows × 12 bytes uncompressed)

```
First 2 bytes: part number (uint16BE)
Remaining: RLE-compressed rows
```

**Decompressed:** 128 rows × 12 bytes per row, for ONE voice:

```
Row byte layout (12 bytes):
  Offset  Size  Description
  ------  ----  -----------
  0       1     Note (0=rest, 1–60=musical note, 61=end-of-part sentinel)
  1       1     Instrument (1-based; 0=no change; 0xFF=no change sentinel)
  2–11    10    Effect data (effectNum, effectPar, 4 × effectWord)
```

The 6 RLE columns per row correspond to 6 × 2 bytes of one voice row.
PARTs are shared across all channels.

---

## ARPG Chunk

Arpeggio data used by instruments. Structure and count defined by the instrument
definitions (INST chunks reference ARPG entries).

---

## INST Chunk (206 bytes per instrument)

Each INST chunk contains 206 bytes of instrument parameters:
- Title (embedded in structure)
- Volume, ADSR parameters
- Waveform type (`smplType` field):
  - `smplType == 0` → PCM sample instrument → routed to Sampler
  - `smplType > 0` → Waveform synthesis type (soft synth)

**ML synthesis instruments** (`smplType > 0`) are handled via an embedded waveform
type config (`mlSynthConfig: { waveformType, volume }`) within the Sampler
instrument wrapper.

---

## SMPL Chunk (sample data + 50-byte metadata)

```
Offset  Size  Description
------  ----  -----------
0x00    4     rawDataSize (uint32BE) — size of uncompressed sample data
0x04    1     deltaCommand flag (0=raw, 1=delta-packed)
0x05    1     Padding
0x06    50    Sample metadata (title through semiTone fields)
0x38    ...   Sample data (raw 8-bit PCM or delta-packed nibbles)
```

**Delta packing:** If `deltaCommand != 0`, sample data is stored as delta-encoded
nibbles. Each nibble is a signed 4-bit delta applied to the running value.

**Sample metadata (50 bytes):**
- Title string
- Loop start and length
- Fine tune
- Volume
- Sample rate / semiTone offset

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/MusicLineParser.ts`
- **Assembly reference:** `Reference Code/musicline-vasm/Mline116.asm`

---

## Implementation Notes

**Current status:** NATIVE_SAMPLER

`MusicLineParser.ts` extracts all instrument and sample data:
- Sample instruments → `createSamplerInstrument()` with PCM from SMPL chunk
- Synthesis instruments → Sampler wrapper with `mlSynthConfig` waveform type
- Song structure (TUNE chnl_Data + PART positions) → TrackerSong patterns

**PART sharing:** PARTs are shared across all channels; the parser creates per-channel
pattern sequences by following each channel's chnl_Data list of PART references.

**Variable channels:** The TUNE header specifies numChannels (can be more than 4),
making this a flexible multi-channel format.
