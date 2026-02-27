# PTM (PolyTracker)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/PTMParser.ts`
**Extensions:** `.ptm`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/PolyTracker/`

---

## Overview

PolyTracker is a PC DOS tracker format by Peter Sprenger. It is broadly S3M-compatible
but uses its own RLE-compressed pattern encoding and delta-encoded PCM samples. Files are
identified by "PTMF" magic at offset 44 and DOS EOF (0x1A) at offset 28.

Reference: OpenMPT `soundlib/Load_ptm.cpp`

---

## File Layout

### PTM File Header (608 bytes)

```
Offset  Size  Description
------  ----  -----------
0       28    songname[28] (ASCII, null-terminated)
28      1     dosEOF (must be 0x1A)
29      1     versionLo (u8, e.g. 0x03)
30      1     versionHi (u8, must be ≤ 2)
31      1     reserved
32      2     numOrders (u16LE, 1–256)
34      2     numSamples (u16LE, 1–255)
36      2     numPatterns (u16LE, 1–128)
38      2     numChannels (u16LE, 1–32)
40      2     flags (u16LE, must be 0)
42      2     reserved
44      4     magic: "PTMF"
48      16    reserved
64      32    chnPan[32] (u8 per channel; XM pan = (val & 0x0F) << 4 | 4)
96      256   orders[256] (u8 each; 0xFF = end, 0xFE = loop)
352     256   patOffsets[128] (u16LE each; byte offset = value × 16)
```

### After Header

```
numSamples × 80 bytes  — PTM sample headers
Pattern data at patOffsets[i] × 16
```

---

## Detection Algorithm

```
1. buf.byteLength >= 608
2. buf[28] == 0x1A  (DOS EOF)
3. buf[44..47] == "PTMF"
4. u16LE(38) in [1, 32]   (numChannels)
5. u16LE(30) <= 2         (versionHi)
```

---

## Sample Header (80 bytes)

```
Offset  Size  Description
------  ----  -----------
0       1     flags (u8): bits0-1=sampleType (0x01=PCM), bit2=loop, bit4=16-bit
1       12    filename[12] (null-terminated)
13      1     volume (u8, 0–64)
14      2     c4speed (u16LE; C5 speed = c4speed × 2)
16      2     smpSegment (ignored)
18      4     dataOffset (u32LE, absolute byte offset to sample data)
22      4     length (u32LE, in bytes)
26      4     loopStart (u32LE, in bytes)
30      4     loopEnd (u32LE, in bytes; subtract 1 for inclusive end)
34      14    gusdata (ignored)
48      28    samplename[28] (null-terminated)
76      4     magic "PTMS" (ignored)
```

Sample data is delta-encoded PCM (8-bit or 16-bit LE depending on flags bit 4).

---

## Pattern Encoding (S3M-compatible RLE)

```
Per pattern at patOffsets[i] × 16:
  64 rows, each row:
    read bytes until 0x00 (end-of-row sentinel)
    Each non-zero byte:
      channel    = byte & 0x1F (0-based)
      if byte & 0x20: note (u8) + instrument (u8)
      if byte & 0x40: volume (u8, 0–64)
      if byte & 0x80: command (u8) + param (u8)
```

Note encoding: S3M-style `(high nibble = octave, low nibble = semitone)`.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/PTMParser.ts`
- **OpenMPT reference:** `soundlib/Load_ptm.cpp`
