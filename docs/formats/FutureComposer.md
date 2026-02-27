# Future Composer

**Status:** FULLY_NATIVE — custom WASM synth (`FCSynth`); `'Synth' as const` fallback
**Parser:** `src/lib/import/formats/FCParser.ts`
**Extensions:** `fc`, `fc13`, `fc14`, `smod` (v1.0-1.3), UADE eagleplayer
**Replayer source:** `docs/formats/Replayers/FutureComposer/FutureComposer_v1.4.s`,
`docs/formats/Replayers/FutureComposer/FC1.4replay.S`, etc.
**Reference files:** `Reference Music/Future Composer/`

---

## Overview

Future Composer is one of the most iconic Amiga music formats, created by Walkman/Xymox
around 1987-1990. It uses a powerful software synthesis engine combining:
- **Waveform tables** (up to 80 waveform slots) — 16-byte PCM wave snippets
- **Frequency sequences** — opcode-driven pitch envelopes with vibrato and pitch bends
- **Volume sequences** — opcode-driven amplitude envelopes
- **PCM samples** — short instrument samples (SSMP block)

Multiple versions exist:
- **v1.0–1.3:** Magic `SMOD`, no waveform tables
- **v1.4:** Magic `FC14`, adds waveform tables in a separate wavetable block

The format uses 4 voices, global sequences list, and 64-byte patterns.

---

## File Layout — Future Composer 1.4 (FC14)

```
Offset  Size        Description
------  ----------  -----------
0x00    4           Magic: "FC14"
0x04    4           Length of sequences section in bytes (SeqLen)
                    Song length = SeqLen / 13
0x08    4           Offset to patterns section
0x0C    4           Length of patterns section in bytes
0x10    4           Offset to frequency sequences section
0x14    4           Length of frequency sequences in bytes
0x18    4           Offset to volume sequences section
0x1C    4           Length of volume sequences in bytes
0x20    4           Offset to sample data (SSMP block)
0x24    4           Offset to wavetable data (v1.4 only; offset 0x24–0x27)
0x28    60          Sample info (10 samples × 6 bytes each)
0x64    128         Wavetable lengths in words (80 entries × 2 bytes; v1.4 only;
                    wavetable data is located at the wavetable offset from 0x24)
0xB4    SeqLen      Sequences (13 bytes each)
                    ...                    Patterns
                    ...                    Frequency sequences
                    ...                    Volume sequences
                    ...                    SSMP sample block (magic "SSMP" + samples)
                    ...                    Wavetable data (v1.4)
```

---

## File Layout — Future Composer 1.0–1.3 (SMOD)

Identical except:
- Magic at 0x00: `SMOD` (4 bytes)
- No wavetable section (offset 0x24 is unused / replaced by sample data offset)
- No 128-byte wavetable length table
- Sequences start at 0x64 (not 0xB4)

---

## Sample Information (6 bytes each, 10 slots)

```
Offset  Size  Description
------  ----  -----------
0x0     2     Sample length in words
0x2     2     Loop start offset in bytes (from sample start)
0x4     2     Loop length in words (1 = no loop)
```

No names stored in sample info. Instruments are anonymous.

---

## SSMP Block (Sample Data)

Starts with magic `SSMP` (4 bytes), then:

```
0       4     Magic: "SSMP"
4       16×16 Sample info (16 samples × 16 bytes each)
              Offset  Size  Description
              ------  ----  -----------
              0       4     Start offset in bytes (from start of sample block)
              4       2     Length in words
              6       2     Loop start offset in bytes
              8       2     Loop length in words
              10      6     Padding
324     ?     Sample PCM data (8-bit signed)
```

---

## Sequences (13 bytes each)

The sequence list is the song's arrangement. Each sequence entry controls all 4 voices:

```
Offset  Size  Description
------  ----  -----------
0       1     Voice 1: pattern index
1       1     Voice 1: note transpose value
2       1     Voice 1: sound transpose value (instrument offset)
3       1     Voice 2: pattern index
4       1     Voice 2: note transpose value
5       1     Voice 2: sound transpose value
6       1     Voice 3: pattern index
7       1     Voice 3: note transpose value
8       1     Voice 3: sound transpose value
9       1     Voice 4: pattern index
10      1     Voice 4: note transpose value
11      1     Voice 4: sound transpose value
12      1     Default start speed for this sequence row
```

Song length in sequences = SeqLen / 13.

---

## Patterns (64 bytes each = 32 rows × 2 bytes)

```
Row format (2 bytes):
  Byte 0: Note value (0 = rest; 1-based)
  Byte 1: Info byte: bits 7-4 = instrument number, bits 3-0 = flags/effect nibble
```

---

## Frequency Sequences (64 bytes each)

Frequency sequences drive the pitch envelope. The player runs a pointer through
the sequence, executing opcodes:

| Opcode | Args | Description |
|--------|------|-------------|
| `$E0 x` | x = target position | Position jump (loop) |
| `$E1` | — | End of sequence |
| `$E2 x` | x = waveform number | Set waveform and trigger it |
| `$E3 x y` | x = rate, y = amount | New vibrato |
| `$E4 x` | x = waveform number | Change waveform without retriggering |
| `$E7 x` | x = position | Pattern jump |
| `$E8 x` | x = sustain ticks | Set sustain time |
| `$E9 x y` | x = instrument, y = sample | Set sample (x = instrument index, y = sample within instrument) |
| `$EA x y` | x = speed, y = amount | Pitch bend |

Values below `$E0` are treated as **frequency offsets** (note transpose values applied
to the playing note).

---

## Volume Sequences (64 bytes each)

Similar opcode format:

| Opcode | Args | Description |
|--------|------|-------------|
| `$E0 x` | x = target position | Position jump (loop) |
| `$E1` | — | End of sequence |
| `$E8 x` | x = sustain ticks | Set sustain time |
| `$EA x y` | x = speed, y = amount | Volume bend |

Values below `$E0` are direct volume levels (0–63).

---

## Wavetable Data (v1.4 only)

80 waveform slots, each `wavetableLength[i] * 2` bytes of 8-bit signed PCM.
Wavetables are short looping waveforms used as synthesis oscillator sources.

---

## Reference Implementations

- **v1.4 replayer:** `docs/formats/Replayers/FutureComposer/FutureComposer_v1.4.s`
- **v1.4 alternate:** `docs/formats/Replayers/FutureComposer/FC1.4replay.S`
- **v1.3 replayer:** `docs/formats/Replayers/FutureComposer/FutureComposer_v1.3_DPrs.s`
- **v1.0 replayer:** `docs/formats/Replayers/FutureComposer/FutureComposer_v1.0.S`
- **NostalgicPlayer spec:** `docs/formats/Future Composer.txt`

---

## Implementation Notes

**Current status:** FULLY_NATIVE — `FCParser.ts` emits `'FCSynth'` instruments for
the synthesis engine. A dedicated WASM synth handles the FC synthesis model
(waveform tables, frequency/volume sequences, vibrato, pitch bends).

Fallback: Some instrument types use `'Synth' as const` for UADE synthesis.

The Future Composer synthesis model is notable for its separation of pitch and volume
automation via independent opcode sequences (analogous to separate per-instrument
LFOs), which requires a two-thread-per-voice model in the WASM engine.
