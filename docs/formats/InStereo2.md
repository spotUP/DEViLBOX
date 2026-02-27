# InStereo! 2.0

**Status:** DETECTION_ONLY — parser identifies format, synthesis falls back to UADE
**Parser:** `src/lib/import/formats/InStereo2Parser.ts`
**Extensions:** `is20`, UADE eagleplayer
**Reference files:** `Reference Music/InStereo/`

---

## Overview

InStereo! 2.0 (magic `IS20DF10`) is the successor to InStereo! 1.0, sharing the same
synthesis concept (wavetable synthesis with 4 voices, ADSR, EGC, vibrato, portamento)
but using a chunk-based file format instead of a flat sequential layout. The format
uses four-character magic markers to delimit sections (`STBL`, `OVTB`, `NTBL`, `SAMP`,
`SYNT`, `EDATV1.0`).

---

## File Layout

```
Offset  Size        Description
------  ----------  -----------
0x00    8           Magic: "IS20DF10"
0x08    4           Song table mark: "STBL"
0x0C    4           Number of sub-songs (NSS)
0x10    NSS×10      Sub-song information (10 bytes each)
        4           Position table mark: "OVTB"
        4           Number of positions (NOP)
        NOP×16      Position information (16 bytes each)
        4           Track rows mark: "NTBL"
        4           Number of track rows (NOR)
        NOR×4       Track rows (4 bytes each)
        4           Sample mark: "SAMP"
        4           Number of samples (NOS)
        NOS×16      Sample information (16 bytes each)
        NOS×20      Sample names (20 bytes each)
        NOS×4       Sample lengths in words (one u32 per sample)
        NOS×4       Repeat lengths in words
        NOS×4       Sample lengths in bytes
        ?           Sample PCM data — REVERSED ORDER (last sample first, first sample last)
        4           Synthesis mark: "SYNT"
        4           Number of instruments (NOI)
        NOI×1010    Instrument information (1010 = 0x3F2 bytes each)
        8           Editor state mark: "EDATV1.0"
        34          Editor state values (ignored by player)
```

---

## Sub-Song Information (10 bytes each)

```
Offset  Size  Description
------  ----  -----------
0x0     1     Speed (ticks per row)
0x1     1     Track length (rows per track)
0x2     2     Start position
0x4     2     Stop position
0x6     2     Repeat position
0x8     2     Tempo in Hz (0 = use 50 Hz default)
```

---

## Position Information (16 bytes per position, 4 bytes per voice)

```
Per-voice entry (4 bytes):
  0  2  Track address (absolute offset into track rows block)
  2  1  Sound transpose
  3  1  Note transpose
```

---

## Track Row Format (4 bytes per row)

```
Byte 0: AAAAAAAA — Note
Byte 1: BBBBBBBB — Instrument number
Byte 2: CDEEFFFF — C=no-sound-transpose flag, D=no-note-transpose flag,
                   E=arpeggio number nibble (synth), F=effect number
Byte 3: GGGGGGGG — Effect argument
```

### Effects

| Code | Description |
|------|-------------|
| `0` | Arpeggio |
| `1` | Slide up/down |
| `2` | Reset ADSR |
| `3` | Not used |
| `4` | Set vibrato |
| `5` | Not used |
| `6` | Not used |
| `7` | Set portamento |
| `8` | Skip portamento |
| `9` | Track length |
| `A` | Volume increment |
| `B` | Position jump |
| `C` | Set volume |
| `D` | Track break |
| `E` | LED on/off |
| `F` | Song speed |

---

## Sample Information (16 bytes each)

```
Offset  Size  Description
------  ----  -----------
0x0     2     Oneshot length in words
0x2     2     Repeat length in words (0 = loop whole sample, 1 = no loop, else = loop length)
0x4     1     Sample number (1-indexed)
0x5     1     Volume (0–64)
0x6     1     Vibrato delay
0x7     1     Vibrato speed
0x8     1     Vibrato level
0x9     1     Portamento speed
0xA     6     Unknown/reserved
```

Sample names are stored separately in a `NOS×20` name block after the sample info.
Use the 20-byte name block entries as instrument display names.

**Sample data ordering:** Samples are stored in reverse order — the last sample appears
first in the file, and the first sample is at the end. Parse accordingly.

---

## Instrument Information (1010 = 0x3F2 bytes each)

Each instrument definition begins with the mark `IS20` (4 bytes).

```
Offset  Size   Description
------  -----  -----------
0x00    4      Mark: "IS20"
0x04    20     Instrument name (null-padded ASCII)
0x18    2      Length of waveform
0x1A    1      Volume (0–64)
0x1B    1      Vibrato delay
0x1C    1      Vibrato speed
0x1D    1      Vibrato level
0x1E    1      Portamento speed
0x1F    1      ADSR length
0x20    1      ADSR repeat point
0x21    4      Unknown
0x25    1      Sustain point
0x26    1      Sustain speed
0x27    1      AMF length
0x28    1      AMF repeat
0x29    1      EG mode (0 = calc, -1 = free)
0x2A    1      EG enabled (0 = no, -1 = yes)
0x2B    1      Start/length
0x2C    1      Stop/repeat
0x2D    1      Speed up
0x2E    1      Speed down
0x2F    19     Unknown/reserved
0x42    128    ADSR table (128 bytes)
0xC2    128    LFO table (128 bytes)
0x142   48     3 Arpeggios (each: LE byte, RE byte, 14 bytes of transpose values)
0x172   128    EG table (128 bytes)
0x1F2   256    Waveform 1 (256 bytes of 8-bit signed PCM)
0x2F2   256    Waveform 2 (256 bytes of 8-bit signed PCM)
```

Instrument names are stored at offset 0x04 in each instrument block (20 bytes).

---

## Reference Implementations

- **NostalgicPlayer InStereo 2.0 spec:** `docs/formats/InStereo! 2.0.txt`
- **UADE player:** `Reference Code/uade-3.05/players/InStereo` (handles both IS 1.0 and 2.0)

---

## Implementation Notes

**Current status:** DETECTION_ONLY — `InStereo2Parser.ts` creates `'Synth' as const`
placeholder instruments. UADE handles synthesis.

**Path to NATIVE_SAMPLER:**
The sample PCM data block contains raw 8-bit signed samples (stored in reverse order).
Each sample's size in bytes is given by the `NOS×4` sample-lengths-in-bytes block.
Reverse-iterate to extract samples in canonical order, then use `createSamplerInstrument()`.

**Path to NATIVE_WASM:**
The instrument definition is unusually large (1010 bytes), containing full waveform data,
ADSR/LFO/EG tables, and two 256-byte synthesis waveforms per instrument. A WASM synth
would operate on these embedded tables for fully native playback.
