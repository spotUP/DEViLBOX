# S3M (ScreamTracker 3)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/S3MParser.ts`
**Extensions:** `.s3m`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/ScreamTracker/`

---

## Overview

ScreamTracker 3 by Future Crew (1994) was the dominant PC tracker before FastTracker II
and Impulse Tracker. It introduced the 4-letter "SCRM" magic (stored at offset 0x2C),
paragraph-addressed sample and pattern data, and a compact per-row packed pattern
encoding. Supports up to 32 channels and up to 99 samples.

Reference: OpenMPT `soundlib/Load_s3m.cpp`, `S3MTools.h`

---

## File Layout

### S3M File Header

```
Offset  Size  Description
------  ----  -----------
0x00    28    title[28] (ASCII, null-padded)
0x1C    1     dosEof (0x1A)
0x1D    1     type (must be 0x10 = module)
0x1E    2     reserved[2]
0x20    2     ordNum (u16LE) — number of orders
0x22    2     smpNum (u16LE) — number of samples (instruments)
0x24    2     patNum (u16LE) — number of patterns
0x26    2     flags (u16LE)
0x28    2     cwtv (u16LE) — created-with tracker version
0x2A    2     formatVersion (u16LE): 1 = signed PCM, 2 = unsigned PCM
0x2C    4     magic: "SCRM"
0x30    1     globalVol (u8, 0–64)
0x31    1     initialSpeed (u8, ticks/row)
0x32    1     initialBPM (u8, BPM)
0x33    1     masterVolume (u8; bit7 = stereo)
0x34    12    reserved[12]
0x40    32    channels[32] (u8 per channel; 0xFF = disabled)
```

### After Fixed Header

```
ordNum bytes:    order list (u8 each; 255 = end, 254 = skip/+++)
smpNum × u16LE:  sample parapointers (multiply by 16 for file offset)
patNum × u16LE:  pattern parapointers (multiply by 16 for file offset)
```

---

## Sample Header (80 bytes at parapointer × 16)

```
Offset  Size  Description
------  ----  -----------
0       1     sampleType (u8): 1 = PCM sample; 0 = empty; others = AdLib (skip)
1       12    filename[12]
13      3     dataPointer[3]: file_offset = (b[0] | b[1]<<8 | b[2]<<16) × 16
16      4     length (u32LE, in bytes)
20      4     loopStart (u32LE, in bytes)
24      4     loopEnd (u32LE, in bytes)
28      1     defaultVolume (u8, 0–64)
29      1     reserved
30      1     pack (u8): 0 = raw PCM; 1 = DP30ADPCM (skip/unsupported)
31      1     flags (u8): bit0=loop, bit1=stereo, bit2=16-bit
32      4     c5speed (u32LE, Hz at middle C = C-5)
36      12    reserved[12]
48      28    name[28] (ASCII)
76      4     magic: "SCRS"
```

---

## Detection Algorithm

```
1. buf.byteLength >= 0x30
2. buf[0x1C] == 0x1A  (DOS EOF)
3. buf[0x1D] == 0x10  (module type)
4. buf[0x2C..0x2F] == "SCRM"
```

---

## Pattern Format (packed, 64 rows)

```
Per pattern at parapointer × 16:
  packed_len (u16LE) — bytes of packed data following
  64 rows, each row:
    read bytes until 0x00 (end-of-row sentinel)
    Each non-zero byte:
      channel    = byte & 0x1F
      if byte & 0x20: note (u8) + instrument (u8)
        note encoding:  high nibble = octave (0-9), low nibble = semitone (0-11)
        note 0xFE = note cut; 0xFF = empty
      if byte & 0x40: volume (u8, 0–64)
      if byte & 0x80: command (u8) + param (u8)
```

**Note decoding:**
```
octave   = (note >> 4) & 0x0F
semitone = note & 0x0F
XM note  = octave × 12 + semitone + NOTE_MIN
```

---

## Effects

S3M effects use letter-based commands (A–Z) that map to standard tracker effects:

| Cmd | Name |
|-----|------|
| A | Set Speed |
| B | Pattern Jump |
| C | Pattern Break |
| D | Volume Slide |
| E | Porta Down |
| F | Porta Up |
| G | Porta to Note |
| H | Vibrato |
| I | Tremor |
| J | Arpeggio |
| K | Vibrato + Vol Slide |
| L | Porta + Vol Slide |
| O | Sample Offset |
| Q | Retrig |
| R | Tremolo |
| S | Extended (Sxy) |
| T | Set Tempo (BPM) |
| U | Fine Vibrato |
| V | Global Volume |

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/S3MParser.ts`
- **OpenMPT reference:** `soundlib/Load_s3m.cpp`, `S3MTools.h`
