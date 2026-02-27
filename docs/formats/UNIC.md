# UNIC Tracker

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/UNICParser.ts`
**Extensions:** `.unic`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/UNIC Tracker/`

---

## Overview

UNIC Tracker is an Amiga 4-channel module packer (not a stand-alone tracker) that
compresses ProTracker-style pattern data to 3 bytes per cell instead of 4. The format
re-uses the 1084-byte ProTracker header layout and may carry "M.K.", "UNIC", or
"\0\0\0\0" at offset 1080 as the magic identifier.

Reference: OpenMPT `Load_unic.cpp`, ProWizard by Asle

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0       20    Song title (space-padded ASCII)
20      930   31 × standard MOD sample headers (30 bytes each):
              +0   name (22 bytes)
                   name[20..21]: int16BE finetune (UNIC-specific, negated on load)
              +22  length    (u16BE, in words; must be < 0x8000)
              +24  finetune  (int8; must be 0 for UNIC files)
              +25  volume    (u8, 0–64)
              +26  loopStart (u16BE, in words; must be < 0x8000)
              +28  loopLen   (u16BE, in words; must be < 0x8000; >1 = loop active)
950     1     numOrders (u8, 1–127)
951     1     restartPos (u8)
952     128   Order list (u8 each)
1080    4     Magic: "M.K." (0x4D2E4B2E), "UNIC" (0x554E4943), or "\0\0\0\0"
1084    768   First pattern data (64 rows × 4 channels × 3 bytes = 768 bytes)
              Used for detection validation
1084+   ...   All pattern data (numPatterns × 768 bytes)
...     ...   Sample PCM data (signed int8)
```

---

## Detection Algorithm

```
1. buf.byteLength >= 1084 + 768
2. magic at 1080 in { "M.K.", "UNIC", "\0\0\0\0" }
3. numOrders in [1, 127]
4. All 31 sample headers:
   - finetune byte == 0
   - length, loopStart, loopLen all < 0x8000
   - name bytes all printable ASCII or NUL
5. Validate first pattern (at 1084): sample indices in valid range
```

The finetune-is-zero constraint and the name[20..21] int16 finetune field distinguish
UNIC from standard MOD files that also use "M.K." magic.

---

## Pattern Cell Encoding (3 bytes per cell, UNIC-specific)

```
byte 0: instrHi[2] | noteIdx[6]
          noteIdx = byte0 & 0x3F
          instrHi = (byte0 >> 2) & 0x30

byte 1: instrLo[4] | command[4]
          instrLo = (byte1 >> 4) & 0x0F
          command = byte1 & 0x0F

byte 2: effect parameter

instrument = instrHi | instrLo   (0 = no instrument, 1–31 = sample index)
XM note = noteIdx + 36           (noteIdx 0 = no note, 1–36 = C-1..B-3)
```

---

## Finetune

UNIC stores finetune as a big-endian int16 in name bytes [20..21] of each sample
header, **negated** before applying the standard MOD2XMFineTune conversion:

```
finetune_raw = int16BE(sampleHeader + 20)
finetune_applied = -finetune_raw
xm_finetune = MOD2XMFineTune(finetune_applied)
```

---

## Channel Panning

Hard Amiga stereo LRRL:
```
Ch 0 = -50 (Left)
Ch 1 = +50 (Right)
Ch 2 = +50 (Right)
Ch 3 = -50 (Left)
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/UNICParser.ts`
- **OpenMPT reference:** `soundlib/Load_unic.cpp`
- **ProWizard:** Asle's ProWizard format documentation

