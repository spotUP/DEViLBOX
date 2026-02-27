# SidMon 2.0

**Status:** FULLY_NATIVE — custom WASM synth (`SidMonSynth`)
**Parser:** `src/lib/import/formats/SidMon2Parser.ts`
**Extensions:** `sm2`, `sidmon2`, UADE eagleplayer
**Replayer source:** `docs/formats/Replayers/SIDMon/` and `docs/formats/Replayers/SidMonII/`
**Reference files:** `Reference Music/SidMon 2/`

---

## Overview

SidMon 2.0 (also "SIDMON II - THE MIDI VERSION") is a software synthesis tracker
for the Amiga, extending SidMon 1.0 with MIDI capability and a richer instrument
engine. The format stores sections as size-prefixed blocks in a fixed order: song
lengths, position tables, note transposes, instrument transposes, instruments, waveform
lists, arpeggios, vibratos, sample info, track tables, and tracks — followed by raw
PCM sample data.

The instrument engine features waveform cycling (waveform list), arpeggio, vibrato,
and a full ADSR envelope with independent attack/decay/sustain/release rates. PCM
sample playback is supported for sample-based instruments; waveform-based instruments
use 16-byte waveform lists that cycle through software waveforms stored in the player.

---

## File Layout

The file begins with a size-prefix header that provides the byte size of each block:

```
Offset  Size  Description
------  ----  -----------
0x00    2     MIDI mode flag
0x02    1     Number of positions - 1 (NOP; actual count = NOP + 1)
0x03    1     Initial speed (ticks per row)
0x04    2     Size of sample information block (64 bytes per sample)
0x06    4     Size of ID block (SL)
0x0A    4     Size of song lengths block (SL)
0x0E    4     Size of position table block (PT)
0x12    4     Size of note transposes block (NT)
0x16    4     Size of instrument transposes block (IT)
0x1A    4     Size of instruments block (I)
0x1E    4     Size of waveform lists block (WL)
0x22    4     Size of arpeggios block (A)
0x26    4     Size of vibratos block (V)
0x2A    4     Size of sample information block (SI)
0x2E    4     Size of track table block (TT)
0x32    4     Size of tracks block (T)
0x36    4     Unknown
0x3A    28    ID string: "SIDMON II - THE MIDI VERSION" (28 bytes)
0x56    SL    Song length block
        PT    Position table (4 × (NOP+1) bytes — track number per voice per position)
        NT    Note transposes (4 × (NOP+1) bytes — signed semitone offset)
        IT    Instrument transposes (4 × (NOP+1) bytes — signed offset)
        I     Instruments (24 bytes each)
        WL    Waveform lists (16 bytes each)
        A     Arpeggios (16 bytes each)
        V     Vibratos (16 bytes each)
        SI    Sample information (64 bytes each)
        TT    Track table (word offsets into track block, one per track)
        T     Track data (variable-length, indexed by track table)
        0/1   Optional pad byte (align to even)
        ?     PCM sample data
```

---

## Instrument Information (24 bytes each)

```
Offset  Size  Description
------  ----  -----------
0x00    1     Waveform list number (index into WL block)
0x01    1     Waveform length (number of entries in waveform list to use)
0x02    1     Waveform cycling speed (ticks per step)
0x03    1     Waveform delay (ticks before waveform cycling begins)
0x04    1     Arpeggio table number
0x05    1     Arpeggio length (number of entries to use)
0x06    1     Arpeggio cycling speed
0x07    1     Arpeggio delay
0x08    1     Vibrato table number
0x09    1     Vibrato length
0x0A    1     Vibrato speed
0x0B    1     Vibrato delay
0x0C    1     Pitch bend speed
0x0D    1     Pitch bend delay
0x0E    2     Not used
0x10    1     Attack maximum (peak volume)
0x11    1     Attack speed (volume increment per tick)
0x12    1     Decay target (sustain volume floor)
0x13    1     Decay speed (volume decrement per tick)
0x14    1     Sustain time (ticks to hold at sustain level)
0x15    1     Release target (final release volume floor)
0x16    1     Release speed (volume decrement per tick in release)
0x17    9     Not used / reserved
```

Instrument names are not stored in the SidMon 2.0 format. The parser emits generic
names based on instrument index.

---

## Sample Information (64 bytes each)

```
Offset  Size  Description
------  ----  -----------
0x00    4     Pointer to sample start (Amiga absolute address — cannot use directly)
0x04    2     Length in words
0x06    2     Loop start offset in words (from sample start)
0x08    2     Loop length in words (1 = no loop)
0x0A    22    Player runtime variables (negation engine):
               0x0A  2  Start offset into sample for negation
               0x0C  2  End offset for negation stop
               0x0E  2  Start index for negation table (index 18)
               0x10  2  Negation status
               0x12  2  Negation speed
               0x14  4  Negation position (pointer)
               0x18  2  Negation index (0–31)
               0x1A  2  Do negation flag (0 = yes)
               0x1C  4  Not used
0x20    32    Sample name (null-padded ASCII, 32 bytes)
```

**Sample names** are at offset 0x20 in each 64-byte sample info entry. These are
the instrument display names shown in the UI.

The Amiga absolute pointer at offset 0x00 cannot be used to locate sample data in
the file. Sample data starts after the track block (after the optional alignment byte)
and samples are stored sequentially. Compute offsets from accumulated sizes using
the `length in words` field.

---

## Waveform Lists (16 bytes each)

Each waveform list is a 16-byte table of sample numbers. The player cycles through
these entries at the rate defined in the instrument's waveform speed field, playing
the waveform stored in the player for each entry index. Waveforms are typically
8-bit signed 64-byte or 128-byte software waveforms embedded in the player code.

---

## Arpeggio Tables (16 bytes each)

Each arpeggio is a 16-byte table of signed semitone offsets. The player cycles
through at the instrument's arpeggio speed, adding each offset to the current note.

## Vibrato Tables (16 bytes each)

Each vibrato is a 16-byte signed table of pitch deviation values (Amiga period
differences). The player advances through at vibrato speed after the vibrato delay.

---

## Track Table and Track Data

The track table is an array of word offsets into the track block, one per track.
Each track is variable-length, encoded as a sequence of rows:

```
Row format (variable): determined by replayer — check SIDMon II replayer assembly
```

Track data uses a compact encoding where repeated notes/rests are run-length compressed.
See the replayer assembly for exact byte decoding.

---

## Position/Arrangement Tables

Three parallel arrays of `4 × (NOP+1)` bytes each:
- **Position table:** track number for each voice at each song position
- **Note transposes:** semitone offset added to each voice's note at each position
- **Instrument transposes:** instrument number offset for each voice at each position

---

## Reference Implementations

- **SidMon 1.0 replayer:** `docs/formats/Replayers/SIDMon/`
- **SidMon 2.0 replayer:** `docs/formats/Replayers/SidMonII/`
- **NostalgicPlayer spec:** `docs/formats/SidMon 2.0.txt`

---

## Implementation Notes

**Current status:** FULLY_NATIVE — `SidMon2Parser.ts` emits `'SidMonSynth'` instruments.
The `SidMonSynth` WASM engine handles playback for waveform-based instruments.

The ADSR engine uses `attackMax`, `attackSpeed`, `decayMin`, `decaySpeed`,
`sustainTime`, `releaseMin`, `releaseSpeed` — all configurable per instrument. This
is the primary parameter set for the `SidMonSynth` instrument config.

The SidMon "negation" effect (a sample-mutation technique that flips portions of PCM
waveform data in real-time for ring-modulation-like effects) is an advanced feature
present in the sample info runtime state at offsets 0x0A–0x1C. This is a defining
sound characteristic of SidMon 2.0 music.
