# Actionamics Sound Tool

**Status:** DETECTION_ONLY — parser identifies format, synthesis falls back to UADE
**Parser:** `src/lib/import/formats/ActionamicsParser.ts`
**Extensions:** UADE eagleplayer (no common standalone extension)
**Reference files:** `Reference Music/Actionamics/`

---

## Overview

Actionamics Sound Tool is a relatively obscure Amiga software-synthesis tracker.
It uses a signature-based format with size-prefix header blocks, similar in concept
to SidMon 2.0. The format supports 4 voices, multiple subsongs, and per-instrument
sample-list cycling (similar to Digital Mugician's waveform list), arpeggio cycling,
frequency cycling, portamento, vibrato, tremolo, and ADSR volume envelopes.

The signature string `ACTIONAMICS SOUND TOOL V0.1/` appears at offset 0x3E.

---

## File Layout

All block sizes are stored in the header at fixed offsets. Data follows sequentially
in the order listed here.

```
Offset  Size  Description
------  ----  -----------
0x00    2     BPM (tempo in beats per minute)
0x02    4     Length of signature block
0x06    4     Length of module information block (MI)
0x0A    4     Length of track number lists (TNL)
0x0E    4     Length of note transpose lists (NTL)
0x12    4     Length of instrument transpose lists (ITL)
0x16    4     Length of instrument information block (II)
0x1A    4     Length of sample number lists (SNL)
0x1E    4     Length of arpeggio lists (AL)
0x22    4     Length of frequency lists (FL)
0x26    4     Length of unknown block 1 (?1L — not used by player)
0x2A    4     Length of unknown block 2 (?2L — not used by player)
0x2E    4     Length of subsong information (SSI)
0x32    4     Length of unknown block 3 (?3L — not used by player)
0x36    4     Length of sample information (SIL)
0x3A    4     Length of track offset table (TOL)
0x3E    28    Signature: "ACTIONAMICS SOUND TOOL V0.1/"
0x5A    MI    Module information (see below)
        TNL   Track number lists: 4 separate lists (TNL/4 entries each), one per voice
        NTL   Note transpose lists: 4 separate lists (NTL/4 entries each), one per voice
        ITL   Instrument transpose lists: 4 separate lists (ITL/4 entries each), one per voice
        II    Instrument information
        SNL   Sample number lists (16 bytes each)
        AL    Arpeggio lists (16 bytes each)
        FL    Frequency lists (16 bytes each)
        ?1L   Unknown (not used by player)
        ?2L   Unknown (not used by player)
        SSI   Subsong information
        ?3L   Unknown (not used by player)
        SIL   Sample information
        TOL   Track offset table (one 2-byte word offset per track, relative to track data start)
              Track data
              Sample PCM data
```

---

## Module Information (MI block, minimal)

```
Offset  Size  Description
------  ----  -----------
0x00    4     Total length of module (redundant with file size)
```

The sample data location can be computed: `sampleDataOffset = moduleEnd - totalSampleLength`.
Total sample length is the sum of all `length in words × 2` from the sample information block.

---

## Position Lists (TNL, NTL, ITL blocks)

Three parallel position lists, each split across 4 voices. Each block is divided
into 4 equal sections (TNL/4, NTL/4, ITL/4 bytes per voice):

- **Track number list (TNL):** Track index for each voice at each position
- **Note transpose list (NTL):** Semitone offset for each voice at each position
- **Instrument transpose list (ITL):** Instrument number offset for each voice at each position

The effective number of positions = TNL / 4 (one byte per position per voice).

---

## Subsong Information (4 bytes each)

```
Offset  Size  Description
------  ----  -----------
0x0     1     Start position index
0x1     1     End position index
0x2     1     Loop position index
0x3     1     Speed (ticks per row)
```

---

## Instrument Information (24 bytes each, 20 fields)

```
Offset  Size  Description
------  ----  -----------
0x00    1     Sample list number (index into SNL block)
0x01    1     Number of values in sample list to cycle
0x02    1     Sample list start counter delta value (cycling speed)
0x03    1     Sample list counter end value
0x04    1     Arpeggio list number (index into AL block)
0x05    1     Number of values in arpeggio list
0x06    1     Arpeggio list start counter delta value
0x07    1     Arpeggio list counter end value
0x08    1     Frequency list number (index into FL block)
0x09    1     Number of values in frequency list
0x0A    1     Frequency list start counter delta value
0x0B    1     Frequency list counter end value
0x0C    1     Portamento increment value
0x0D    1     Portamento delay
0x0E    1     Note transpose
0x0F    1     Unknown
0x10    1     Attack end volume (peak)
0x11    1     Attack speed (volume increment per tick)
0x12    1     Decay end volume (sustain floor)
0x13    1     Decay speed (volume decrement per tick)
0x14    1     Sustain delay (ticks to hold)
0x15    1     Release end volume
0x16    1     Release speed
0x17    9     Unknown / reserved
```

Instrument names are not stored in the Actionamics format. Use generic names.

---

## Sample Number Lists (16 bytes each)

Each list is 16 bytes of sample indices. The instrument's sample list cycling
advances through entries at the rate defined by `sampleListDelta`, wrapping at
`counterEndValue`. This allows instruments to cycle through multiple waveforms
over time (similar to Digital Mugician's waveform list).

## Arpeggio Lists (16 bytes each)

Each list is 16 bytes of semitone offsets. Cycling speed and length controlled
by instrument parameters.

## Frequency Lists (16 bytes each)

Each list is 16 bytes of frequency delta values. Used for pitch automation.

---

## Sample Information (40 bytes each)

```
Offset  Size  Description
------  ----  -----------
0x00    4     Pointer to sample data (Amiga absolute — not directly usable)
0x04    2     Length of sample in words
0x06    2     Loop start in words
0x08    2     Loop length in words (1 = no loop)
0x0A    2     Effect start position in words
0x0C    1     Arpeggio list number
0x0C    2     Effect length in words (overlaps! — apparent bug in player)
0x0E    2     Effect speed
0x10    2     Effect mode (0 = none, 1 = forward, 2 = backwards, 3 = ping-pong)
0x12    2     Effect increment value
0x14    4     Effect position (runtime — player-initialized)
0x18    2     Effect speed counter (runtime)
0x1A    2     Already-taken flag (runtime)
0x1C    4     Not used
0x20    32    Sample name (null-padded ASCII, 32 bytes)
```

**Sample names** are at offset 0x20 in each 40-byte sample info entry. These are
the instrument display names shown in the UI.

The Amiga absolute pointer at offset 0x00 cannot be used to locate sample data in
the file. Compute sample offsets from accumulated sizes or the formula:
`sampleDataStart = moduleLength - totalSampleBytes`.

---

## Track Data

The track offset table (TOL) has one word offset per track, relative to the start
of the track data block. Each track uses a compact variable-length encoding:

```
For each row, read until a negative or terminal byte:
  0x00-0x6F  Note value. Next byte:
               If positive: instrument number
               If negative: rows to wait (absolute value)
  0x70-0x7F  Effect opcode. Next byte: effect argument
  0x80-0xFF  Number of rows to wait (skip forward by value & 0x7F)
```

### Effects

| Code | Description |
|------|-------------|
| `0x70` | Arpeggio |
| `0x71` | Slide up |
| `0x72` | Slide down |
| `0x73` | Volume slide |
| `0x74` | Vibrato |
| `0x75` | Set track rows (pattern length) |
| `0x76` | Set sample offset |
| `0x77` | Retrig |
| `0x78` | Mute |
| `0x79` | Restart sample |
| `0x7A` | Tremolo |
| `0x7B` | Track break |
| `0x7C` | Set volume |
| `0x7D` | Volume slide with retrig |
| `0x7E` | Volume slide + vibrato |
| `0x7F` | Set speed |

---

## Reference Implementations

- **NostalgicPlayer spec:** `docs/formats/Actionamics.txt`

---

## Implementation Notes

**Current status:** DETECTION_ONLY — `ActionamicsParser.ts` creates `'Synth' as const`
placeholder instruments. UADE handles synthesis.

**Path to NATIVE_SAMPLER:**
The sample info block contains 32-byte names and size/loop data. Sample data location
can be computed from module length and total sample sizes. Extract 8-bit signed PCM
and use `createSamplerInstrument()`. The sample number list cycling and ADSR envelope
would require the full synthesis engine for authentic playback.

**Note on the arpeggio/effect-length overlap at offset 0x0C:** This is documented as
a bug in the original player — the arpeggio list number byte and the effect length
word occupy overlapping positions. The parser should treat 0x0C as the arpeggio number
(1 byte) when that field is relevant.
