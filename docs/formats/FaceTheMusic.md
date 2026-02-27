# Face The Music

**Status:** NATIVE_SAMPLER — parser extracts PCM samples, uses Sampler engine
**Parser:** `src/lib/import/formats/FaceTheMusicParser.ts`
**Extensions:** `ftm`, UADE eagleplayer
**Replayer source:** `docs/formats/Replayers/FaceTheMusic/PlayFTM` (binary only)
**Reference files:** `Reference Music/Face The Music/` (95 files)

---

## Overview

Face The Music is an 8-channel Amiga tracker from around 1992. Key features:
- **8 channels** (linear slide, not Amiga hardware-style)
- **Embedded or external IFF samples** — the parser handles the embedded-sample variant
- **Event stream encoding** — channels use pair-of-bytes events with run-length spacing
- **Effects scripts** — per-instrument effect sequences (not standard ProTracker effects)
- **Magic:** `"FTMN"` at offset 0, version byte 3

**Primary reference:** OpenMPT `Load_ftm.cpp`

---

## File Layout

```
Offset  Size              Description
------  ----------------  -----------
0x00    4                 Magic: "FTMN"
0x04    1                 Version (must be 3)
0x05    1                 Number of samples (0–63)
0x06    2                 Number of measures (big-endian)
0x08    2                 Tempo: default 14209 ≈ 125 BPM; BPM = 1777517.482 / tempo
0x0A    1                 Tonality (0–11)
0x0B    1                 Mute status (bitmask, bit N = channel N muted)
0x0C    1                 Global volume (0–63)
0x0D    1                 Flags: bit 0 = embedded samples, bit 1 = LED filter
0x0E    1                 Ticks per row (1–24)
0x0F    1                 Rows per measure (4–96; typically 96 / ticksPerRow)
0x10    32                Song title (null-padded ASCII)
0x30    32                Artist name (null-padded ASCII)
0x50    1                 Number of effects (0–64)
0x51    1                 Padding (must be 0)
0x52    numSamples×32     Sample headers (32 bytes each)
        numEffects×4      Effect table (u16BE numLines + u16BE index per entry; skipped)
        effects data      Effect scripts (numLines × 4 bytes each; skipped)
        8×?               Channel data (8 channels, variable-length event streams)
        ?                 Sample PCM data (if flags & 0x01)
```

---

## Sample Header (32 bytes each)

```
Offset  Size  Description
------  ----  -----------
0x00    30    Sample name (null-padded ASCII)
0x1E    1     Unknown
0x1F    1     IFF octave (used when loading external IFF samples)
```

Sample names (30 bytes) are the instrument display names.

---

## Channel Data (Event Stream)

Each of the 8 channels has:
```
u16BE  defaultSpacing   — default number of rows between events
u32BE  chunkSize        — total size of this channel's event stream in bytes
  event stream (chunkSize bytes): pairs of 2 bytes
```

### Event Pair Encoding (2 bytes)

```
byte0 hi nibble:
  0xF  → Spacing update: new spacing = ((byte0 & 0x0F) << 8) | byte1
  else → Note event at current position:

Note event — byte0:
  0x00: Set instrument only, no new note (param from byte0 low + byte1 high)
  0xB0: SEL effect (secondary effect trigger)
  0xC0: Pitch bend
  0xD0: Volume down
  0xE0: Loop point marker (not a note event)
  other hi nibble (1-9, A): set channel volume + instrument

Note event — byte1 (lower 6 bits = note):
  0: No note change (sustain)
  1–34: Note value → pitch = NOTE_MIDDLEC - 13 + note
        (NOTE_MIDDLEC = 61 in OpenMPT convention; C5 = 61, so note 1 = C4)
  35+: Key off
```

---

## BPM Calculation

```
BPM = 1777517.482 / tempo_value
Default tempo = 14209 → BPM ≈ 125
```

This is a CIA timer-based BPM formula specific to Face The Music.

---

## Sample PCM Data (when flags & 0x01)

Embedded samples are stored after the channel data. For each sample with a non-empty name:

```
u16BE  loopStart   — loop start in words (multiply by 2 for bytes)
u16BE  loopLength  — loop length in words (multiply by 2 for bytes; 0 = no loop)
PCM data           — 8-bit signed; total size = (loopStart + loopLength) × 2 bytes
```

The PCM data immediately follows the loop info for each sample in sequence.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/FaceTheMusicParser.ts`
- **OpenMPT reference:** `Reference Code/openmpt-master/soundlib/Load_ftm.cpp`
- **Binary player:** `docs/formats/Replayers/FaceTheMusic/PlayFTM`

---

## Implementation Notes

**Current status:** NATIVE_SAMPLER — `FaceTheMusicParser.ts` extracts all 8-channel
events and PCM samples via `createSamplerInstrument()`. Sample names come from the
30-byte name field in each sample header.

The event stream encoding is non-standard (no ProTracker compatibility). The parser
converts the Face The Music note values to XM-compatible note numbers using the
OpenMPT convention (middle C = C5 = note 61).

The 8-channel architecture means this format can play significantly more complex
arrangements than 4-channel ProTracker modules.
