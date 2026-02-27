# Images Music System (.ims)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/IMSParser.ts`
**Extensions:** `.ims`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/IMS/`
**Reference:** `Reference Code/openmpt-master/soundlib/Load_ims.cpp`

---

## Overview

Images Music System is a 4-channel Amiga tracker format. It has no magic bytes; detection
is purely structural, based on the 1084-byte header layout and internal consistency between
the `sampleDataOffset` field and the pattern data size.

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0       20    Song name (ASCII, null-padded)
20      930   31 × 30-byte MOD sample headers
              Each: name(22) + length(u16BE, words) + finetune(i8) + volume(u8)
                    + loopStart(u16BE, words) + loopLen(u16BE, words)
950     1     numOrders (u8, 1–128)
951     1     restartPos (u8, must be ≤ numOrders)
952     128   Order list (u8 each, 128 entries; all must reference valid pattern indices)
1080    4     sampleDataOffset (u32BE) — byte offset to sample PCM data
1084    ...   Pattern data (3 bytes/cell × 64 rows × 4 channels per pattern)
...     ...   Sample PCM data (signed int8, sequential per instrument)
```

---

## Detection Algorithm

```
1. buf.byteLength >= 1084
2. sampleDataOffset = u32BE(buf, 1080)
3. sampleDataOffset > 1084  (must be past the header)
4. (sampleDataOffset - 1084) % 768 == 0  (pattern data is exact multiple of 768)
   768 = 3 bytes/cell × 64 rows × 4 channels
5. numPatterns = (sampleDataOffset - 1084) / 768 ≤ 128
6. numOrders in [1..128], restartPos ≤ numOrders
7. All 128 order entries < numPatterns
8. All 31 sample lengths ≤ 0x8000
9. All 31 sample finetunes == 0  (IMS samples always have finetune 0)
10. At least one sample has non-zero length
```

---

## Pattern Cell (3 bytes)

```
byte0 bits[7:6]: instrument bits [5:4] (high 2 bits of instrument index)
byte0 bits[5:0]: note index (0–47 = note; 63 = empty; other = invalid)
byte1 bits[7:4]: instrument bits [3:0] (low 4 bits of instrument index)
byte1 bits[3:0]: effect type
byte2:           effect parameter
```

**Note mapping:**
- Note 0 → XM note 37 (C-3 in standard XM octave numbering)
- Note 47 → XM note 84 (highest)
- Note 63 → XM note 0 (empty cell)

---

## Channel Configuration

- 4 channels total
- LRRL Amiga panning: `[-50, +50, +50, -50]`
- Sample rate base: 8287 Hz (Amiga PAL standard)
- Initial speed: 6, initial BPM: 125

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/IMSParser.ts`
- **OpenMPT reference:** `soundlib/Load_ims.cpp`
