# Music Assembler

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/MusicAssemblerParser.ts`
**Extensions:** `.asm` (EaglePlayer naming convention)
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/Music Assembler/`

---

## Overview

Music Assembler is a 4-channel Amiga tracker format with no magic bytes. Detection
requires scanning embedded M68k player bytecode for specific instruction sequences.
The format stores sub-songs, instruments with synth parameters, and a track pool with
per-entry transpose support — similar in spirit to SoundMon but with assembler-level
player code.

Reference: NostalgicPlayer `MusicAssemblerWorker.cs`

---

## Detection Algorithm

```
No magic bytes. Detection scans M68k 68000 bytecode:
1. bytes[0] == 0x60 AND bytes[1] == 0x00 (BRA.W opcode)
2. bytes[4] == 0x60 AND bytes[5] == 0x00
3. bytes[8] == 0x60 AND bytes[9] == 0x00
4. bytes[12] == 0x48 AND bytes[13] == 0xE7 (MOVEM.L opcode)
5. ExtractInfoFromInitFunction succeeds (finds CMPI.W and two LEA.L instructions)
6. ExtractInfoFromPlayFunction succeeds (finds LEA.L, two ADDA.L, BSR.B)
```

---

## Offset Extraction (Init Function)

```
startOfInit = s16(bytes[2..3]) + 2
Scan from startOfInit:
  CMPI.W (0xB0 0x7C) → subSongCount = u16BE(next 2 bytes)
  LEA.L pc-rel (0x49 0xFA) → subSongSpeedOffset = s16(disp) + pos + 2
  LEA.L pc-rel (0x49 0xFB) → subSongPositionListOffset = s8(byte3) + pos + 2
```

---

## Offset Extraction (Play Function)

```
startOfPlay = 0x0C
  LEA.L (0x43 0xFA) → moduleStartOffset = s16(disp) + pos + 2
  ADDA.L (0xD3 0xFA) → instrumentInfoOffsetOffset = s16(disp) + pos + 2
  ADDA.L (0xD5 0xFA) → sampleInfoOffsetOffset = s16(disp) + pos + 6
  BSR.B (0x61) → follow branch, then scan for ADDA.L (0xDB 0xFA)
    → tracksOffsetOffset = s16(disp) + pos + 2
```

---

## Channel Map

Non-linear Amiga LRRL assignment: `[0, 3, 1, 2]`

---

## Position List Format

Each position entry is 2 bytes, terminated by `TrackNumber == 0xFF` or `0xFE`:

```
byte 0: TrackNumber — index into track pool
byte 1: encoded transpose + repeat:
  val = (byte1 << 4) & 0xFFFF
  transpose     = (val >> 8) & 0xFF  (signed i8)
  repeatRaw     = (val & 0xFF) >> 1
  repeatCounter = s8(repeatRaw)
```

---

## Track Encoding (variable-length events, terminated by 0xFF)

```
if (b0 & 0x80):
  if (b0 & 0x40): read b1, b2. If (b2 & 0x80): read b3.  → 3 or 4 bytes
  else: just b0, done                                       → 1 byte
else:
  read b1. If (b1 & 0x80): read b2.                        → 2 or 3 bytes
```

---

## Sample Info (24 bytes per sample)

```
Offset  Size  Description
------  ----  -----------
0       4     offset (i32BE, relative to module start)
4       2     length (u16BE, in words; × 2 = bytes)
6       2     loopLength (u16BE, in words; 0 = no loop)
8       16    name (ASCII, null-padded)
```

**Synthesis detection:** `length <= 128 words` → synth instrument (no PCM).
**Loop:** `loopStart = (length - loopLength) × 2`; `loopLen = loopLength × 2 bytes`.

---

## Instrument Info (16 bytes per instrument)

```
SampleNumber(1), Attack(1), Decay_Sustain(1), VibratoDelay(1),
Release(1), VibratoSpeed(1), VibratoLevel(1), Arpeggio(1),
FxArp_SpdLp(1), Hold(1), Key_WaveRate(1), WaveLevel_Speed(1),
pad(4)
```

---

## Period Table

48 entries (4 octaves × 12 notes). Index 12 = period 856 = XM C-3 (note 37).

```
XM note = 37 + (maNoteIndex - 12)
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/MusicAssemblerParser.ts`
- **NostalgicPlayer reference:** `Source/Agents/Players/MusicAssembler/MusicAssemblerWorker.cs`
