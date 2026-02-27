# DefleMask (.dmf)

**Status:** FULLY_NATIVE — routes to Furnace chip synthesizer
**Parser:** `src/lib/import/formats/DefleMaskParser.ts`
**Extensions:** `.dmf`, `.dmp`, `.dmw`
**UADE name:** N/A (native Furnace synth)
**Reference files:** `Reference Music/DefleMask/`

---

## Overview

DefleMask is a cross-platform chiptune tracker by Leonardo Demartino that targets
multiple retro hardware chips. Files are identified by the ".DeFleMask." magic string
and a version byte (versions 3–27 supported). The system byte determines the target chip
(Genesis, Game Boy, NES, C64, etc.) and channel count. DEViLBOX maps DefleMask
instruments to the corresponding Furnace chip synthesizer.

---

## File Layout

### File Header

```
Offset  Size  Description
------  ----  -----------
0       15    Magic: ".DeFleMask." + version (u8)
              The magic is 16 bytes total: ASCII ".DeFleMask." (11 chars) + 4 padding/version
15      1     system (u8) — target chip ID
16      ...   Module data (system-dependent)
```

After the header:
```
songName (length-prefixed string)
authorName (length-prefixed string)
timeBase (u8, 1–255)
ticksPerRow[2] (u8, speed1 / speed2)
framesPerTick (u8, rate: 60=NTSC, 50=PAL)
patternRows (u8, rows per pattern)
matrixRows (u8, number of patterns in song)
arpeggioTickSpeed (u8)

Instrument count (u8)
instruments[N]: name + type-specific data

Wavetable count (u8)
wavetables[N]: 32-entry u32LE arrays

Pattern matrix: matrixRows × numChannels × u8 (pattern index per channel/row)

Patterns: per pattern per channel, patternRows × DMFNote
```

---

## Detection Algorithm

```
1. buf.byteLength >= 16
2. buf[0..10] == ".DeFleMask."
3. version byte in [3, 27]
```

---

## System IDs → Chip Mapping

| System | Name | Furnace ChipType | Channels |
|--------|------|-----------------|----------|
| 0x01   | YMU759 | 19 | 17 (FM) |
| 0x02   | Genesis | 0 (YM2612) | 6 FM + 4 PSG |
| 0x03   | SMS | 3 (SN76489) | 4 PSG |
| 0x04   | Game Boy | 5 (GB DMG) | 4 PSG |
| 0x05   | PC Engine | 6 (HuC6280) | 6 PSG |
| 0x06   | NES | 4 (2A03) | 5 PSG |
| 0x07   | C64 | 10 (SID) | 3 PSG |
| 0x08   | Arcade (YM2151+ADPCM) | 1 (YM2151) | 13 FM |
| 0x09   | Neo Geo | 14 (YM2610) | 4 FM + 7 PSG |
| 0x0A   | Genesis Extended | 0 | 9 FM + 4 PSG |
| 0x0B   | SMS + OPLL | 11 | 9 FM + 4 PSG |
| 0x0C   | NES + VRC7 | 4 | 6 FM + 5 PSG |
| 0x0D   | NES + FDS | 16 | 6 PSG |

---

## DMF Note Structure (per cell)

```
note (u8):      0 = empty; 1–11 = semitone (C–B); 100 = note off
octave (u8):    octave 0–7
volume (i8):   -1 = no change; 0–15 = volume
instrument (i8): -1 = no change; 0-based instrument index
effects[N]:     array of {code(u8), value(u8)} pairs
```

---

## Instrument Types

**FM Instruments** (Genesis, Arcade, Neo Geo):
- 4 operators, each with: AR, DR, SR, RR, SL, TL, RS, MUL, DT, DT2, AM, SSG
- Algorithm (ALG) and feedback (FB) fields
- Maps to `FurnaceConfig` with `FurnaceOperatorConfig[4]`

**Standard Instruments** (PSG chips):
- Volume macro, arpeggio macro, pitch macro, wave macro
- Game Boy: duty/wave, envelope
- NES: duty, sweep

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/DefleMaskParser.ts`
- **DefleMask format documentation:** DefleMask wiki / source code
