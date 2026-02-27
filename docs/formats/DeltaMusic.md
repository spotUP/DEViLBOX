# Delta Music 1.0 / 2.0

**Status (v1.0):** DETECTION_ONLY — parser identifies format, synthesis falls back to UADE
**Status (v2.0):** NATIVE_SAMPLER — PCM and synth instruments handled by Sampler engine
**Parsers:** `src/lib/import/formats/DeltaMusic1Parser.ts`, `src/lib/import/formats/DeltaMusic2Parser.ts`
**Extensions:** `dl` (v1.0), `.fnl` extension / magic at internal offset (v2.0), UADE eagleplayer
**Replayer source:** `docs/formats/Replayers/DeltaMusic/`
**Reference files:** `Reference Music/Delta Music/`

---

## Overview

Delta Music is an Amiga software synthesis tracker in two distinct versions:

- **Delta Music 1.0** — magic `ALL ` at offset 0x00, flat sequential format
- **Delta Music 2.0** — magic `.FNL` at absolute offset 0xBC6 (after 0xBC6 bytes of
  compiled 68k player code), complex format with waveforms, PCM samples, and
  full synthesis engine

Both versions share the same block/track arrangement concept — 4 voices, per-voice
track sequences referencing 16-row blocks, with instrument-level ADSR and synthesis
parameters. Version 2.0 adds synthesis waveforms, an arpeggio table bank, pitch bend,
and PCM samples in addition to synth instruments.

---

## Delta Music 1.0 File Layout (`ALL `)

```
Offset  Size       Description
------  ---------  -----------
0x00    4          Magic: "ALL " (note trailing space)
0x04    4          Track 1 length in bytes (T1L)
0x08    4          Track 2 length in bytes (T2L)
0x0C    4          Track 3 length in bytes (T3L)
0x10    4          Track 4 length in bytes (T4L)
0x14    4          Block data length in bytes (BL)
0x18    20×4       Instrument lengths in bytes (IL[0..19], 4 bytes each = 80 bytes total)
0x68    T1L        Track 1 data
        T2L        Track 2 data
        T3L        Track 3 data
        T4L        Track 4 data
        BL         Block data
        sum(IL)    All instruments (concatenated sequentially)
```

### Track Data (Delta Music 1.0)

Each track is a sequence of 2-byte pairs:
```
Byte 0: Block number (0-based index into block data)
Byte 1: Transpose value (signed semitone offset)
```

If both bytes are `0xFF`: end of track. The next two bytes `& 0x7FF` = new position
(in 2-byte pair units) to loop back to within the track.

### Block Data (Delta Music 1.0)

Each block is 64 bytes = 16 rows × 4 bytes. Each block covers a single channel.

Row format:
```
Byte 0: A — Instrument number to use (1-based; 0 = no change)
Byte 1: B — Note value (add transpose to get real note)
Byte 2: C — Effect number
Byte 3: D — Effect argument
```

### Instrument Data (Delta Music 1.0)

Variable-length per instrument (size given by `IL[i]`). Structure:

```
Offset  Size  Description
------  ----  -----------
0x00    1     Attack step
0x01    1     Attack delay
0x02    1     Decay step
0x03    1     Decay delay
0x04    1     Sustain level
0x06    1     Release step
0x07    1     Release delay
0x08    1     Volume (0–64)
0x09    1     Vibrato wait
0x0A    1     Vibrato step
0x0B    1     Vibrato length
0x0C    1     Bend rate
0x0D    1     Portamento speed
0x0E    1     Sample number (index into PCM data, if any)
0x0F    1     Table delay
0x10    1     Arpeggio base
0x18    2     Sound length (in words)
0x1A    2     Repeat start (in words)
0x1C    2     Repeat length (in words)
0x1E    ?     Table (waveform/modulation data)
...    SL×2   Sample data (8-bit signed PCM, if instrument uses a sample)
```

Instrument names are not stored in Delta Music 1.0. Use generic names.

---

## Delta Music 2.0 File Layout (`.FNL` at 0xBC6)

The first `0xBC6` bytes contain the compiled 68k player code. The song data begins
immediately after at offset `0xBC6`.

```
Offset  Size       Description
------  ---------  -----------
0x000   0xBC6      Player code (68k binary — not parsed)
0xBC6   4          Magic: ".FNL"
0xBCA   1024       Arpeggio tables (64 tables × 16 bytes each)
0xFCA   2          Track 1 loop position
0xFCC   2          Track 1 length (T1L, in 2-byte pairs)
0xFCE   2          Track 2 loop position
0xFD0   2          Track 2 length (T2L)
0xFD2   2          Track 3 loop position
0xFD4   2          Track 3 length (T3L)
0xFD6   2          Track 4 loop position
0xFD8   2          Track 4 length (T4L)
0xFDA   T1L×2      Track 1 data
        T2L×2      Track 2 data
        T3L×2      Track 3 data
        T4L×2      Track 4 data
        4          Block data length (BL, in bytes)
        BL         Block data
        ?          Offset-to-instruments table (varies)
        2          Instrument data length (IL)
        IL         Instrument definitions (concatenated)
        4          Waveform data length (WL)
        WL         Waveform data (256-byte waveforms, 8-bit signed)
        64         Unknown
        32         Sample start offsets (8 × 4 bytes — absolute file offsets)
                   Sample PCM data
```

### Track Data (Delta Music 2.0)

Same 2-byte pair encoding as v1.0:
```
Byte 0: Block number
Byte 1: Transpose value
```

### Block Data (Delta Music 2.0)

Each block is 64 bytes = 16 rows × 4 bytes per row.

Row format (**note byte order differs from v1.0**):
```
Byte 0: A — Note value (add transpose)
Byte 1: B — Instrument number
Byte 2: C — Effect number
Byte 3: D — Effect argument
```

### Instrument Data (Delta Music 2.0)

Each instrument is a fixed-size struct:

```
Offset  Size  Description
------  ----  -----------
0x00    2     Sample length in words
0x02    2     Loop start in words
0x04    2     Loop length in words (0 = no loop, 1 = full sample loop)
0x06    45    Volume table (15 × 3 bytes: [increment, level, sustain_count])
0x33    45    Vibrato table (15 × 3 bytes: [increment, delay, sustain_count])
0x60    2     Pitch bend value
0x62    1     Is sample (0xFF = PCM sample, 0x00 = synth waveform)
0x63    1     Sample number (PCM sample index if is_sample; waveform index if synth)
0x64    72    Synthesis table (48 bytes? — modulation table for synth instruments)
```

**Synthesis constants used by DeltaMusic2Parser.ts:**
- `PAL_CLOCK = 3546895` Hz
- `REFERENCE_NOTE = 37` (A-3, period 856 → base frequency ≈ 4143 Hz)
- `SYNTH_BASE_RATE = 2072` Hz (waveform tick rate for synthesis)
- `PCM_BASE_RATE = 8287` Hz (PCM sample playback rate)

---

## Synthesis vs. Sample Instruments

Delta Music 2.0 has two instrument types:
- **PCM samples** (`isSample = 0xFF`): 8-bit signed PCM data at the sample offsets block.
  Use `createSamplerInstrument()` with `PCM_BASE_RATE`.
- **Synth instruments** (`isSample = 0x00`): Reference a 256-byte waveform from the
  waveform data block. Currently implemented as Sampler instruments playing the raw
  waveform bytes at `SYNTH_BASE_RATE`.

Waveforms are 256 bytes of 8-bit signed PCM. The first waveform is used as a noise
waveform and is generated by the player (all zeros in the file; player fills it).

---

## Reference Implementations

- **Replayer:** `docs/formats/Replayers/DeltaMusic/`
- **NostalgicPlayer specs:**
  - `docs/formats/Delta Music 1.0.txt`
  - `docs/formats/Delta Music 2.0.txt`

---

## Implementation Notes

**Delta Music 1.0 (DETECTION_ONLY):** The v1.0 parser creates `'Synth' as const`
placeholder instruments. UADE handles synthesis. Path to native: instrument data
includes inline PCM at end of struct — extract and use Sampler engine.

**Delta Music 2.0 (NATIVE_SAMPLER):** Both PCM and synth instruments handled natively.
PCM samples use `'Sampler'` type. Synth instruments also use `'Sampler'` — the 256-byte
waveform is used as a one-shot PCM buffer at `SYNTH_BASE_RATE = 2072 Hz`. This is an
approximation; true synthesis would implement the volume/vibrato tables as modulation.
