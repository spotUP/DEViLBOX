# Sound Factory

**Status:** DETECTION_ONLY — parser identifies format, synthesis falls back to UADE
**Parser:** `src/lib/import/formats/SoundFactoryParser.ts`
**Extensions:** `snr` (Song Notation Record), UADE eagleplayer
**Replayer source:** `docs/formats/Replayers/SoundFactory/Source_Files/IRQ-Music.S`
**Reference files:** `Reference Music/Sound Factory/`

---

## Overview

Sound Factory is an Amiga tracker authored around 1990, notable for its opcode-stream
song format rather than a fixed pattern grid. Each voice is driven by a linear sequence
of opcodes that can represent notes, control effects, loops, subroutines, and embedded
instrument definitions inline. Supports up to 4 voices, 10 subsongs, ADSR envelopes,
vibrato, phasing, arpeggio, portamento, tremolo, and a hardware low-pass filter sweep.

The sample data is embedded inline within the instrument definition — there is no
separate sample block. Each instrument definition contains its full PCM data immediately
after the header struct.

---

## File Layout

```
Offset  Size   Description
------  -----  -----------
0x00    4      Total module length in bytes
0x04    2      Voice usage bitmask for each subsong (bits 0-3 per subsong, 0 = not used)
0x0E    160    Subsong information (10 subsongs × 16 bytes)
0x9E    ...    Opcode data (variable-length per voice per subsong)
```

### Subsong Information (16 bytes each, 10 subsongs)

```
Offset  Size  Description
------  ----  -----------
0x0     4     Offset to first opcode for voice 1
0x4     4     Offset to first opcode for voice 2
0x8     4     Offset to first opcode for voice 3
0xC     4     Offset to first opcode for voice 4
```

All offsets are relative to the start of the file.

---

## Opcode Stream

Each voice is driven by a flat opcode stream. The player reads opcodes sequentially:

```
Byte    Description
------  -----------
0x00-7F Note number. Followed by a 16-bit duration value (big-endian).
        Duration specifies how many ticks to sustain the note.
0x80-FF Control opcode (see table below)
```

### Control Opcodes

| Opcode | Args | Description |
|--------|------|-------------|
| `0x80` | `xxxx` | Pause — silence for `xxxx` ticks |
| `0x81` | `xx` | Set volume (0–64) |
| `0x82` | `xx` | Set finetune |
| `0x83` | `xx` | Set instrument number (reference a previously-defined instrument) |
| `0x84` | `xx yyyy` | Define new instrument for slot `xx`. `yyyy` = length in words of the instrument data starting at the next byte position |
| `0x85` | — | Return from subroutine |
| `0x86` | `xxxxxxxx` | Jump to subroutine at relative offset `xxxxxxxx` |
| `0x87` | `xxxxxxxx` | Unconditional jump to relative offset `xxxxxxxx` |
| `0x88` | `xx` | Begin for-loop — iterate the following opcodes `xx` times |
| `0x89` | — | End of for-loop (Next) |
| `0x8A` | `xx` | Begin fade-out with speed `xx` |
| `0x8B` | — | NOP |
| `0x8C` | — | Request — increment external request counter |
| `0x8D` | — | Loop — restart voice from first opcode in current subsong |
| `0x8E` | — | End — mute voice and halt parsing |
| `0x8F` | `xx` | Begin fade-in with speed `xx` |
| `0x90` | `aa dd ss rr` | Set ADSR: attack, decay, sustain, release |
| `0x91` | — | One-shot mode — do not loop sample |
| `0x92` | — | Period mode |
| `0x93` | `aa bb cc dd ee` | Vibrato: on/off `aa`; if on: wait `bb`, speed `cc`, step `dd`, steps `ee` |
| `0x94` | `xx yy` | Arpeggio: on/off `xx`; if on: speed `yy` |
| `0x95` | `aa bb cc dd ee` | Phasing: on/off `aa`; if on: start `bb`, end `cc`, speed `dd`, step `ee` |
| `0x96` | `xx yy zz` | Portamento: on/off `xx`; if on: speed `yy`, step `zz` |
| `0x97` | `aa bb cc dd` | Tremolo: on/off `aa`; if on: speed `bb`, step `cc`, range `dd` |
| `0x98` | `aa bb cc dd` | Filter sweep: on/off `aa`; if on: frequency `bb`, end `cc`, speed `dd` |
| `0x99` | `xxxx` | Stop voice and pause for `xxxx` ticks |
| `0x9A` | `xx` | LED filter: `0x00` = off, else on |
| `0x9B` | `xx` | Wait until external request counter reaches `xx` |
| `0x9C` | `xx` | Set transpose to `xx` |

---

## Instrument Definition (opcode 0x84 inline block)

Instrument data is embedded inline in the opcode stream. Length in bytes = `SL*2 + 0x22`.

```
Offset  Size   Description
------  -----  -----------
0x00    2      Sample data length in words (SL) — PCM length = SL × 2 bytes
0x02    2      Sampling period for middle-C (0 = use default)
0x04    1      Effect flags:
               Bit 0: 0 = loop, 1 = one-shot
               Bit 1: vibrato
               Bit 2: arpeggio
               Bit 3: phasing
               Bit 4: portamento
               Bit 5: 0 = release on, 1 = release off
               Bit 6: tremolo
               Bit 7: filter
0x05    1      Tremolo speed
0x06    1      Tremolo step
0x07    1      Tremolo range
0x08    2      Portamento step (big-endian)
0x0A    1      Portamento speed
0x0B    1      Arpeggio speed
0x0C    1      Vibrato delay
0x0D    1      Vibrato speed
0x0E    1      Vibrato step
0x0F    1      Vibrato amount
0x10    1      Attack time
0x11    1      Decay time
0x12    1      Sustain level
0x13    1      Release time
0x14    1      Phasing start
0x15    1      Phasing end
0x16    1      Phasing speed
0x17    1      Phasing step
0x18    1      Number of waveform steps (for wavetable synthesis)
0x19    1      Octave of sampling rate (if sampling rate given)
0x1A    1      Filter frequency
0x1B    1      Filter end frequency
0x1C    1      Filter speed
0x1D    1      Padding
0x1E    2      One-shot mode: if both words ≠ 0, used for digitized ASR mode
0x20    2      Digitized ASR: offset of sustain phase in words
0x22   SL×2   Sample PCM data (8-bit signed, big-endian layout assumed)
```

---

## Notes on Instrument Name Extraction

Sound Factory does **not** store instrument names. Instruments are anonymous and
identified only by slot number. The parser should emit generic names like `"Instrument 1"`.

---

## Reference Implementations

- **Replayer assembly:** `docs/formats/Replayers/SoundFactory/Source_Files/IRQ-Music.S`
- **Short description:** `docs/formats/Replayers/SoundFactory/snr.doc`
- **NostalgicPlayer format spec:** `docs/formats/Sound Factory.txt`
- **UADE player path:** `Reference Code/uade-3.05/players/SoundFactory` (eagleplayer binary)

---

## Implementation Notes

**Current status:** DETECTION_ONLY — The parser (`SoundFactoryParser.ts`) identifies the
format but creates `'Synth' as const` placeholder instruments that fall through to UADE.

**Path to NATIVE_SAMPLER:**
The inline instrument structure has PCM data at `offset 0x22`. After parsing the opcode
stream and identifying each `0x84` instrument-definition block:
1. Read `SL` (words) at instrument offset 0
2. Sample data is at `instrumentOffset + 0x22`, length = `SL * 2` bytes
3. Create `createSamplerInstrument()` with 8-bit signed PCM, period-based pitch
4. The "sampling period for C" at offset 0x02 maps to Amiga period → Hz using the
   standard `PAULA_CLOCK / period` formula

**Path to NATIVE_WASM:**
Full synthesis would require implementing the opcode sequencer and effects chain
(ADSR, vibrato, phasing, portamento, tremolo, filter sweep) in C WASM. The replayer
assembly (`IRQ-Music.S`) is the definitive reference.
