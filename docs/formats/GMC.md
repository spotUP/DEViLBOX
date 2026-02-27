# GlueMon / Game Music Creator

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/GMCParser.ts`
**Extensions:** `.glue`, `glue.*`, `gm.*` (prefix/extension-based)
**UADE name:** GlueMon
**Reference files:** `Reference Music/GlueMon/`
**Reference:** `Reference Code/openmpt-master/soundlib/Load_gmc.cpp`

---

## Overview

Despite the file being named `GMCParser.ts`, the detection function `isGMCFormat` actually
targets the **GlueMon** format, identified by a `"GLUE"` magic at offset 0. The file
was originally written as a structural GMC (Game Music Creator) validator but the reference
files in the GlueMon folder use the `GLUE` magic prefix, so magic detection is the
correct approach.

GlueMon is a 4-channel Amiga tracker with a 444-byte fixed header structure.

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0       4     Magic: "GLUE" (0x474C5545) — GlueMon identifier
4       2     Checksum word
6       10    Song name (8 bytes + padding)
16      240   15 × 16-byte sample headers
240     3     Must be zero bytes
243     1     numOrders (u8, 1–100)
244     200   orders[100] × u16BE (order value / 1024 = pattern index)
444     ...   Pattern data: patterns × 64 rows × 4 channels × 4 bytes = 1024 bytes/pattern
...     ...   Sample PCM data (signed int8, sequential per sample)
```

---

## Detection Algorithm

```
1. buf.byteLength >= 444  (HEADER_SIZE)
2. buf[0..3] == "GLUE"   (0x47 0x4C 0x55 0x45)
```

---

## Sample Header (16 bytes each, offsets 0–239)

```
Offset  Size  Description
------  ----  -----------
0       4     offset (u32BE) — file offset into sample data region
4       2     length (u16BE, in words)
6       1     zero (u8, must be 0)
7       1     volume (u8, 0–64)
8       4     address (u32BE) — Amiga memory address (informational)
12      2     loopLength (u16BE, in words; >2 = active loop)
14      2     dataStart (u16BE, must be 0 or even — bytes to trim from sample start)
```

---

## Pattern Cell (4 bytes — ProTracker encoding)

```
byte0: [instHi(4)][periodHi(4)]
byte1: [periodLo(8)]
byte2: [instLo(4)][effectType(4)]
byte3: [effectParam(8)]
Special: byte0==0xFF && byte1==0xFE → note cut (XM note 97)
```

---

## Effect Mapping

| GMC Effect | Description | XM Equivalent |
|------------|-------------|---------------|
| 0x00 | No effect | — |
| 0x01 | Portamento up | 0x01 |
| 0x02 | Portamento down | 0x02 |
| 0x03 | Set volume | 0x0C (param & 0x7F) |
| 0x04 | Pattern break | 0x0D |
| 0x05 | Position jump | 0x0B |
| 0x06 | LED filter on | 0x0E 0x00 |
| 0x07 | LED filter off | 0x0E 0x01 |
| 0x08 | Set speed | 0x0F |

---

## Channel Configuration

- 4 channels total
- LRRL Amiga panning: `[-50, +50, +50, -50]`
- 15 sample slots
- Up to 100 orders, pattern index = `orderValue / 1024`
- Sample rate base: 8287 Hz (Amiga PAL standard)

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/GMCParser.ts`
- **OpenMPT reference:** `soundlib/Load_gmc.cpp`
