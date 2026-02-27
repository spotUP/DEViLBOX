# Digital Sound Studio (DSS)

**Status:** DETECTION_ONLY — parser identifies format, synthesis falls back to UADE
**Parser:** `src/lib/import/formats/DigitalSoundStudioParser.ts`
**Extensions:** `dss`, UADE eagleplayer
**Replayer source:** `docs/formats/Replayers/DigitalSoundStudio/DSS.s`
**Reference files:** `Reference Music/AY Emul/` (extension `.emul` files may include DSS tracks)

---

## Overview

Digital Sound Studio is an Amiga tracker from the early 1990s. It uses a ProTracker-like
pattern structure with 4 voices, 31 sample slots, and a position list. The format is
identified by the magic bytes `MMU2` at offset 0x00 and uses Amiga hardware periods
directly in track row encoding.

The format supports an extended effect set compared to ProTracker, including pitch
control, master volume, sample instrument start offsets, and tone portamento.

---

## File Layout

```
Offset  Size        Description
------  ----------  -----------
0x000   4           Magic: "MMU2"
0x004   4           Song length (or offset to first sample — ambiguous in spec)
0x008   1           Song tempo (0 = use default 125 BPM)
0x009   1           Song speed (default 6)
0x00A   0x1F×0x2E   Sample information (31 samples × 46 bytes each)
0x59C   2           Number of positions
0x59E   128 (0x80)  Position list (up to 64 positions × 2 bytes each, zero-padded)
0x61E   ?×1024      Pattern data (variable count of 1024-byte patterns)
                    Sample PCM data
```

---

## Sample Information (46 = 0x2E bytes each, 31 slots)

```
Offset  Size  Description
------  ----  -----------
0x00    0x1E  Sample name (30 bytes, null-padded ASCII)
0x1E    4     Start offset into sample data block (absolute file offset)
0x22    2     Length in words (oneshot section)
0x24    4     Loop start offset (absolute file offset into sample data)
0x28    2     Loop length in words (1 = no loop)
0x2A    1     Finetune (signed, Amiga fine-tune value)
0x2B    1     Volume (0–64)
0x2C    2     Frequency (optional base frequency, 0 = use period from track)
```

Sample names (30 bytes at offset 0x00) are the instrument display names.

---

## Pattern Data

Each pattern is 1024 bytes. Patterns are laid out sequentially with no gap.
The position list at 0x59E references patterns by index.

### Track Row Format (4 bytes per row, ProTracker-style)

```
Byte layout:
  Byte 0-1: AAAAABBB BBBBBBBB
    A (5 bits) = Sample number (1-31, 0 = no sample)
    B (11 bits) = Note as Amiga period value

  Byte 2-3: CCCCCCCC DDDDDDDD
    C (8 bits) = Effect number (see below)
    D (8 bits) = Effect argument
```

Channels: 4 channels per pattern row. Each row = 4 rows × 4 bytes = 16 bytes.
64 rows per pattern → 64 × 16 = 1024 bytes per pattern.

### Effects

| Code | Description |
|------|-------------|
| `0x00` | Arpeggio |
| `0x01` | Slide up |
| `0x02` | Slide down |
| `0x03` | Set volume |
| `0x04` | Set master volume |
| `0x05` | Set song speed |
| `0x06` | Position jump |
| `0x07` | LED on/off |
| `0x08` | Pitch up |
| `0x09` | Pitch down |
| `0x0A` | Pitch control |
| `0x0B` | Set song tempo (BPM) |
| `0x0C` | Volume up |
| `0x0D` | Volume down |
| `0x0E` | Volume slide up |
| `0x0F` | Volume slide down |
| `0x10` | Master volume up |
| `0x11` | Master volume down |
| `0x12` | Master volume slide up |
| `0x13` | Master volume slide down |
| `0x14` | Loop start |
| `0x15` | Jump to loop |
| `0x16` | Replay note |
| `0x17` | Delay note |
| `0x18` | Cut note |
| `0x19` | Instrument start offset |
| `0x1A` | Instrument tune |
| `0x1B` | Portamento (tone) |
| `0x1C` | Portamento + volume up |
| `0x1D` | Portamento + volume down |
| `0x1E` | Portamento control |

---

## Period → Frequency Mapping

Track rows encode notes as raw Amiga hardware period values (11-bit field). Convert
to Hz using the standard Paula clock formula:

```
frequency_Hz = PAULA_CLOCK / period
PAULA_CLOCK = 3546895 (PAL)
```

ProTracker period values for reference: C-3 = 856, D-3 = 762, A-3 = 508, etc.

---

## Reference Implementations

- **Replayer assembly:** `docs/formats/Replayers/DigitalSoundStudio/DSS.s`
- **NostalgicPlayer spec:** `docs/formats/DSS.txt`

---

## Implementation Notes

**Current status:** DETECTION_ONLY — `DigitalSoundStudioParser.ts` creates `'Synth' as const`
placeholder instruments. UADE handles synthesis.

**Path to NATIVE_SAMPLER:**
Sample data follows the pattern block. The 31 sample headers contain absolute file
offsets for both the sample start and loop start. To extract PCM:
1. Read `startOffset` from sample header
2. Sample size in bytes = `length_in_words * 2`
3. Extract raw 8-bit signed PCM at that offset
4. Loop info: if `loopLength > 1`, sample loops; `loopStart` is the absolute offset

The format is very close to ProTracker and nearly identical in PCM extraction logic to
`MODParser.ts`. A native sampler implementation should be straightforward.
