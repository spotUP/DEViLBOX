# MED (MED2 / MED3 / MED4)

**Status:** FULLY_NATIVE — synthesis via OctaMEDSynth engine
**Parser:** `src/lib/import/formats/MEDParser.ts`
**Extensions:** `med`, UADE eagleplayer
**Replayer source:** `docs/formats/Replayers/MED/`
**Reference files:** `Reference Music/MED/`

---

## Overview

MED is the predecessor to OctaMED, the Amiga multi-channel tracker. Files with the `.med`
extension use one of three sub-version formats:

| Magic | Version | Notes |
|-------|---------|-------|
| `MED\x02` | MED 2 | Fixed 32-sample header with fixed offsets |
| `MED\x03` | MED 3 | Bitmask-compressed sample headers, variable length |
| `MED\x04` | MED 4 | Further compression, per-block sizes, IFF-like trailing chunks |

All three use the same ProTracker-like block/track/position arrangement and share the
same OctaMEDSynth synthesis engine in DEViLBOX. MED files commonly appear alongside
OctaMED files and use the same synth instrument types.

---

## MED 2 File Layout (`MED\x02`)

```
Offset  Size      Description
------  --------  -----------
0x000   4         Magic: "MED\x02"
0x004   500       Sample names (32 × 40 bytes, null-padded ASCII, 32 samples total)
0x1F8   64        Sample volumes (32 × 2 bytes, one word per sample; only low byte used)
0x238   64        Loop start offsets (32 × 2 bytes, in sample words)
0x278   64        Loop lengths (32 × 2 bytes, in sample words; 1 = no loop)
0x2B8   2         Number of blocks (BL)
0x2BA   64        Position list (64 bytes; values are block indices)
0x2FA   2         Song length (actual number of entries in position list)
0x2FC   2         Tempo (BPM × 10 approximately)
0x2FE   2         Module flags:
                    Bit 0: Filter on
                    Bit 1: Jumping
                    Bit 2: Every 8th
0x300   2         Slide value
0x302   4         Jumping mask
0x306   16        Colors (8 words, palette data)
0x316   BL×?      Block data (variable-length blocks)
                  (Sample data follows, if samples are attached)
```

**Sample names:** 40 bytes each at offset 0x004. The first 40 bytes = sample 1 name,
next 40 = sample 2, etc. Use these as instrument display names.

### MED 2 Block Data

Each block:
```
  0  4  Unknown header
  4  1024  Block data (16 channels × 64 rows × 4 bytes = 1024 bytes, ProTracker layout)
```

---

## MED 3 File Layout (`MED\x03`)

```
Offset  Size      Description
------  --------  -----------
0x000   4         Magic: "MED\x03"
0x004   32×20     Sample names (32 samples × up to 20 bytes each, variable-length null-terminated)
        4         Volume bitmask (32 bits — one per sample; if set, a 1-byte volume follows)
                  Volume bytes for set bits
        4         Loop start bitmask (32 bits; if set, a 2-byte loop start follows)
                  Loop start words
        4         Loop length bitmask (32 bits; if set, a 2-byte loop length follows)
                  Loop length words
        2         Number of blocks (BL)
        2         Song length (SL)
        SL        Position list (SL bytes)
        2         Tempo
        1         Playing transpose
        1         Module flags:
                    Bit 0: Filter on
                    Bit 1: Jumping
                    Bit 2: Every 8th
                    Bit 3: Module contains samples
        2         Slide
        4         Jumping mask
        16        Colors (8 words)
        4         MIDI channel mask (32 bits; if set, a 1-byte MIDI channel follows)
                  MIDI channels for set bits
        4         MIDI preset mask (32 bits; if set, a 1-byte MIDI preset follows)
                  MIDI presets
        BL×?      Packed block data
```

If samples are present (module flags bit 3):
```
        4         Sample mask (32 bits; one per sample; if set, sample data follows)
          For each set bit:
            4     Sample length (SL_bytes)
            2     Sample type
            SL_bytes  Sample PCM data or synth data depending on type
```

**Sample names** are variable-length null-terminated strings at the start of each slot.
Parse carefully as the total length of this region varies.

### MED 3 Block Data (packed)

Each block:
```
  0  1  Number of tracks
  1  1  Block flags (8 bits, each indicating how rows are packed)
  2  2  Block data length (BDL)
  4  ?  Conversion masks
  ?  BDL Block data (compressed note data)
```

---

## MED 4 File Layout (`MED\x04`)

```
Offset  Size      Description
------  --------  -----------
0x000   4         Magic: "MED\x04"
0x004   1         Mask bitmask (one bit per byte in the sample bitmask block)
0x005   ?         Sample bitmask and per-sample fields (variable, bitmask-driven):
                  For each set bit:
                    1  Sample flags (inverted: 1 = NOT present):
                         Bit 0: Loop start in words (2 bytes)
                         Bit 1: Loop length in words (2 bytes)
                         Bit 2: MIDI channel (1 byte)
                         Bit 3: MIDI preset (1 byte)
                       4-5: Volume (1 byte)
                         6: Transpose (1 byte)
                    1  Length of sample name (NL)
                    NL Sample name (ASCII)
                    ?  Extra fields based on sample flags (loop start, loop length, etc.)
        2         Number of blocks (BL)
        2         Song length (SL)
        SL        Position list
        2         Tempo
        1         Playing transpose
        1         Module flags:
                    Bit 0: Filter on
                    Bit 1: Jumping
                    Bit 2: Every 8th
                    Bit 3: Module contains samples
                    Bit 4: Volume in hex (else BCD)
                    Bit 5: Sliding mode (0 = MED, 1 = SoundTracker)
                    Bit 6: 8 channel mode
                    Bit 7: Slow HQ mode
        2         Tempo 2 (extended tempo)
        20        Colors (10 words, extended palette)
        10        Track volumes
        1         Master volume
        BL×?      Packed block data
```

If samples are present:
```
        8         Sample mask (64 bits — one per sample)
          For each set bit:
            4     Sample length
            2     Sample type (0 = PCM, 1+ = synth)
            ?     Sample or synth data
        (IFF-like trailing chunks after samples):
          4       Chunk name (e.g. "MEDV", "ANNO", "HLDC")
          4       Chunk length
          ?       Chunk data
```

### Known Trailing Chunks (MED 4)

| Chunk | Description |
|-------|-------------|
| `MEDV` | Editor version: 2 bytes unknown, 1 byte major version, 1 byte minor |
| `ANNO` | Annotation: null-terminated ASCII comment string |
| `HLDC` | Unknown extended data |

### MED 4 Block Data (packed)

Each block:
```
  0  1  Size of block header (BH)
  1  1  Number of tracks
  2  1  Number of rows - 1
  3  2  Block data length (BDL)
  5  ?  Block flag bytes (1 byte per 64 rows — e.g. 146 rows → 3 flag bytes)
  ?  ?  Line and effect masks (bitmask-compressed note presence)
  ?  BDL Block PCM/note data
```

---

## Track Row Format (when uncompressed, ProTracker-compatible)

```
4-byte row layout (same as ProTracker / OctaMED):
  Byte 0-1: AAAABBBB BBBBBBBB
    A (4 bits) = High nibble of sample number
    B (12 bits) = Amiga period value
  Byte 2-3: CCCCDDDD EEEEEEEE
    C (4 bits) = Low nibble of sample number (A<<4|C = full sample number)
    D (4 bits) = Effect command
    E (8 bits) = Effect argument
```

---

## Reference Implementations

- **MED replayer:** `docs/formats/Replayers/MED/` (check for `.s`/`.asm` files)
- **NostalgicPlayer specs:**
  - `docs/formats/MED2.txt`
  - `docs/formats/MED3.txt`
  - `docs/formats/MED4.txt`

---

## Implementation Notes

**Current status:** FULLY_NATIVE — `MEDParser.ts` emits `'OctaMEDSynth'` instruments,
using the same OctaMED synthesis engine as OctaMED files. The OctaMEDSynth WASM engine
handles all three MED format variants.

OctaMED synthesis instruments (software waveforms) use `'OctaMEDSynth'` synthType.
PCM sample instruments use `'Sampler'` or `'OctaMEDSynth'` depending on the sample type
field. See `MEDParser.ts` for the exact routing.
