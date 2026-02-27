# Synthesis / InStereo! 1.0

**Status:** DETECTION_ONLY — parser identifies format, synthesis falls back to UADE
**Parsers:** `src/lib/import/formats/SynthesisParser.ts`, `src/lib/import/formats/InStereo1Parser.ts`
**Extensions:** `syn`, `ist`, UADE eagleplayer
**Replayer source:** `docs/formats/Replayers/Synthesis/SynthesisPlayer.s` (Synthesis),
`docs/formats/Replayers/InStereo/XReplayer.asm` (InStereo 1.0)
**Reference files:** `Reference Music/Synthesis/`, `Reference Music/InStereo/`

---

## Overview

Synthesis (magic `Synth4.0`) and InStereo! 1.0 (magic `ISM!V1.2`) are closely related
Amiga tracker formats that combine PCM sample playback with software wavetable synthesis.
Both support up to 4 voices, multiple subsongs, and a rich synthesis engine with 16
synthesis modes including rotation, alien waveform morphing, FM-style drum synthesis,
envelope generators (EGC), and ADSR tables.

The two formats differ mainly in header layout (Synthesis has a longer text region before
instrument data, InStereo 1.0 has fewer effects and no synthesis Fx modes). Both share the
same position/track/instrument structure and are effectively the same synthesis engine with
different feature sets.

---

## File Layout — Synthesis (`Synth4.0`)

```
Offset      Size         Description
----------  -----------  -----------
0x00        8            Magic: "Synth4.0"
0x08        2            Number of positions (NOP)
0x0A        2            Number of track rows (NOR)
0x0C        4            Unknown
0x10        1            Number of samples (NOS)
0x11        1            Number of waveforms (NOW)
0x12        1            Number of instruments (NOI)
0x13        1            Number of sub-songs (NSS)
0x14        1            Number of EG tables (EG)
0x15        1            Number of ADSR tables (ADSR)
0x16        1            Noise length
0x17        13           Unknown
0x24        28 (0x1C)   Module name (null-padded)
0x40        138 (0x8A)  Player text / serial number / credits
0xCA        2            Unknown
0xCC        NOS×0x1C     Sample information (28 bytes each)
            NOS×4        Total sample lengths (bytes per sample)
            EG×128       EG tables (128 bytes each)
            ADSR×256     ADSR tables (256 bytes each)
            NOI×0x1C     Instrument information (28 bytes each)
            16×16        Arpeggio tables (10 tables × 16 bytes)
            (NSS+1)×14   Sub-song information (14 bytes each; extra sub-song ignored)
            NOW×256      Waveforms (256 bytes each = 128 samples × 8-bit signed)
            NOP×16       Position information (16 bytes each)
            (NOR+64)×4   Track rows (4 bytes each; 64 = ProTracker-style guard rows)
                         Sample data (raw PCM, sequentially)
```

---

## File Layout — InStereo! 1.0 (`ISM!V1.2`)

Identical structure except:
- Magic at 0x00: `ISM!V1.2` (8 bytes)
- Unknown region at 0x17 is 14 bytes (instead of 13)
- Player text region at 0x40 is 140 bytes (0x8C instead of 0x8A)
- Sample information starts at 0xCC (same offset)
- Instrument info has fewer synthesis-mode fields (no synthesis Fx, no EGC)

---

## Sub-Song Information (14 bytes each)

```
Offset  Size  Description
------  ----  -----------
0x0     4     Unknown
0x4     1     Speed (ticks per row)
0x5     1     Track length (rows per pattern)
0x6     2     Start position index
0x8     2     Stop position index
0xA     2     Repeat/loop position index
0xC     2     Unknown
```

---

## Position Information (16 bytes per position, 4 bytes per voice)

```
Per-voice entry (4 bytes):
  0  2  Track address (absolute offset into track rows block)
  2  1  Sound transpose (semitone offset for instrument selection)
  3  1  Note transpose (semitone offset applied to note value)
```

---

## Track Row Format (4 bytes per row)

```
Bit layout:
  Byte 0: AAAAAAAA — Note (0-based; add sound+note transposes from position)
  Byte 1: BBBBBBBB — Instrument number (1-based; 0 = no change)
  Byte 2: CCCCDDDD — Arpeggio number (C) | Effect number (D)
  Byte 3: EEEEEEEE — Effect argument
```

### Effects (Synthesis)

| Code | Description |
|------|-------------|
| `0` | No effect |
| `1` | Slide up/down |
| `2` | Reset ADSR |
| `3` | Reset EGC |
| `4` | Track length change |
| `5` | Skip sound+note transpose |
| `6` | Sync mark |
| `7` | LED on/off |
| `8` | Song speed |
| `9` | Fx on/off |
| `A` | Fx change |
| `B` | Change synthesis parameter 1 |
| `C` | Change synthesis parameter 2 |
| `D` | Change synthesis parameter 3 |
| `E` | EGC off |
| `F` | New volume |

---

## Instrument Information (28 = 0x1C bytes each)

```
Offset  Size  Description
------  ----  -----------
0x00    1     Waveform or sample number
0x01    1     Synthesis mode enabled (1 = use synth, 0 = use sample/waveform)
0x02    2     Length of waveform/sample before loop (in words)
0x04    2     Repeat length (in words)
0x06    1     Volume (0–64)
0x07    1     Portamento speed
0x08    1     ADSR enabled (1 = on)
0x09    1     ADSR table number
0x0A    2     ADSR table length
0x0C    2     Arpeggio start offset
0x0E    1     Arpeggio length
0x0F    1     Arpeggio repeat length
0x10    1     Synthesis mode:
               0  = Fx off (static waveform/sample)
               1  = Rotate1  (start, end, speed)
               2  = Rotate2  (start, end, slow-motion)
               3  = Alien    (source wave, end, slow-motion)
               4  = Negator  (start, end, slow-motion)
               5  = PolyNeg  (start, end, slow-motion)
               6  = Shaker1  (source wave, mix-in, slow-motion)
               7  = Shaker2  (source wave, mix-in, slow-motion)
               8  = Amf/LFO  (source wave, end, slow-motion)
               9  = Laser    (laser speed, laser time, slow-motion)
               A  = Oct.Fx1  (mix-in, unused, slow-motion)
               B  = Oct.Fx2  (mix-in, unused, slow-motion)
               C  = Aliasing (mix-in, aliasing level, slow-motion)
               D  = EG-Fx-1 (mix-in, envelope generator, slow-motion)
               E  = EG-Fx-2 (mix-in, envelope generator, slow-motion)
               F  = Changer  (destination wave, mix-in, slow-motion)
               10 = FM drum  (modulation level, modulation factor, depth)
0x11    1     Synthesis arg 1
0x12    1     Synthesis arg 2
0x13    1     Synthesis arg 3
0x14    1     Vibrato delay
0x15    1     Vibrato speed
0x16    1     Vibrato level
0x17    1     EGC offset
0x18    1     EGC mode (0 = off, 1 = one-shot, 2 = repeat)
0x19    1     EGC table number
0x1A    2     EGC table length
```

---

## Sample Information (28 = 0x1C bytes each)

```
Offset  Size   Description
------  -----  -----------
0x00    1      Unknown
0x01    27     Sample name (null-padded ASCII)
```

Sample names are stored here. Use these as instrument names in the UI.

---

## Waveforms

`NOW` waveforms, each 256 bytes. Stored as 8-bit signed PCM at a fixed rate.
The player uses these as synthesis source waveforms — they are not directly played
as instruments but are the raw material for synthesis modes.

---

## EG Tables (Envelope Generator)

`EG` tables × 128 bytes each. Each table specifies a time-domain envelope
curve applied to waveform synthesis operations.

## ADSR Tables

`ADSR` tables × 256 bytes each. Each byte is a volume level (0–63); played
sequentially at the current row tick rate to modulate instrument amplitude.

---

## Reference Implementations

- **Synthesis replayer:** `docs/formats/Replayers/Synthesis/SynthesisPlayer.s`
- **InStereo 1.0 replayer:** `docs/formats/Replayers/InStereo/XReplayer.asm`
- **NostalgicPlayer Synthesis spec:** `docs/formats/Synthesis.txt`
- **NostalgicPlayer InStereo 1.0 spec:** `docs/formats/InStereo! 1.0.txt`

---

## Implementation Notes

**Current status:** DETECTION_ONLY — Both parsers create `'Synth' as const` placeholder
instruments that fall through to UADE.

**Path to NATIVE_SAMPLER:**
Samples are standard PCM blobs sequentially after the instrument info. Their sizes
come from the `NOS*4` total-sample-length block. Extract PCM and create `createSamplerInstrument()`
for sample-type instruments. Waveform-type instruments require the synthesis engine.

**Path to NATIVE_WASM:**
Full native synthesis requires implementing:
1. ADSR/EGC envelope tables
2. 16 synthesis modes for waveform manipulation (most are wave-rotation/morphing algorithms)
3. The arpeggio, vibrato, and portamento modulators

The replayer assembly files are the definitive reference for the synthesis algorithms.
