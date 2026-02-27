# Digital Mugician

**Status:** FULLY_NATIVE — custom WASM synth (`DigMugSynth`)
**Parser:** `src/lib/import/formats/DigitalMugicianParser.ts`
**Extensions:** `dm`, `dm2`, `mugician`, UADE eagleplayer
**Replayer source:** `docs/formats/Replayers/DigitalMugician/player.s`,
`docs/formats/Replayers/DigitalMugician/player(pc).S` (PC-relative version)
**Reference files:** `Reference Music/Digital Mugician/`

---

## Overview

Digital Mugician (1991, by Rob Povey / Factor6 / Silents) is a sophisticated Amiga
software synthesis tracker. The format has two variants:
- **Digital Mugician 1** — ID `" MUGICIAN/SOFTEYES 1990 "` — 4 channels
- **Digital Mugician 2** — ID `" MUGICIAN2/SOFTEYES 1990"` — 7 channels (extended)

The engine combines PCM samples and 128-byte software waveforms with a powerful
instrument processor supporting 15 synthesis effects (filter, mixing, scroll,
up/downsampling, negation, morphing, polygate, etc.), volume automation, arpeggio,
and pitch sequences. Up to 8 subsongs per file.

---

## File Layout

```
Offset    Size          Description
--------  ------------  -----------
0x00      24 (0x18)    ID string ("" MUGICIAN/SOFTEYES 1990 "" or MUGICIAN2 variant)
0x18      2             Arpeggios enabled flag (non-zero = yes)
0x1A      2             Number of tracks (NOT)
0x1C      4             Number of sequences for sub-song 1 (NOS1)
0x20      4             Number of sequences for sub-song 2 (NOS2)
0x24      4             Number of sequences for sub-song 3 (NOS3)
0x28      4             Number of sequences for sub-song 4 (NOS4)
0x2C      4             Number of sequences for sub-song 5 (NOS5)
0x30      4             Number of sequences for sub-song 6 (NOS6)
0x34      4             Number of sequences for sub-song 7 (NOS7)
0x38      4             Number of sequences for sub-song 8 (NOS8)
0x3C      4             Number of instruments (NOI)
0x40      4             Number of waveforms (NOW)
0x44      4             Number of PCM samples (NOS_samples)
0x48      4             Total sample data size in bytes (SS)
0x4C      10×8          Sub-song information (10 slots × 8 bytes; unused slots padded)
0xCC      NOS1×2×CH     Sequence table for sub-song 1 (1 word per channel per sequence)
          NOS2×2×CH     Sequence table for sub-song 2
          ...           (repeat for sub-songs 3-8)
          NOI×16        Instrument information (16 bytes each)
          NOW×128       Software waveforms (128 bytes each, 8-bit signed PCM)
          NOS_s×32      Sample information (32 bytes each)
          NOT×256       Track data (256 bytes each)
          SS            PCM sample data
          8×32          Arpeggio tables (8 arpeggios × 32 bytes each)
```

CH = 4 (standard) or 7 (Mugician2 format)

---

## Sub-Song Information (8 bytes each, 10 slots)

```
Offset  Size  Description
------  ----  -----------
0x0     1     Song loop (0 = no loop, 1 = loop)
0x1     1     Loop position index
0x2     1     Song speed (ticks per row)
0x3     1     Number of sequences
0x4     12    Sub-song name (ASCII, null-padded)
```

---

## Sequence Table

Each sequence is 2 bytes per channel:
```
Byte 0: Track number (0-based index into track data)
Byte 1: Transpose value (signed semitone offset)
```

---

## Instrument Information (16 bytes each)

```
Offset  Size  Description
------  ----  -----------
0x0     1     Waveform/sample number:
               < 32 → waveform index (software synthesis)
               ≥ 32 → sample index ((value - 32) into sample table)
0x1     1     Loop length in words (for waveform looping)
0x2     1     Volume (0–64)
0x3     1     Volume automation speed
0x4     1     Arpeggio table number (0 = none)
0x5     1     Pitch value (base pitch offset in semitones)
0x6     1     Effect index (0-based)
0x7     1     Instrument delay (ticks before instrument starts)
0x8     1     Finetune (signed Amiga-style finetune)
0x9     1     Pitch loop position
0xA     1     Pitch automation speed
0xB     1     Synthesis effect:
               0  = None
               1  = Filter
               2  = Mixing
               3  = Scroll Left
               4  = Scroll Right
               5  = Upsample
               6  = Downsample
               7  = Negate
               8  = Mad Mix 1
               9  = Addition
               10 = Filter 2
               11 = Morphing
               12 = Morphing+Filter
               13 = Filter 3
               14 = Polygate
               15 = Colgate
0xC     1     Source waveform 1 (for synthesis effects)
0xD     1     Source waveform 2 (for synthesis effects)
0xE     1     Effect speed
0xF     1     Volume loop position
```

The instrument name is not stored in the instrument struct. Instruments are identified
by index only. The parser should emit `"Instrument N"` names.

---

## Software Waveforms

`NOW` × 128 bytes of 8-bit signed PCM waveform data. Used as the base material for
synthesis effects. Instruments with waveform index < 32 reference these waveforms.

---

## PCM Sample Information (32 bytes each)

```
Offset  Size  Description
------  ----  -----------
0x00    4     Start offset (from start of sample data block)
0x04    4     End offset
0x08    4     Loop start offset
0x0C    20    Unused / space characters
```

PCM data is 8-bit signed, stored sequentially in the sample block after all
other data structures.

---

## Track Data (256 bytes each = 64 rows × 4 bytes)

```
Row format (4 bytes):
  Byte 0: Note (0 = rest; otherwise 1-based MIDI-like note number)
  Byte 1: Instrument number (0 = no change)
  Byte 2: Effect number (see track effects below)
  Byte 3: Effect parameter
```

### Track Effects

| Code | Description |
|------|-------------|
| `0` | None |
| `1` | Pitch bend |
| `2` | No effect increment |
| `3` | No volume increment |
| `4` | No effect + no volume increment |
| `5` | Pattern length |
| `6` | Song speed |
| `7` | Filter on |
| `8` | Filter off |
| `9` | Toggle filter |
| `A` | No DMA |
| `B` | Arpeggio change |
| `C` | Note wander |
| `D` | Shuffle |

---

## Arpeggio Tables

8 arpeggio tables × 32 bytes each. Each byte is a semitone offset.
The instrument's arpeggio speed controls how fast the table advances.

---

## Reference Implementations

- **Replayer:** `docs/formats/Replayers/DigitalMugician/player.s` (relocatable)
- **Replayer (PC-relative):** `docs/formats/Replayers/DigitalMugician/player(pc).S`
- **Example:** `docs/formats/Replayers/DigitalMugician/example.S`
- **NostalgicPlayer spec:** `docs/formats/Digital Mugician.txt`

---

## Implementation Notes

**Current status:** FULLY_NATIVE — `DigitalMugicianParser.ts` emits `'DigMugSynth'`
instruments for waveform-based instruments and handles PCM sample instruments as well.
The `DigMugSynth` WASM engine handles software synthesis playback.

Synthesis instruments (waveform index < 32) use `'Synth' as const` as a fallback
for any instruments the WASM engine doesn't handle. Check the parser for current
native coverage.
