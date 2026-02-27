# Symphonie Pro (.symmod)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/SymphonieProParser.ts`
**Extensions:** `.symmod`, `.synmod`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/Symphonie Pro/`

---

## Overview

Symphonie is an Amiga tracker format by Thomas Zanac with an unusual chunk-based structure.
Symphonie Pro is an enhanced version adding stereo detune and sample normalisation features.
Files are identified by "SymM" magic at offset 0. The related `SymphonieParser.ts` handles
the base format; `SymphonieProParser.ts` handles the Pro variant (detected by presence of
`SampleBoost` chunk type 10).

Reference: OpenMPT `soundlib/Load_symmod.cpp`

---

## File Layout

### File Header (16 bytes)

```
Offset  Size  Description
------  ----  -----------
0       4     magic: "SymM"
4       4     version (u32BE, must be 1)
8       4     firstChunkID (i32BE, must be -1 = NumChannels)
12      4     numChannels (u32BE, 1–256)
```

### Chunk Stream (after header)

Each chunk:
```
chunkType (i32BE)
data (variable — inline 4-byte value OR packed block)
```

---

## Detection Algorithm

```
1. buf.byteLength >= 16
2. buf[0..3] == "SymM"
3. u32BE(4) == 1  (version)
4. i32BE(8) == -1  (firstChunkID = NumChannels)
```

**Symphonie vs Symphonie Pro:** Pro variant identified by presence of chunk type 10
(`SampleBoost`) or type 11 (`StereoDetune`) in the stream.

---

## Chunk Types

| ID  | Name | Description |
|-----|------|-------------|
| -1  | NumChannels | Already in header |
| -2  | TrackLength | u32BE: rows per track (max 1024) |
| -3  | PatternSize | Skip 4 bytes |
| -4  | NumInstruments | Skip 4 bytes |
| -5  | EventSize | u32BE: must be 4 (bytes per event) |
| -6  | Tempo | u32BE: BPM = 1.24 × min(val, 800) |
| -7  | ExternalSamples | Skip 4 bytes |
| -10 | PositionList | Packed array of SymPosition (32 bytes each) |
| -11 | SampleFile | Length-prefixed raw sample data blob |
| -12 | EmptySample | No data; increment sample counter |
| -13 | PatternEvents | Packed array of SymEvent (4 bytes each) |
| -14 | InstrumentList | Packed array of SymInstrument (256 bytes each) |
| -15 | Sequences | Packed array of SymSequence (16 bytes each) |
| -16 | InfoText | Packed text (song message; first line = song name) |
| -17 | SamplePacked | Delta-compressed 8-bit sample |
| -18 | SamplePacked16 | Block-delta-compressed 16-bit sample |
| 10  | SampleBoost | u32BE: normalisation factor (Pro only) |
| 11  | StereoDetune | u32BE (Pro only) |
| 12  | StereoPhase | u32BE (Pro only) |

---

## Packed Block Format

Chunks with non-inline data use this wrapper:

```
u32BE packedLength
if packedLength > 6 and next 4 bytes == "PACK" and next 2 bytes == 0xFFFF:
  u32BE unpackedLength
  RLE payload → decompress
else:
  raw bytes (packedLength bytes)
```

### RLE Decompression

```
Repeat until type == -1:
  int8 type:
    0: u8 count + count raw bytes     → emit raw
    1: u8 count + u32 dword          → repeat dword count times
    2: u32 dword                      → write dword twice
    3: u8 count                       → write count zero bytes
   -1: end of stream
```

---

## Event Format (SymEvent, 4 bytes)

```
byte 0: command (u8)
byte 1: note (i8, signed)
byte 2: param (u8)
byte 3: instrument (u8)
```

---

## SymSequence (16 bytes)

```
start (u16BE), length (u16BE), loop (u16BE), info (i16BE),
transpose (i16BE), padding[6]
```

---

## SymPosition (32 bytes)

```
dummy[4], loopNum (u16BE), loopCount (u16BE),
pattern (u16BE), start (u16BE), length (u16BE),
speed (u16BE), transpose (i16BE), eventsPerLine (u16BE),
padding[12]
```

---

## SymInstrument (256 bytes)

First 128 bytes = name (or virtual/transwave header). Then:
```
type (i8), loopStartHigh (u8), loopLenHigh (u8), numRepetitions (u8),
channel (u8), dummy1 (u8), volume (u8, 0–199), dummy2[3],
finetune (i8), transpose (i8), sampleFlags (u8), filter (i8),
instFlags (u8), downsample (u8), ...
```

---

## Panning

`channel & 1 → right (+50), else → left (−50)` (standard Amiga LRRL).

---

## Note Mapping

```
note range 0–84 → output note = note + 25  (1-based, C-0 offset)
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/SymphonieProParser.ts`
- **OpenMPT reference:** `soundlib/Load_symmod.cpp`
