# PLM (Disorder Tracker 2)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/PLMParser.ts`
**Extensions:** `.plm`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/Disorder Tracker/`

---

## Overview

Disorder Tracker 2 is a PC tracker format with an unusual "2D canvas" design where
patterns are placed at (row_position, channel_offset) coordinates within a virtual
grid. The parser splits this continuous canvas into 64-row chunks to produce a
standard order list and pattern array. The format supports up to 32 channels and
uses absolute file offsets for pattern and sample data.

Reference: OpenMPT `Load_plm.cpp`

---

## File Layout

### PLM File Header (96 bytes)

```
Offset  Size  Description
------  ----  -----------
0       4     Magic: "PLM\x1A" (0x504C4D1A)
4       1     headerSize (u8) — bytes in header including magic (≥ 96)
5       1     version (u8) — must be 0x10
6       48    songName (null/space-terminated)
54      1     numChannels (u8, 1–32)
55      1     flags (u8)
56      1     maxVol (u8)
57      1     amplify (u8)
58      1     tempo (u8) — initial BPM
59      1     speed (u8) — initial speed (ticks per row)
60      32    panPos[32] (u8 each, 0–15; panning = val × 0x11)
92      1     numSamples (u8)
93      1     numPatterns (u8)
94      2     numOrders (u16LE)
```

### After File Header (at offset `fileHeader.headerSize`)

```
numOrders   × PLMOrderItem (4 bytes each)
numPatterns × u32LE pattern file offsets
numSamples  × u32LE sample file offsets
```

### PLM Pattern Header (32 bytes, at each pattern offset)

```
Offset  Size  Description
------  ----  -----------
0       4     size (u32LE) — total size of pattern chunk in bytes
4       1     numRows (u8)
5       1     numChannels (u8)
6       1     color (u8)
7       25    name (null-terminated)
```

Pattern row data follows the header immediately.

### PLM Sample Header (71 bytes, at each sample offset)

```
Offset  Size  Description
------  ----  -----------
0       4     Magic: "PLS\x1A" (0x504C531A)
4       1     headerSize (u8)
5       1     version (u8)
6       32    name (null-terminated)
38      12    filename
50      1     panning (u8, 0–15; 255 = no pan override)
51      1     volume (u8, 0–64)
52      1     flags (u8): bit0 = 16-bit, bit1 = pingpong loop
53      2     sampleRate (u16LE)
55      4     unused
59      4     loopStart (u32LE, in bytes)
63      4     loopEnd (u32LE, in bytes)
67      4     length (u32LE, in bytes)
```

Sample PCM data starts at `sample_file_offset + sampleHeader.headerSize`.

---

## Detection Algorithm

```
1. buf[0..3] == "PLM\x1A"
2. buf[5] == 0x10  (version)
3. buf[4] >= 96    (minimum header size)
```

---

## Pattern Cell Encoding

Each row uses a run-length-encoded packed format where present channels are indicated
by a bitmask, and absent channels carry forward previous note/instrument data.

Packed cell byte flags indicate which fields follow:
- Note present
- Instrument present
- Volume present
- Effect present
- Panning present

---

## Panning

Channel panning from `panPos[ch]` (0–15):
```
pan = panPos[ch] * 0x11  (maps 0–15 to 0–255, centered at 8 = 128)
```

If `panPos[ch] == 255`, no panning override.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/PLMParser.ts`
- **OpenMPT reference:** `soundlib/Load_plm.cpp`

