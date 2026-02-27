# Puma Tracker

**Status:** NATIVE_SAMPLER — parser extracts PCM samples, uses Sampler engine
**Parser:** `src/lib/import/formats/PumaTrackerParser.ts`
**Extensions:** `puma`, UADE eagleplayer
**Replayer source:** `docs/formats/Replayers/PumaTracker/` and `docs/formats/Replayers/PumaTacker/`
**Reference files:** `Reference Music/Puma Tracker/`

---

## Overview

Puma Tracker is an Amiga tracker from the late 1980s/early 1990s. It combines a
ProTracker-like pattern structure with a unique instrument system using:
- **Volume data commands** — opcode sequences for volume automation and waveform steps
- **Frequency data commands** — opcode sequences for pitch hold, glide, and frequency variation
- **Sample references** (samples 0–9) and **waveform references** (waveforms 0x0A–0x33)

The module format has no fixed magic bytes — detection is heuristic.

---

## File Layout

```
Offset       Size               Description
-----------  -----------------  -----------
0x00         12                 Module name (null-padded ASCII)
0x0C         2                  Number of positions - 1 (NOP)
0x0E         2                  Number of tracks (NOT)
0x10         2                  Number of instruments (NOI)
0x12         2                  Padding / alignment
0x14         10×4               Sample start offsets (10 samples × 4 bytes each)
0x3C         10×2               Sample lengths in words (10 samples × 2 bytes each)
0x50         (NOP+1)×14         Position list (14 bytes per position entry)
0x50+(NOP+1)×14  NOT×?         Track data (variable-length; each track begins with "patt" mark)
             ...                "inst" mark (4 bytes)
             NOI×?              Instrument data (variable-length; each begins with "inst" mark)
             ...                Instrument mark end ("insf" sequences)
             ...                Sample PCM data
```

---

## Position List Entry (14 bytes each)

```
Offset  Size  Description
------  ----  -----------
0x0     1     Track number for voice 1 (0-based)
0x1     1     Instrument transpose for voice 1 (signed)
0x2     1     Note transpose for voice 1 (signed)
0x3     1     Track number for voice 2
0x4     1     Instrument transpose for voice 2
0x5     1     Note transpose for voice 2
0x6     1     Track number for voice 3
0x7     1     Instrument transpose for voice 3
0x8     1     Note transpose for voice 3
0x9     1     Track number for voice 4
0xA     1     Instrument transpose for voice 4
0xB     1     Note transpose for voice 4
0xC     1     Speed (ticks per row) for this position
0xD     1     Unused/padding
```

---

## Track Data

Each track begins with the magic `patt` (4 bytes), followed by track row data.

### Track Row Format (4 bytes per row)

```
Byte 0: AAAAAAAA — Note (0 = rest; valid notes are 1-based)
Byte 1: BBBCCCCC — Effect (B, 3 bits) | Instrument number (C, 5 bits)
Byte 2: DDDDDDDD — Effect argument
Byte 3: EEEEEEEE — Number of rows to skip until next note event (row gap)
```

Byte 3 encoding is distinctive: instead of storing empty rows, Puma Tracker uses a
"row gap" byte to skip N rows after this event, compressing sparse patterns.

### Track Effects

| Code | Description |
|------|-------------|
| `0` | None |
| `1` | Set volume |
| `2` | Portamento down |
| `3` | Portamento up |

---

## Instrument Data (variable length)

Each instrument has two opcode sequences: volume data and frequency data.
Each sequence begins with a 4-character mark:

### Volume Data (begins with `"inst"`)

Opcode sequences controlling amplitude and waveform:

| Opcode | Args | Description |
|--------|------|-------------|
| `C0 aa bb cc` | source=aa, step=bb, count=cc | Set waveform/sample source. `aa` 0x00–0x09 = sample, 0x0A–0x33 = waveform. `bb` = waveform step rate (0 = static). `cc` = number of waveforms to advance through |
| `A0 aa bb cc` | start=aa, end=bb, length=cc | Volume sweep from `aa` to `bb` over `cc` ticks |
| `E0 00 00 00` | — | Stop (silence voice) |
| `B0 aa 00 00` | pos=aa | GOTO: jump to opcode at position `aa×4` bytes from sequence start |

### Frequency Data (begins with `"insf"`)

| Opcode | Args | Description |
|--------|------|-------------|
| `D0 aa bb cc` | offset=aa (×2), unused=bb, duration=cc | Hold frequency at `offset` semitones for `duration` ticks. `aa=0x18` = +1 octave |
| `A0 aa bb cc` | start=aa, end=bb, duration=cc | Frequency glide from `aa` to `bb` over `cc` ticks |
| `E0 00 00 00` | — | Stop |
| `B0 aa 00 00` | pos=aa | GOTO loop |

---

## Waveform Storage

42 software waveforms (indices 0x0A–0x33) are embedded in the module data.
Each waveform is 0x20 bytes (32 bytes) of 8-bit signed PCM.

---

## Sample Data

10 PCM sample slots (indices 0x00–0x09). Sample offsets and lengths are stored
in the header arrays at 0x14 and 0x3C respectively:
- `sampleStartOffsets[i]` — absolute file offset to sample PCM
- `sampleLengths[i]` — sample length in words (PCM bytes = length × 2)

---

## Reference Implementations

- **Replayer:** `docs/formats/Replayers/PumaTracker/` (multiple assembly files)
- **NostalgicPlayer spec:** `docs/formats/PumaTracker.txt`

---

## Implementation Notes

**Current status:** NATIVE_SAMPLER — `PumaTrackerParser.ts` emits `'Sampler' as const`
instruments with PCM extracted from the sample data block.

Sample extraction:
1. Read 10 `startOffset` values from 0x14 (4 bytes each, big-endian)
2. Read 10 `lengthInWords` values from 0x3C (2 bytes each, big-endian)
3. PCM data at `startOffset`, length = `lengthInWords * 2`, 8-bit signed

Waveform instruments (index ≥ 0x0A) are currently not exposed as separate instruments
in the native path — they are synthesis-only and require the Puma Tracker synthesis
engine for proper playback. These fall back to UADE.
