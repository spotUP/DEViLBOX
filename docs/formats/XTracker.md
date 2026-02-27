# X-Tracker (DMF)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/XTrackerParser.ts`
**Extensions:** `.dmf`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/X-Tracker/`

---

## Overview

X-Tracker (also known as Digital Music Facility, DMF) is a DOS tracker by d0pefish/Byteam.
Files begin with the "DDMF" magic and are followed by a stream of typed chunks. The first
channel is a special global track used for tempo and BPM commands. Sample data may be
compressed using DMF Huffman coding.

Reference: OpenMPT `soundlib/Load_dmf.cpp`

---

## File Layout

### File Header (66 bytes)

```
Offset  Size  Description
------  ----  -----------
0       4     Magic: "DDMF"
4       1     version (u8)
5       8     tracker[8] (ASCII tracker name, space-padded)
13      30    songname[30] (ASCII, null-padded)
43      20    composer[20] (ASCII, null-padded)
63      1     creationDay (u8, 1-based BCD)
64      1     creationMonth (u8, 1-based BCD)
65      1     creationYear (u8, year - 1900)
```

### Chunk Stream (after header)

Each chunk has a 4-byte ASCII ID + 4-byte LE length:

```
ID[4]   length(u32LE)   data[length bytes]
```

| Chunk ID | Description |
|----------|-------------|
| `CMSG`   | Comment/message text |
| `SEQU`   | Order list (sequence) |
| `PATT`   | Pattern data |
| `SMPI`   | Sample instrument headers |
| `SMPD`   | Sample PCM data |
| `SMPJ`   | Sample join table (for multi-sample instruments) |
| `ENDE`   | End-of-file marker |
| `SETT`   | Settings/configuration |

---

## SEQU Chunk

```
numOrders (u16LE)
orders[numOrders] (u16LE each, 0-based pattern indices)
```

---

## PATT Chunk

```
numPatterns (u16LE)

Per pattern:
  numRows (u16LE)
  numChannels (u8)

  Per channel (run-length packed data):
    dataSize (u16LE)
    packed row data (dataSize bytes)
```

**The first channel is a global track** for tempo and BPM commands — it does not produce
audio output.

### Channel Packing

Each row in a channel is encoded as:

```
0xFF = end of channel data

infobyte (u8):
  bit 0: note present (u8, 1-96; 0=empty)
  bit 1: instrument present (u8, 1-based)
  bit 2: volume present (u8, 0–127)
  bit 3: effect1 present (u8 cmd + u8 param)
  bit 4: effect2 present (u8 cmd + u8 param)
```

---

## SMPI Chunk (Sample Headers)

```
numSamples (u8)

Per sample (variable size based on version):
  sampleName[30] (ASCII)
  length (u32LE, in bytes)
  loopStart (u32LE, in bytes)
  loopLength (u32LE, in bytes)
  volume (u8, 0–127)
  flags (u8):
    bit 0: 16-bit
    bit 1: loop
    bit 2: bidi loop
    bit 3: stereo
  c5Speed (u32LE, in Hz)
  compressionType (u8):
    0x00 = uncompressed
    0x04 = DMF Huffman compressed (SMP_COMP1)
```

---

## SMPD Chunk (Sample PCM)

Sample PCM data follows in order. If `compressionType == 0x04`, the sample data is
DMF Huffman compressed (delta+Huffman). Otherwise raw 8-bit or 16-bit LE PCM.

**DMF Huffman decompression:**
1. Read Huffman tree structure from the stream
2. Decode bitstream to delta values
3. Integrate deltas to reconstruct PCM

---

## Detection Algorithm

```
1. buf.byteLength >= 66
2. buf[0..3] == "DDMF"
3. version byte in valid range (typically 0x04–0x0A)
```

---

## Tempo System

The first channel (channel 0) is the global tempo track. Effect commands on this
channel control playback parameters:

- `0x0F` + param: Set speed (ticks per row) if param ≤ 31; else BPM
- The global channel is stripped before rendering pattern data

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/XTrackerParser.ts`
- **OpenMPT reference:** `soundlib/Load_dmf.cpp`
