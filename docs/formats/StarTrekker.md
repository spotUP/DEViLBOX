# Ultimate SoundTracker / Startrekker

**Status:** NATIVE_SAMPLER — parser extracts PCM samples, uses Sampler engine
**Parser:** `src/lib/import/formats/STKParser.ts`
**Extensions:** `stk`, early `.mod` files without M.K. magic, UADE eagleplayer
**Replayer source:** `docs/formats/Replayers/StarTrekker/`
**Reference files:** `Reference Music/Startrekker AM/` (91 files),
`Reference Music/Startrekker FLT8/` (1 file)

---

## Overview

Ultimate SoundTracker (UST, 1987) by Karsten Obarski is the original Amiga tracker,
predating ProTracker. The format is nearly identical to ProTracker MOD but with:
- **15 sample slots** (not 31)
- **30-byte sample headers** with 22-byte names
- **No magic bytes** in the file — detected heuristically
- **CIA-based tempo** in early versions (restartPos field encodes timing)
- Pattern data: 4 channels × 64 rows × 4 bytes per cell (identical encoding to MOD)

Startrekker AM is a related format that extends UST with Amiga Module (AM) synthesis
instruments for software synthesis. The AM extensions allow waveform-based instruments
alongside standard PCM samples.

**Reference:** OpenMPT `Load_stk.cpp` + `MODTools.h`

---

## File Layout

```
Offset  Size     Description
------  ------   -----------
0x00    20       Song name (space-padded ASCII)
0x14    450      15 × Sample header (30 bytes each)
0x202   1        Number of song positions (orders)
0x203   1        Restart position / tempo (CIA-based timing in early UST)
0x204   128      Order list (128 bytes, each = pattern index)
0x284   N×1024   Pattern data (N patterns × 64 rows × 4 channels × 4 bytes)
                 Sample PCM data
```

Total header block size: 600 bytes (20 + 450 + 130)

---

## Sample Header (30 bytes each, 15 slots)

```
Offset  Size  Description
------  ----  -----------
0x00    22    Sample name (null-padded ASCII, may contain disk references like "df0:sample")
0x16    2     Sample length in words (multiply by 2 for bytes)
0x18    1     Finetune (should be 0 in UST files; −7 to +7 in ProTracker)
0x19    1     Volume (0–64)
0x1A    2     Loop start in bytes
0x1C    2     Loop length in words (multiply by 2 for bytes; 1 = no loop)
```

Sample names (22 bytes at offset 0) are the instrument display names.

---

## Pattern Row Format (4 bytes per cell — identical to ProTracker MOD)

```
Byte 0: (sampleHi << 4) | (period >> 8)
Byte 1: period & 0xFF
Byte 2: (sampleLo << 4) | effect
Byte 3: effectParam

sampleNumber = (sampleHi << 4) | sampleLo    (1–15 in UST, 1–31 in MOD)
period = full Amiga hardware period value
effect = lower nibble of byte[2]
```

---

## Standard Amiga Period Table

```
Octave 1 (C-1 to B-1): 856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453
Octave 2 (C-2 to B-2): 428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226
Octave 3 (C-3 to B-3): 214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113
```

ProTracker C-1 (period 856) = XM note 13. Conversion: XM note = 13 + (periodIndex).

---

## Format Detection

UST/STK has no magic bytes. Detection is heuristic:
- No `M.K.` or `4CHN` etc. magic at offset 1080
- Exactly 15 sample headers (not 31)
- Sample names should be printable ASCII (count invalid characters)
- The `restartPos` byte at offset 0x203 in UST encodes CIA tempo
  (values 0x40–0x7F are typical for UST; ProTracker uses it differently)

---

## Startrekker AM Extensions

Startrekker AM extends UST with `AM` synthesis instruments:
- Synthesis instruments store waveform and envelope data instead of PCM
- Pattern data is identical to UST
- The format is identified by `AM` + specific header fields

The `STKParser.ts` handles the PCM sample variant (NATIVE_SAMPLER). Startrekker AM
synthesis instruments may still fall back to UADE in some cases.

---

## Effects (UST subset — not all ProTracker effects present)

| Code | Description |
|------|-------------|
| `0` | Arpeggio |
| `1` | Slide up |
| `2` | Slide down |
| `A` | Volume slide |
| `B` | Position jump |
| `C` | Set volume |
| `D` | Pattern break |
| `F` | Set speed / tempo |

Early UST used a subset of effects. The `restartPos` byte encodes CIA timing
for the default BPM in early UST files.

---

## Reference Implementations

- **Replayer v1.2 AM:** `docs/formats/Replayers/StarTrekker/StarTrekker_v1.2_AM.s`
- **Replayer v1.2 8-channel:** `docs/formats/Replayers/StarTrekker/StarTrekker_v1.2_8Channel.s`
- **Normal replayer:** `docs/formats/Replayers/StarTrekker/StarTrekker_v1.2_Normal.s`
- **OpenMPT reference:** `Reference Code/openmpt-master/soundlib/Load_stk.cpp`

---

## Implementation Notes

**Current status:** NATIVE_SAMPLER — `STKParser.ts` fully extracts 15 PCM samples
using `createSamplerInstrument()`. The 22-byte sample names are used as display names.

The parser correctly handles the UST format's 15-sample limit and heuristic detection.
It references `AMIGA_PERIOD_TABLE` for period-to-note conversion (same 36-entry table
as ProTracker, covering 3 octaves).
