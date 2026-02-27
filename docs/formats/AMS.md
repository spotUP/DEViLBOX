# AMS (Extreme's Tracker / Velvet Studio)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/AMSParser.ts`
**Extensions:** `.ams`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/AMS/`

---

## Overview

AMS is a PC tracker format with two distinct variants sharing the `.ams` extension:

- **AMS 1.x** — "Extreme's Tracker" by Niklas Beisert
- **AMS 2.x** — "Velvet Studio" (enhanced successor)

Both variants use the same compressed pattern encoding and sample compression (RLE +
bit-unpack + delta). The version byte distinguishes them.

Reference: OpenMPT `Load_ams.cpp`

---

## File Layout

### AMS 1.x Header

```
Offset  Size  Description
------  ----  -----------
0       7     Magic: "Extreme" (0x45 0x78 0x74 0x72 0x65 0x6D 0x65)
7       1     versionHigh (u8, must be 1)
8       1     versionLow (u8, e.g. 0x06 = v1.06)
9       2     numSamples (u16LE)
11      2     numPatterns (u16LE)
13      2     numOrders (u16LE)
15      1     speed (u8)
16      ...   orders, sample headers, pattern headers, compressed pattern data
```

### AMS 2.x Header

```
Offset  Size  Description
------  ----  -----------
0       7     Magic: "AMShdr\x1A" (0x41 0x4D 0x53 0x68 0x64 0x72 0x1A)
7       1     versionHigh (u8, must be 2)
8       1     versionLow (u8, 0, 1, or 2)
9       ...   songName (length-prefixed: 1 byte len + chars)
...     2     numSamples (u16LE)
...     2     numOrders (u16LE)
...     2     numPatterns (u16LE)
...     1     speed (u8)
...     1     tempo (u8)
...     2     flags (u16LE)
...     ...   orders (numOrders × 2 bytes), channel data, sample headers, patterns
```

---

## Detection Algorithm

```
AMS 1.x: buf[0..6] == "Extreme" and buf[7] == 1
AMS 2.x: buf[0..6] == "AMShdr\x1A" and buf[7] == 2 and buf[8] in {0, 1, 2}
```

---

## Sample Compression

Samples may be stored uncompressed (raw signed PCM) or AMS-packed with three stages:

**Stage 1 — RLE decode:**
```
packChar = sampleHeader.packChar
If byte == packChar: next byte = repeat count, byte after = fill value
```

**Stage 2 — Bit unpack (bit plane transpose):**
```
Input bits are interleaved across bit planes, output is 8-bit-wide bytes
```

**Stage 3 — Delta decode:**
```
output[i] = output[i-1] + input[i]   (running sum, mod 256)
```

---

## Pattern Encoding

Both AMS variants use the same compressed pattern format (ReadAMSPattern):

Each channel row is encoded with a command byte followed by data bytes:
- High nibble: number of consecutive note entries (0–15)
- Low nibble: packed continuation flags

Pitch is stored as a signed offset from A-4 (MIDI note 69).

---

## Sample Headers

Length-prefixed strings (`u8 len + chars`) for sample names. Sample metadata
includes length, loop start, loop length, volume, finetune, panning.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/AMSParser.ts`
- **OpenMPT reference:** `soundlib/Load_ams.cpp`
- **Velvet Studio source:** `github.com/Patosc/VelvetStudio`

