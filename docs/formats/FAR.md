# FAR (Farandole Composer)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/FARParser.ts`
**Extensions:** `.far`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/Farandole/`

---

## Overview

Farandole Composer is a 16-channel PC DOS tracker by Daniel Potter (1994). It uses a
fixed 16-channel layout with direct linear frequency mode, up to 256 patterns, and up
to 64 samples. Initial BPM is always 80.

References: OpenMPT `Load_far.cpp`, Schism Tracker FAR loader

---

## File Layout

### FAR File Header (98 bytes)

```
Offset  Size  Description
------  ----  -----------
0       4     Magic: "FAR\xFE" (0x46 0x41 0x52 0xFE)
4       40    songName[40] (null-padded)
44      3     eofBreak: {0x0D, 0x0A, 0x1A}
47      2     headerLength (u16LE) — total header length including eofBreak
49      1     version (u8, must be 0x00 = v1.0)
50      16    channelVolume[16] (u8 each, 0–15)
66      16    channelEnabled[16] (u8 each: 0=off, 1=on)
82      16    channelPan[16] (u8 each, 0=left..15=right)
```

### After File Header

```
[headerLength - 98] bytes: song message (ASCII text, length = fileHeader.messageLength)
```

**Note:** `fileHeader.messageLength = headerLength - 98`

### FAR Order Header (771 bytes, immediately after message)

```
Offset  Size  Description
------  ----  -----------
0       256   orders[256] (u8 each; 0xFF = end-of-song)
256     1     numPatterns (u8) — number of active patterns
257     1     numOrders (u8, from order scan)
258     1     loopPoint (u8)
259     512   patternSizes[256] (u16LE each) — size in bytes of each pattern (0 = absent)
```

### Pattern Data

Each pattern at `fileHeader.headerLength + orderHeaderOffset`:

```
+0  editPos (u8)      — row position in editor (informational)
+1  rows (u8)         — number of rows (1–256)
+2  rowData: rows × 16 channels × 4 bytes/cell
```

**FAR Pattern Cell (4 bytes):**
```
byte 0: note (0 = empty; 1-based semitone in linear tuning)
byte 1: instrument (1–64; 0 = no instrument)
byte 2: volume (0–15; 0xFF = no volume)
byte 3: effect byte:
        bits 7–4 = effect command (0–15)
        bits 3–0 = effect parameter
```

### After Patterns

```
sampleMap[8]: 8 × u8 bitmask — which samples are present
For each present sample:
  FARSampleHeader (48 bytes):
    name[32], length(u32LE), loopBegin(u32LE), loopEnd(u32LE),
    sampleVolume(u8), flags(u8): bit0=16-bit bit3=loop
    c5Speed(u16LE), loopMode(u8), unused(u8)
  Followed by sample PCM data
```

---

## Detection Algorithm

```
1. buf[0..3] == "FAR\xFE"
2. buf[44..46] == {0x0D, 0x0A, 0x1A}  (DOS EOL + EOF marker)
3. buf[48] == 0x00  (version = 1.0)
```

---

## Frequency (Note to Pitch)

FAR uses **direct linear frequency mode** (not Amiga period-based):

```
C5_SPEED = 16726  (= 8363 * 2)
freq = C5_SPEED * 2^((note - C5_note) / 12)
```

---

## Effect Commands

```
Effect  Description
0x0     None
0x1     Portamento up
0x2     Portamento down
0x3     Tone portamento
0x4     Retrig
0x5     Vibrato depth
0x6     Vibrato speed
0x7     Volume slide up
0x8     Volume slide down
0x9     Vibrato sustained
0xA     Volume + portamento (combined)
0xB     Panning (extended 0x8x)
0xC     Note delay (extended 0xDx)
0xD     Fine tempo down (ignored)
0xE     Fine tempo up (ignored)
0xF     Tempo change
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/FARParser.ts`
- **OpenMPT reference:** `soundlib/Load_far.cpp`

