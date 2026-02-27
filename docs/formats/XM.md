# XM (FastTracker II Extended Module)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/XMParser.ts`
**Extensions:** `.xm`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/FastTracker/`

---

## Overview

XM (Extended Module) is the native format of FastTracker II by Triton (1993). It extends
MOD with multiple samples per instrument, volume/panning envelopes, auto-vibrato, up to
32 channels, linear or Amiga frequency tables, and up to 128 instruments. The format
specification v1.04 is the definitive version; all modern trackers support it.

---

## File Layout

### XM File Header (80 bytes fixed + variable)

```
Offset  Size  Description
------  ----  -----------
0       17    ID text: "Extended Module: " (with trailing space)
17      20    Module name (ASCII, null-padded)
37      1     0x1A (DOS EOF marker)
38      20    Tracker name (ASCII, null-padded)
58      2     Version (u16LE, 0x0104 = v1.04)
60      4     Header size (u32LE, usually 276 = 60 + 216)
64      2     Song length (u16LE, number of orders, 1–256)
66      2     Restart position (u16LE)
68      2     Channel count (u16LE, 2–32, must be even)
70      2     Pattern count (u16LE, 1–256)
72      2     Instrument count (u16LE, 1–128)
74      2     Flags (u16LE): bit 0 = 0 → Amiga freq table, 1 → linear freq table
76      2     Default tempo (u16LE, ticks/row)
78      2     Default BPM (u16LE)
80      256   Pattern order table (u8 each)
```

---

## Pattern Format

```
Per pattern:
  headerLength (u32LE)
  packingType (u8, always 0)
  rowCount (u16LE, 1–256)
  packedDataSize (u16LE)

Packed data (packedDataSize bytes):
  Per cell (variable length):
    if bit 7 of first byte is set: it's a mask byte
      bit 0: note follows (u8)
      bit 1: instrument follows (u8)
      bit 2: volume follows (u8)
      bit 3: effect type follows (u8)
      bit 4: effect param follows (u8)
    else: first byte IS the note, then 4 more bytes follow
```

---

## XM Cell Values

```
note (u8):     0 = empty; 1–96 = C-0 to B-7; 97 = note off
instrument (u8): 0 = empty; 1–128 = instrument number (1-based)
volume (u8):   0 = empty; 0x10–0x50 = volume 0–64; 0x60–0xFF = volume effects
effectType (u8): 0–35 (0–Z)
effectParam (u8): 0–255
```

---

## XM Instrument Format

### Instrument Header (variable size)

```
Offset  Size  Description
------  ----  -----------
0       4     headerSize (u32LE)
4       22    name[22] (ASCII)
26      1     type (u8, always 0)
27      2     sampleCount (u16LE, 0–16)

If sampleCount > 0:
  28      4     sampleHeaderSize (u32LE, = 40)
  32      96    sampleMap[96] (u8, note 0-95 → sample index 0-based)
  128     48    volumeEnvelope (12 × {tick u16LE, value u16LE})
  176     48    panningEnvelope (12 × {tick u16LE, value u16LE})
  224     1     volumeEnvelopePoints (u8)
  225     1     panningEnvelopePoints (u8)
  226     1     volumeSustainPoint (u8)
  227     1     volumeLoopStart (u8)
  228     1     volumeLoopEnd (u8)
  229     1     panningSustainPoint (u8)
  230     1     panningLoopStart (u8)
  231     1     panningLoopEnd (u8)
  232     1     volumeEnvelopeFlags (u8): bit0=on, bit1=sustain, bit2=loop
  233     1     panningEnvelopeFlags (u8): same flags
  234     1     vibratoType (u8)
  235     1     vibratoSweep (u8)
  236     1     vibratoDepth (u8)
  237     1     vibratoRate (u8)
  238     2     volumeFadeout (u16LE)
  240     2     reserved (u16LE)
```

### Sample Header (40 bytes each)

```
Offset  Size  Description
------  ----  -----------
0       4     length (u32LE, in bytes)
4       4     loopStart (u32LE, in bytes)
8       4     loopLength (u32LE, in bytes)
12      1     volume (u8, 0–64)
13      1     finetune (i8, –128 to +127)
14      1     flags (u8): bit0-1 = loop (0=none,1=fwd,2=bidi); bit4=16bit
15      1     panning (u8, 0–255)
16      1     relativeNote (i8, –96 to +95)
17      1     reserved (u8)
18      22    name[22] (ASCII)
```

Sample data follows all 40-byte headers. **Delta-encoded**: actual values = cumulative sum of
stored bytes (8-bit) or words (16-bit).

---

## Detection Algorithm

```
1. buf.byteLength >= 60
2. buf[0..16] == "Extended Module: "
3. buf[37] == 0x1A
4. u16LE(58) == 0x0104  (version must be 1.04)
```

---

## Frequency Tables

**Linear (bit 0 = 1):**
`freq = 8363 × 2^((6*12-10*12+note-1)/12 - finetune/128)`

**Amiga (bit 0 = 0):**
Uses ProTracker period table; `freq = 8363 × 1712 / period`

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/XMParser.ts`
- **Specification:** FastTracker II XM format specification v1.04
- **OpenMPT reference:** `soundlib/Load_xm.cpp`
