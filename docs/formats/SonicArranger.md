# Sonic Arranger

**Status:** NATIVE_SAMPLER — PCM and synth instruments via Sampler engine
**Parser:** `src/lib/import/formats/SonicArrangerParser.ts`
**Extensions:** `sa`, `soar`, UADE eagleplayer
**Replayer source:** `docs/formats/Replayers/SonicArranger/`
**Reference files:** `Reference Music/Sonic Arranger/`

---

## Overview

Sonic Arranger is an Amiga software-synthesis tracker similar in design to InStereo! 2.0
and Synthesis. It uses chunk-based file layout (magic `SOARV1.0` + section markers),
supports 4 voices, multiple subsongs, PCM sample playback, and a rich software synthesis
engine with 18 synthesis effect modes, ADSR tables, AMF (Amplitude Modulation Frequency)
tables, and vibrato/portamento/arpeggio per instrument.

The format has a particularly large instrument struct (0x98 = 152 bytes each), containing
synthesis parameters, 3 embedded arpeggio tables, and a 30-byte instrument name.

---

## File Layout

```
Offset  Size         Description
------  -----------  -----------
0x00    8            Magic: "SOARV1.0"
0x08    4            Song table mark: "STBL"
0x0C    4            Number of sub-songs (NSS)
0x10    NSS×12       Sub-song information (12 bytes each)
        4            Position table mark: "OVTB"
        4            Number of positions (NOP)
        NOP×16       Position information (4 bytes per voice × 4 voices = 16 bytes each)
        4            Track rows mark: "NTBL"
        4            Number of track rows (NOR)
        NOR×4        Track rows (4 bytes each)
        4            Instruments mark: "INST"
        4            Number of instruments (NOI)
        NOI×152      Instrument information (152 = 0x98 bytes each)
        4            Samples mark: "SD8B"
        4            Number of samples (NOS)
        NOS×4        Sample lengths in words
        NOS×4        Repeat lengths in words
        NOS×30       Sample names (30 bytes each)
        NOS×4        Sample lengths in bytes
        ?            PCM sample data
        4            Wave tables mark: "SYWT"
        4            Number of wave tables (NOW)
        NOW×128      Wave table data (128 bytes each, 8-bit signed)
        4            ADSR tables mark: "SYAR"
        4            Number of ADSR tables (NOA)
        NOA×128      ADSR tables (128 bytes each)
        4            AMF tables mark: "SYAF"
        4            Number of AMF tables (NOF)
        NOF×128      AMF tables (128 bytes each)
        8            Editor state mark: "EDATV1.1"
        16           Editor state values (ignored by player)
```

---

## Sub-Song Information (12 bytes each)

```
Offset  Size  Description
------  ----  -----------
0x0     2     Speed (ticks per row)
0x2     2     Track length (rows per pattern/track)
0x4     2     Start position
0x6     2     Stop position
0x8     2     Repeat position
0xA     2     Tempo in Hz (VBL rate; 50 = PAL default)
```

---

## Position Information (16 bytes per position, 4 bytes per voice)

```
Per-voice entry (4 bytes):
  0  2  Track address (absolute offset into track rows block)
  2  1  Sound transpose (instrument selection offset)
  3  1  Note transpose (pitch offset in semitones)
```

---

## Track Row Format (4 bytes per row)

```
Byte 0: AAAAAAAA — Note value (0-based; add sound+note transposes from position)
Byte 1: BBBBBBBB — Instrument number (1-based; 0 = no change)
Byte 2: CDEEFFFF — C=no-sound-transpose, D=no-note-transpose,
                   E=arpeggio number for synth, F=effect number
Byte 3: GGGGGGGG — Effect argument
```

### Effects

| Code | Description |
|------|-------------|
| `0` | Arpeggio |
| `1` | Slide up/down |
| `2` | Restart ADSR |
| `3` | Not used |
| `4` | Set vibrato |
| `5` | Sync |
| `6` | Set master volume |
| `7` | Set portamento |
| `8` | Skip portamento |
| `9` | Track length |
| `A` | Volume slide |
| `B` | Position jump |
| `C` | Set volume |
| `D` | Track break |
| `E` | LED on/off |
| `F` | Song speed |

---

## Instrument Information (152 = 0x98 bytes each)

```
Offset  Size  Description
------  ----  -----------
0x00    2     Instrument type (0 = Sample, 1 = Synthesis)
0x02    2     Sample/waveform number
0x04    2     Oneshot length in words
0x06    2     Repeat length in words (0 = loop whole sample, 1 = no loop, else = loop length)
0x08    8     Unknown
0x10    2     Volume (0–64)
0x12    2     Fine tuning
0x14    2     Portamento speed
0x16    2     Vibrato delay
0x18    2     Vibrato speed
0x1A    2     Vibrato level
0x1C    2     AMF wave table number
0x1E    2     AMF delay
0x20    2     AMF table length
0x22    2     AMF table repeat point
0x24    2     ADSR wave table number
0x26    2     ADSR delay
0x28    2     ADSR table length
0x2A    2     ADSR table repeat point
0x2C    2     Sustain point in ADSR table
0x2E    2     Sustain delay (ticks to hold at sustain)
0x30    16    Unknown
0x40    2     Synthesis effect arg 1
0x42    2     Synthesis effect number:
               0  = Fx off (static waveform)
               1  = Wave Negator
               2  = Free Negator
               3  = Rotate Vertical
               4  = Rotate Horizontal
               5  = Alien Voice
               6  = Poly Negator
               7  = Shack Wave 1
               8  = Shack Wave 2
               9  = Metamorph
               A  = Laser AMF
               B  = Wave Alias
               C  = Noise Generator
               D  = Low Pass Filter 1
               E  = Low Pass Filter 2
               F  = Oscillator 1
               10 = Noise Generator 2
               11 = FM drum
0x44    2     Synthesis effect arg 2
0x46    2     Synthesis effect arg 3
0x48    2     Synthesis effect delay
0x4A    48    Arpeggio tables:
               3 arpeggios × 16 bytes each
               Each: LE (1 byte length), RE (1 byte repeat), 14 bytes of transpose offsets
               LE + RE = total table length used
0x7A    30    Instrument name (null-padded ASCII, 30 bytes)
```

**Instrument names** are at offset 0x7A (30 bytes) in each 152-byte instrument entry.
These are the instrument display names shown in the UI.

---

## Sample Information (SD8B block)

Sample names (30 bytes each) are stored in the `SD8B` section after the length arrays:
```
NOS×4   Sample oneshot lengths in words
NOS×4   Repeat lengths in words
NOS×30  Sample names (30 bytes each)
NOS×4   Sample byte lengths
?       Sample PCM data (8-bit signed, sequentially)
```

The two name sources (instrument names at 0x7A and sample names from SD8B) may differ.
Use the instrument name for display; sample names may provide additional context.

---

## Wave Tables, ADSR Tables, AMF Tables

All synthesis tables are 128 bytes each. Stored sequentially in their respective blocks:
- **Wave tables (SYWT):** 128-byte waveforms (8-bit signed PCM)
- **ADSR tables (SYAR):** 128-byte volume envelope curves
- **AMF tables (SYAF):** 128-byte amplitude-modulation frequency curves

---

## Reference Implementations

- **Replayer:** `docs/formats/Replayers/SonicArranger/`
- **NostalgicPlayer spec:** `docs/formats/Sonic Arranger.txt`

---

## Implementation Notes

**Current status:** NATIVE_SAMPLER — `SonicArrangerParser.ts` emits `'Sampler'` for both
PCM sample instruments and synthesis instruments. Synthesis instruments use the waveform
table data as a raw PCM buffer at a fixed sample rate (approximation of true synthesis).

For full native synthesis, the ADSR/AMF tables would need to be applied as real-time
modulation, and the 18 synthesis effect modes (negation, rotation, alien voice, etc.)
would need to be implemented in C WASM. The replayer assembly source is the reference.

The `'Synth' as const` fallback path in `SonicArrangerParser.ts` handles any instruments
the current parser cannot extract (e.g., unsupported synthesis types).
