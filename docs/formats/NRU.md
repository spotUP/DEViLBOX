# NRU (NoiseRunner)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/NRUParser.ts`
**Extensions:** `.nru`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/NoiseRunner/`

---

## Overview

NoiseRunner is a modified NoiseTracker/ProTracker Amiga format optimized for efficient
playback. It reuses the 1084-byte ProTracker header structure including the "M.K."
magic at offset 1080, but has a completely different sample header layout (16 bytes
instead of 30) and a modified pattern cell encoding.

Reference: OpenMPT `Load_nru.cpp`, ProWizard by Asle

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0       496   31 × NRU sample headers (16 bytes each):
              +0   volume        (u16BE, 0–64)
              +2   sampleAddr    (u32BE, Amiga memory address)
              +6   length        (u16BE, in words)
              +8   loopStartAddr (u32BE, Amiga memory address)
              +12  loopLength    (u16BE, in words; >1 = loop)
              +14  finetune      (int16BE; meaningful only when negative)
496     454   Padding / leftover ProTracker header data (ignored)
950     1     numOrders (u8)
951     1     restartPos (u8)
952     128   Order list (u8 each)
1080    4     "M.K." magic (0x4D2E4B2E)
1084    ...   Pattern data: numPatterns × 64 rows × 4 channels × 4 bytes
...     ...   Sample PCM data (signed int8)
```

---

## Detection Algorithm

```
1. buf.byteLength >= 1084
2. u32BE(1080) == 0x4D2E4B2E  ("M.K.")
3. numOrders = buf[950]; require numOrders >= 1
4. For all 31 NRU sample headers:
   - loopLength <= length
5. Validate pattern cells (data[2] must be even, data[3] & 0x07 must be 0)
```

The "M.K." magic is shared with ProTracker/MOD. Additional structural checks
on NRU's unique sample header layout (16B vs MOD's 30B) distinguish it.

---

## Pattern Cell Encoding (4 bytes per cell)

```
byte 0: effect type (6 bits used):
        0x00 → porta (remapped to effect 0x03)
        0x0C → arp (remapped to 0x00)
        other → byte0 >> 2

byte 1: effect parameter

byte 2: note value
        0 = no note
        else: XM note = byte2 / 2 + 36
        constraint: must be even, ≤ 72

byte 3: instrument byte
        instrument = byte3 >> 3
        constraint: byte3 & 0x07 must be 0
```

---

## Sample Headers

NRU sample headers differ from MOD:
- **16 bytes** per header (MOD uses 30 bytes)
- `sampleAddr` and `loopStartAddr` are Amiga absolute 32-bit memory addresses
  (not relative offsets)
- `finetune` is int16BE; only meaningful when **negative**
- No sample name stored in the header

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

- **Parser source:** `src/lib/import/formats/NRUParser.ts`
- **OpenMPT reference:** `soundlib/Load_nru.cpp`

