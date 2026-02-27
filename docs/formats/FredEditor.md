# Fred Editor

**Status:** FULLY_NATIVE — custom WASM synth (`FredSynth`) for synthesis instruments;
`'Synth' as const` fallback for unhandled instrument types
**Parser:** `src/lib/import/formats/FredEditorParser.ts`
**Extensions:** `fred`, UADE eagleplayer
**Replayer source:** `docs/formats/Replayers/FredEditor/FRED.s` (main replayer),
`docs/formats/Replayers/FredEditor/MON.S` (monitor/debugger)
**Reference files:** `Reference Music/FredMon/` (contains `.fred` files)

---

## Overview

Fred Editor (by Jens Ernstig, 1990) is an Amiga software-synthesis tracker with a
unique instrument model. Rather than storing PCM samples, instruments define:
- **Waveform sequences** (lists of waveform/sample references stepped over time)
- **Volume envelopes** (A0/D0/E0/B0 command opcodes)
- **Frequency envelopes** (D0/A0/E0/B0 command opcodes)
- **Arpeggio tables** (16-byte transpose tables)
- **Pulse-width modulation** (for square-wave synthesis)
- **Blending** (cross-fade between two waveforms)

The format supports up to 4 voices, multiple sub-songs, 128 pattern slots,
and uses a variable-length pattern system where the row count varies per pattern.

The file magic is `"Fred Editor"` (14 bytes) at offset 0.

---

## File Layout

```
Offset       Size          Description
-----------  ------------- -----------
0x00         14            Magic: "Fred Editor"
0x0E         2             Number of sub-songs (NOS)
0x10         NOS           Start tempo for each sub-song (1 byte each)
0x10+NOS     NOS×1028      Position data for each sub-song:
                             4 channels × 256 positions = 1024 bytes position table
                             + 4 bytes alignment/length
             128×?         Patterns (variable-length blocks; see below)
             2             Number of instruments (NOI)
             NOI×?         Instrument information (variable-length; see below)
             2             Number of samples (NSA)
             NSA×6         Sample information (6 bytes each)
             4             End mark: 0x12 0x34 0x56 0x78
```

---

## Position Data

Each sub-song has position data for all 4 channels:

```
4 channels × 256 bytes = 1024 bytes
Each byte = pattern index for that position (0–127)
```

Position data for channel N starts at: `0x10 + NOS + (songIndex * 1028) + (channelIndex * 256)`

---

## Pattern Layout

Each pattern is preceded by:
```
Offset  Size  Description
------  ----  -----------
0       4     Pattern size in bytes (PS)
4       PS    Pattern row data
```

Pattern row data: each row = 4 bytes.

```
Row format (4 bytes):
  Byte 0: Note (0 = rest; 1-based note index)
  Byte 1: Instrument + flags (bits 4-7 = instrument number, bits 0-3 = flags?)
  Byte 2: Effect / sub-command
  Byte 3: Effect parameter
```

---

## Instrument Information (variable length)

Each instrument definition is variable length, containing:

```
Offset  Size  Description
------  ----  -----------
0       32    Instrument name (null-padded ASCII)
32      4     Index (internal identifier)
36      2     Repeat length (-1 = no repeat/loop)
38      2     Sample/waveform length
40      2     Period (base Amiga period for pitch)
42      1     Vibrato delay
43      1     Unknown
44      1     Vibrato speed
45      1     Vibrato amplitude
46      1     Envelope volume
47      1     Attack speed
48      1     Attack volume (peak)
49      1     Decay speed
50      1     Decay volume (sustain level)
51      1     Sustain delay (ticks at sustain)
52      1     Release speed
53      1     Release volume (final level)
54      16    Arpeggio table (16 signed-byte semitone offsets)
70      1     Arpeggio speed
71      1     Instrument type (0 = sample, 1 = synthesis)
72      1     Pulse rate minimum
73      1     Pulse rate plus (range)
74      1     Pulse speed
75      1     Pulse start
76      1     Pulse end
77      1     Pulse delay
78      1     Instrument sync
79      1     Blend amount
80      1     Blend delay
81      1     Pulse shot counter
82      1     Blend shot counter
83      1     Arpeggio counter
84      12    Unknown / padding
```

Instrument names (32 bytes) are the primary display names in the UI.

---

## Sample Information (6 bytes each)

```
Offset  Size  Description
------  ----  -----------
0       2     Instrument index that this sample belongs to
2       2     Sample data length in bytes
4       2     (variable; sample data follows?)
```

---

## Instrument Volume Envelope Commands

Volume sequences use a 4-byte opcode format:

| Opcode | Args | Description |
|--------|------|-------------|
| `C0 aa bb cc` | waveform/sample=aa, step=bb, count=cc | Set waveform/sample source |
| `A0 aa bb cc` | volume-start=aa, volume-end=bb, length=cc | Volume sweep |
| `E0 00 00 00` | — | Stop (cut voice) |
| `B0 aa 00 00` | position=aa | GOTO/loop to step position `aa` |

---

## Instrument Frequency Envelope Commands

Same 4-byte opcode format:

| Opcode | Args | Description |
|--------|------|-------------|
| `D0 aa bb cc` | offset=aa (×2 for semitones, 0x18=octave up), unused=bb, duration=cc | Hold frequency |
| `A0 aa bb cc` | start-offset=aa, end-offset=bb, duration=cc | Frequency glide |
| `E0 00 00 00` | — | Stop |
| `B0 aa 00 00` | position=aa | GOTO/loop |

---

## Waveform/Sample References

In the `C0` volume command:
- `aa` values 0x00–0x09 → PCM sample (one of the NSA samples)
- `aa` values 0x0A–0x33 → Software waveform (42 waveform slots)

The `bb` field (step) controls how quickly the player advances through waveforms
for animated timbres. `bb = 0` means static (use `aa` permanently).

---

## Reference Implementations

- **Primary replayer:** `docs/formats/Replayers/FredEditor/FRED.s`
- **Monitor:** `docs/formats/Replayers/FredEditor/MON.S`
- **NostalgicPlayer spec:** `docs/formats/Fred Editor.txt`
- **Compiled player binaries:** `docs/formats/Replayers/FredEditor/FREDPLA0.2ED`, etc.

---

## Implementation Notes

**Current status:** FULLY_NATIVE — `FredEditorParser.ts` emits `'FredSynth'` for synthesis
instruments. A dedicated WASM synth handles Fred's unique synthesis model.

For samples (`instrument type = 0`), `'Synth' as const` is used as fallback — these
may need upgrading to `createSamplerInstrument()` if sample PCM extraction is desired.

The Fred synthesis model is distinctive: no ADSR in the traditional sense, instead
using explicit volume/frequency opcode sequences that the player interprets at runtime.
