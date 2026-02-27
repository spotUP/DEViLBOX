# SoundFX

**Status:** NATIVE_SAMPLER — parser extracts PCM samples, uses Sampler engine
**Parser:** `src/lib/import/formats/SoundFXParser.ts`
**Extensions:** `sfx`, `sfx13`, UADE eagleplayer
**Replayer source:** `docs/formats/Replayers/SoundFX/`
**Reference files:** `Reference Music/SoundFX/` (357 files — major Amiga format)

---

## Overview

SoundFX is a 4-channel Amiga tracker format by Linel Software, ca. 1987-1990.
It is one of the most prolific early Amiga music formats, used in hundreds of games
and demos. Two versions exist:

- **SoundFX v1.0:** Magic `"SONG"` at offset 60, 16 sample slots
- **SoundFX v2.0 (SO31):** Magic `"SO31"` at offset 124, 32 sample slots

Pattern data uses 64 rows × 4 channels, with ProTracker-compatible 4-byte cells
and a custom period table with 67 entries. Effects include arpeggio, pitch bend,
filter on/off, volume up/down, step up/down, and auto-slide.

**Reference:** Based on FlodJS `FXPlayer` by Christian Corti (Neoart).

---

## File Layout — SoundFX v1.0

```
Offset   Size     Description
------   ------   -----------
0x00     60       Header data (periods, sample count, etc.)
0x3C     4        Magic: "SONG" (0x53 0x4F 0x4E 0x47)
0x40     16×32    Sample headers (16 slots × 32 bytes each)
0x240    128      Position list (128 × 1 byte pattern index)
0x2C0    2        Song length
0x2C2    2        Default tempo / speed
0x2C4    N×1024   Pattern data (N patterns × 64 rows × 4 channels × 4 bytes)
                  Sample PCM data
```

---

## File Layout — SoundFX v2.0 (SO31)

```
Offset   Size     Description
------   ------   -----------
0x00     124      Extended header (periods, sample count, extended song info)
0x7C     4        Magic: "SO31" (0x53 0x4F 0x33 0x31)
0x80     32×32    Sample headers (32 slots × 32 bytes each)
0x480    128      Position list
0x500    2        Song length
0x502    2        Tempo
0x504    N×1024   Pattern data
                  Sample PCM data
```

---

## Sample Header (32 bytes each)

```
Offset  Size  Description
------  ----  -----------
0x00    22    Sample name (null-padded ASCII)
0x16    2     Sample length (raw u16 — multiply by 2 for bytes)
0x18    1     Volume (0–64)
0x19    1     Unknown / finetune
0x1A    2     Loop start in bytes
0x1C    2     Loop length (raw u16 — multiply by 2; 0 = no loop)
0x1E    2     Unknown / pointer fragment
0x20    2     Unknown / padding
```

Sample names (22 bytes at offset 0) are the instrument display names.

---

## Pattern Row Format (4 bytes per cell)

```
Byte 0-1: Signed 16-bit big-endian Amiga period value
           Positive = note period (SoundFX period table, 67 entries)
           Zero = empty/rest
           Negative = special command (handled separately by player)
Byte 2:   (effect << 4) | (sampleHi nibble)
Byte 3:   Effect parameter value
```

SoundFX uses its own period table (67 entries, similar to ProTracker but not identical).
The table covers approximately 3 octaves.

---

## Effects

| Code | Description |
|------|-------------|
| `0` | No effect |
| `1` | Arpeggio (cycles through base, base+x, base+y every tick) |
| `2` | Pitch bend (slides period by param amount each tick) |
| `3` | Filter on |
| `4` | Filter off |
| `5` | Volume + (increment volume by param) |
| `6` | Volume − (decrement volume by param) |
| `7` | Step up (slide period up by param) |
| `8` | Step down (slide period down by param) |
| `9` | Auto-slide (automatic period slide) |

---

## Period → Note Conversion

SoundFX uses Amiga hardware periods that are close to but not always identical to
ProTracker. The parser uses `periodToNoteIndex()` from `AmigaUtils.ts` with a
closest-match search against the standard ProTracker period table.

```
frequency_Hz = PAULA_CLOCK / period
PAULA_CLOCK = 3546895 (PAL)
```

---

## Sample PCM Data

Sample data follows immediately after the last pattern. Data is 8-bit signed,
sequentially stored in sample order. Sample sizes:
- Length in bytes = `sampleHeader.length * 2`
- Loop: if `loopLength > 0`, loops at `loopStart` for `loopLength * 2` bytes

---

## Reference Implementations

- **Primary replayer:** `docs/formats/Replayers/SoundFX/`
- **FlodJS:** FXPlayer by Christian Corti (Neoart) — used as reference for `SoundFXParser.ts`

---

## Implementation Notes

**Current status:** NATIVE_SAMPLER — fully implemented in `SoundFXParser.ts`.
Uses `createSamplerInstrument()` for all sample slots. Sample names are extracted
from the 22-byte name fields in each sample header.

SoundFX is notable for being one of the first Amiga tracker formats, predating
ProTracker. Its period table extends slightly beyond the standard ProTracker range.
