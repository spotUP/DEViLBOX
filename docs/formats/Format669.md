# 669 (Composer 669 / UNIS 669)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/Format669Parser.ts`
**Extensions:** `.669`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/669/`

---

## Overview

669 is a PC DOS 8-channel tracker format with two variants: **Composer 669** (original,
magic `if`) and **UNIS 669** (extended, magic `JN` by John Nickerson). Both variants
share the same binary structure. The format supports up to 64 samples, 128 patterns, and
per-order tempo and break-row values.

Reference: OpenMPT `soundlib/Load_669.cpp`

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0       2     Magic: "if" (0x69 0x66) or "JN" (0x4A 0x4E)
2       108   songMessage: 3 × 36-char text lines (ASCII, space-padded)
110     1     numSamples  (u8, 1–64)
111     1     numPatterns (u8, 1–128)
112     1     restartPos  (u8)
113     128   Order list  (u8 each; 0xFF = end-of-song, 0xFE = end + restart)
241     128   Tempo list  (u8 each; speed in ticks per row, 0–15, per order entry)
369     128   Break list  (u8 each; break row per order entry, 0–63)
497     ...   Sample headers: numSamples × 25 bytes each:
              +0   filename[13] (null-terminated ASCII)
              +13  length    (u32LE, bytes)
              +17  loopStart (u32LE, bytes; 0xFFFFFFFF = no loop)
              +21  loopEnd   (u32LE, bytes; 0xFFFFFFFF = no loop)
...     ...   Pattern data: numPatterns × 1536 bytes
              (64 rows × 8 channels × 3 bytes per cell)
...     ...   Sample PCM data (8-bit unsigned, sequential)
```

---

## Detection Algorithm

```
1. buf.byteLength >= 2
2. buf[0..1] == "if" (0x69, 0x66) or "JN" (0x4A, 0x4E)
```

---

## Pattern Cell Encoding (3 bytes per cell)

```
byte 0 (noteInstr):
  bits[7:2] = note (6-bit, 0–55 pitched; 0xFE/0xFF = no note)
  bits[1:0] = instrument high 2 bits

byte 1 (instrVol):
  bits[7:4] = instrument low 4 bits
  bits[3:0] = volume (0–15; 0xF = no volume)
  instrument = (noteInstr_lo2 << 4) | instrVol_hi4

byte 2 (effParam):
  bits[7:4] = effect command (0–15; 0xFF = no new effect)
  bits[3:0] = effect parameter
```

**Note conditions:**
- `noteInstr < 0xFE` → pitched note (note and instrument valid), sticky effect resets
- `noteInstr == 0xFE` → volume byte is still valid (no note)
- `noteInstr >= 0xFF` → no note, no instrument, no volume

**Sticky effects:** Effect state is preserved per channel between rows; a new note
resets the sticky effect. A new effect byte 2 < 0xFF overrides the sticky effect.

---

## Note Encoding

```
raw_note = (byte0 >> 2) & 0x3F   (0-based, range 0–55)
semitone = raw_note % 12
octave   = raw_note / 12         (0 = lowest)
xm_note  = octave * 12 + semitone + 36 + 1
```

---

## Effect Commands

| Command | XM Effect | Description |
|---------|-----------|-------------|
| 0x0     | —         | None        |
| 0x1     | 0x01      | Portamento up |
| 0x2     | 0x02      | Portamento down |
| 0x3     | 0x03      | Tone portamento |
| 0x4     | 0x04      | Vibrato |
| 0x5     | 0x0A      | Fine volume slide up/down |
| 0x6     | 0x10      | Pattern break (to break row) |
| 0x7     | 0x1D      | Set speed |
| 0x8     | 0x10      | Pattern break (to 0) |
| 0x9     | 0x1D      | Set BPM (via tempo list) |
| Others  | —         | Ignored |

---

## Channel Panning

Alternating L/R stereo:
```
Ch 0,3,4,7 = -60 (Left)
Ch 1,2,5,6 = +60 (Right)
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/Format669Parser.ts`
- **OpenMPT reference:** `soundlib/Load_669.cpp`

