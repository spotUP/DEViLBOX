# KRIS (ChipTracker)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/KRISParser.ts`
**Extensions:** `.kris`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/ChipTracker/`

---

## Overview

ChipTracker KRIS format is a 4-channel Amiga tracker identified by the "KRIS" magic at
offset 952. It uses a MOD-compatible sample header layout but replaces the pattern data
with a track reference table supporting per-entry transpose values. Optional synthetic
instrument waveforms (64-byte blocks) can precede the track pool.

Reference: OpenMPT `soundlib/Load_kris.cpp`

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0       22    Song name (ASCII, space-padded)
22      930   31 × MOD sample headers (30 bytes each):
              name(22) + length(u16BE, words) + finetune(i8) + volume(u8)
              + loopStart(u16BE, words) + loopLen(u16BE, words)
952     4     Magic: "KRIS"
956     1     numOrders (u8, 1–128)
957     1     restartPos (u8, 0–127)
958     1024  Track reference table: 128 × 4 × 2 bytes
              Entry at [orderIdx × 4 + ch]:
                byte[0] = track index (u8)
                byte[1] = transpose (i8, signed semitone offset)
1982    ...   Synth waveforms: numSynthWaveforms × 64 bytes (if any)
              tracksOffset = 1982 + numSynthWaveforms × 64
...     ...   Track pool: sequential 256-byte blocks (64 rows × 4 bytes)
...     ...   Sample PCM data: 8-bit signed
```

---

## Detection Algorithm

```
1. buf.byteLength >= 956
2. buf[952..955] == "KRIS"
```

---

## Track Cell Encoding (4 bytes per row)

```
byte 0: note byte
        0x18–0x9E (even values) = valid note
        0xA8 = empty
        other = treat as empty
byte 1: instrument (1-based; 0 = none)
byte 2: high nibble = 0 (must be zero); low nibble = effect type
byte 3: effect parameter
```

**Note decoding:**
```
noteByte range: 0x18–0x9E (step 2)
noteIndex = (noteByte - 0x18) / 2
XM note = amigaPeriodTableLookup(noteIndex) → standard Amiga period → MIDI note
```

---

## Track Reference Table

For each of the 128 order slots and 4 channels:
- **track index**: which block in the track pool to use
- **transpose**: semitone offset applied to all notes in that block (signed i8)

This allows reusing the same melodic pattern at different pitches without storing
separate pattern data.

---

## Synthetic Waveforms

Instruments whose `name[0] == 0x00` are synth instruments. Their waveform data is stored
in 64-byte blocks at offset 1982, one block per synth instrument. The parser detects the
number of synth waveforms from the sample header array.

---

## Channel Configuration

- 4 channels total
- LRRL Amiga panning: `[-50, +50, +50, -50]`
- Sample rate base: 8287 Hz (A=440Hz Amiga standard)

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/KRISParser.ts`
- **OpenMPT reference:** `soundlib/Load_kris.cpp`
