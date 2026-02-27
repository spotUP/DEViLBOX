# Delta Music 1.0

**Status:** DETECTION_ONLY — parser identifies format, synthesis falls back to UADE
**Parser:** `src/lib/import/formats/DeltaMusic1Parser.ts`
**Extensions:** `dm`, `dm1`, UADE eagleplayer
**Replayer source:** `docs/formats/Replayers/DeltaMusic/`
**Reference files:** `Reference Music/Delta Music/`

---

## Overview

Delta Music 1.0 is an Amiga tracker format using the magic `"ALL "` (3 bytes + space)
at offset 0. It uses 4 independent voice tracks (each with its own song-length block),
a block system where each block is 64 bytes of single-channel note data, and embedded
instruments containing PCM sample data with full ADSR + vibrato + arpeggio + waveform
table synthesis.

The name "Delta Music" refers to a delta-coding scheme used in instruments — samples
may be stored as delta-encoded values that require accumulation to reconstruct the
waveform.

---

## File Layout

```
Offset  Size          Description
------  ------------- -----------
0x00    4             Magic: "ALL " (0x41 0x4C 0x4C 0x20)
0x04    4             Track 1 length in bytes (T1L)
0x08    4             Track 2 length in bytes (T2L)
0x0C    4             Track 3 length in bytes (T3L)
0x10    4             Track 4 length in bytes (T4L)
0x14    4             Block data length in bytes (BL)
0x18    80            Instrument lengths (20 instruments × 4 bytes each, big-endian)
0x68    T1L           Track 1 data
        T2L           Track 2 data
        T3L           Track 3 data
        T4L           Track 4 data
        BL            Block data (variable number of 64-byte blocks)
        per IL[i]     Instrument data for each instrument
```

---

## Track Data

Each track is a flat sequence of 2-byte pairs:

```
Byte 0: Block number (index into block data)
Byte 1: Transpose value (signed, added to all notes in this block)
```

End-of-track marker: if both bytes are `0xFF`, the track ends. The following 2 bytes
`& 0x7FFF` give the new position in the track (restart/loop offset in bytes).

---

## Block Data

Blocks are fixed 64 bytes each. Each block contains note data for a single channel:
16 rows × 4 bytes per row.

### Block Row Format (4 bytes per row)

```
Byte 0: AAAAAAAA — Instrument number (1-based; 0 = no change)
Byte 1: BBBBBBBB — Note (0 = rest; add transpose from track data to get actual note)
Byte 2: CCCCCCCC — Effect number
Byte 3: DDDDDDDD — Effect argument
```

Effects are not fully documented in the spec. The most common effects follow
ProTracker conventions (arpeggio, volume slide, etc.).

---

## Instrument Data (variable length per instrument)

Each instrument contains a header followed by a wavetable (if any) and PCM sample data.

```
Offset  Size  Description
------  ----  -----------
0x00    1     Attack step (volume increment per tick during attack)
0x01    1     Attack delay (ticks between attack steps)
0x02    1     Decay step
0x03    1     Decay delay
0x04    1     Sustain level (volume target after decay)
0x05    1     Unknown / padding
0x06    1     Release step
0x07    1     Release delay
0x08    1     Volume (peak volume, 0–64)
0x09    1     Vibrato wait (ticks before vibrato starts)
0x0A    1     Vibrato step (pitch increment per vibrato tick)
0x0B    1     Vibrato length (ticks per vibrato cycle)
0x0C    1     Bend rate (pitch bend speed)
0x0D    1     Portamento speed
0x0E    1     Sample number (which of the samples to use as base waveform, 0-based)
0x0F    1     Wavetable delay (ticks between wavetable steps)
0x10    1     Arpeggio (semitone arpeggio pattern code)
              (further fields follow up to the PCM data start)
0x18    2     Sound length in words (PCM oneshot length)
0x1A    2     Repeat start in words (loop start)
0x1C    2     Repeat length in words (loop length; 1 = no loop)
0x1E    ?     Wavetable (optional; referenced by instrument)
0x4E    ?     PCM sample data (8-bit signed, big-endian)
              Length = instrumentLength[i] - header size
```

**Note:** The spec lists offsets 0x00–0x1E for the instrument header and shows
PCM data starting at 0x4E, but instrument lengths vary. The actual PCM data starts
after any wavetable data referenced from the header.

---

## Reference Implementations

- **Replayer:** `docs/formats/Replayers/DeltaMusic/`
- **NostalgicPlayer spec:** `docs/formats/Delta Music 1.0.txt`
- **See also:** `DeltaMusic2Parser.ts` for the v2.0 format (`.FNL` magic, fully native)

---

## Implementation Notes

**Current status:** DETECTION_ONLY — `DeltaMusic1Parser.ts` creates `'Synth' as const`
placeholder instruments. UADE handles synthesis.

**Contrast with Delta Music 2.0:** The v2.0 format (magic `.FNL` at offset 0xBC6) is
already NATIVE_SAMPLER in `DeltaMusic2Parser.ts` with constants:
- `PAL_CLOCK = 3546895`
- `REFERENCE_NOTE = 37` (Amiga period 856)
- `SYNTH_BASE_RATE = 2072 Hz` (for synthesis waveforms)
- `PCM_BASE_RATE = 8287 Hz` (for PCM samples)

**Path to NATIVE_SAMPLER for Delta Music 1.0:**
The instrument data contains inline PCM at a calculable offset. PCM size =
`instrumentLengths[i] - headerSize`. Use `DeltaMusic2Parser.ts` as the reference
implementation template for PCM extraction logic.
