# VGM (Video Game Music)

**Status:** FULLY_NATIVE — multi-chip register-stream parsing via Furnace chip engines
**Parser:** `src/lib/import/formats/VGMParser.ts`
**Extensions:** `.vgm`, `.vgz` (gzip-compressed VGM)
**UADE name:** N/A (native engine)
**Reference files:** `Reference Music/VGM/`
**Synth types:** `FurnaceSN76489`, `FurnaceYM2612`, `FurnaceYM2151`, `FurnaceOPN`, `FurnaceOPLL`, and others

---

## Overview

VGM (Video Game Music) is a multi-platform register-capture format recording exact chip
register writes for arcade and console soundchips from the 1980s–90s. DEViLBOX supports
VGM versions 1.00–1.71 and VGZ (gzip-compressed VGM). The parser decodes the chip
clock fields to detect which chips are active, then replays the register stream through
the appropriate Furnace chip engine.

Supported chips include SN76489 (Sega SMS/Genesis PSG), YM2612 (Sega Genesis FM),
YM2151 (arcade), YM2413/OPLL, YM2203/OPN, YM2608/OPNA, YM2610/OPNB, YM3812/OPL2,
YMF262/OPL3, and AY-3-8910.

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0x00    4     Magic: "Vgm " (0x56676D20)
0x04    4     EOFoffset: offset to end of file from 0x04 (u32LE)
0x08    4     Version: BCD, e.g. 0x00000161 = v1.61
0x0C    4     SN76489clock: clock in Hz (0 = chip not present)
0x10    4     YM2413clock: clock in Hz
0x14    4     GD3offset: offset to GD3 tag block from 0x14 (u32LE, 0 = no tag)
0x18    4     TotalSamples: total number of 44100Hz samples
0x1C    4     LoopOffset: offset to loop point from 0x1C (u32LE, 0 = no loop)
0x20    4     LoopSamples: number of samples in loop
0x24    4     Rate: preferred playback rate in Hz (0 = use chip defaults)
              [VGM 1.01+]
0x28    2     SN76489feedback: LFSR feedback pattern
0x2A    1     SN76489shiftRegisterWidth: LFSR width
0x2B    1     SN76489flags
              [VGM 1.10+]
0x2C    4     YM2612clock
0x30    4     YM2151clock
              [VGM 1.50+]
0x34    4     VGMdataOffset: offset to data stream from 0x34 (u32LE, default 0x0C)
              [VGM 1.51+]
0x38    4     SegaPCMclock
0x3C    4     SPCMinterface
              [VGM 1.51+ continued]
0x40    4     RF5C68clock
0x44    4     YM2203clock
0x48    4     YM2608clock
0x4C    4     YM2610clock (bit 31 = YM2610B variant)
0x50    4     YM3812clock
0x54    4     YM3526clock
0x58    4     Y8950clock
0x5C    4     YMF262clock
0x60    4     YMF278Bclock
0x64    4     YMF271clock
0x68    4     YMZ280Bclock
0x6C    4     RF5C164clock
0x70    4     PWMclock
0x74    4     AY8910clock
0x75    1     AY8910ChipType: 0=AY-3-8910, 1=AY-3-8912, 2=AY-3-8913, 3=AY8930...
0x76    3     AY8910flags
              [VGM 1.60+]
0x78    1     volumeModifier
0x79    1     reserved
0x7A    1     loopBase
0x7B    1     loopModifier
              [VGM 1.61+]
0x7C    4     GameBoyDMGclock
0x80    4     NESAPUclock
0x84    4     MultiPCMclock
0x88    4     uPD7759clock
0x8C    4     OKIM6258clock
0x90    4     OKIM6295clock
0x94    4     K051649clock
0x98    4     K054539clock
0x9C    4     HuC6280clock
0xA0    4     C140clock
0xA4    4     K053260clock
0xA8    4     Pokeyclock
0xAC    4     QSoundclock
```

**Data stream** begins at `0x34 + VGMdataOffset` (or 0x40 for versions < 1.50).

---

## Detection Algorithm

```
1. buf[0..3] == "Vgm "     (magic)
   — OR —
   buf is valid gzip with inner file having "Vgm " magic (VGZ)
2. version = u32LE(8)
3. require version >= 0x00000100 (v1.00 minimum)
```

---

## GD3 Tag Block

If `GD3offset != 0`, a GD3 (Game Data 3) tag block starts at `0x14 + GD3offset`:

```
0x00    4     "Gd3 " magic
0x04    4     Version: 0x00000100
0x08    4     Length of following data in bytes
0x0C    ...   Null-terminated UTF-16LE strings:
              trackNameEN, trackNameJP, gameNameEN, gameNameJP,
              systemNameEN, systemNameJP, authorEN, authorJP,
              releaseDate, converterName, notes
```

All strings are UTF-16LE (2 bytes per character), each terminated by `\x00\x00`.

---

## VGM Data Stream Commands

The data stream is a sequence of commands:

```
0x4F dd          Game Gear PSG stereo (SN76489)
0x50 dd          SN76489 write (port 0)
0x51 aa dd       YM2413 write
0x52 aa dd       YM2612 port 0 write
0x53 aa dd       YM2612 port 1 write
0x54 aa dd       YM2151 write
0x55 aa dd       YM2203 write
0x56 aa dd       YM2608 port 0 write
0x57 aa dd       YM2608 port 1 write
0x58 aa dd       YM2610 port 0 write
0x59 aa dd       YM2610 port 1 write
0x5A aa dd       YM3812 write
0x5B aa dd       YM3526 write
0x5C aa dd       Y8950 write
0x5E aa dd       YMF262 port 0 write
0x5F aa dd       YMF262 port 1 write
0x61 nn nn       Wait N samples (u16LE)
0x62             Wait 735 samples (1/60 second)
0x63             Wait 882 samples (1/50 second)
0x66             End of data stream
0x67 ...         Data block (sample data)
0x7n             Wait (n+1) samples (0x70–0x7F)
0x8n             YM2612 DAC write + wait n samples (0x80–0x8F)
0xA0 aa dd       AY8910 write
0xB4 aa dd       NES APU write
0xB8 aa dd       POKEY write
```

---

## Chip Detection

DEViLBOX maps detected clocks to Furnace chip types:

| Clock Field    | Chip           | Furnace Type         |
|----------------|----------------|----------------------|
| SN76489clock   | SN76489        | `FurnaceSN76489`     |
| YM2612clock    | YM2612         | `FurnaceYM2612`      |
| YM2151clock    | YM2151         | `FurnaceYM2151`      |
| YM2413clock    | YM2413/OPLL    | `FurnaceOPLL`        |
| YM2203clock    | YM2203/OPN     | `FurnaceOPN`         |
| YM2608clock    | YM2608/OPNA    | `FurnaceOPNA`        |
| YM2610clock    | YM2610/OPNB    | `FurnaceOPNB`        |
| YM3812clock    | YM3812/OPL2    | `FurnaceOPL2`        |
| YMF262clock    | YMF262/OPL3    | `FurnaceOPL3`        |
| AY8910clock    | AY-3-8910      | `FurnaceAY`          |

---

## Frequency to Note

**SN76489 (PSG):**
```
clock = SN76489clock (e.g. 3579545 Hz for Sega)
freq_hz = clock / (2 * counter * 16)
note = round(12 * log2(freq_hz / 440) + 69)
```

**YM2612 (F-number):**
```
freq_hz = fnum * clock / (144 * 2^(21 - block))
note = block * 12 + KC_to_semitone(fnum)
```

**YM2151 (KC register):**
```
KC bits 7–4 = octave, bits 3–0 = note (0=C#,1=D,...,F=C)
semitone = octave * 12 + KC_nibble_to_semitone[KC & 0xF]
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/VGMParser.ts`
- **Furnace YM2612:** `Reference Code/furnace-master/src/engine/platform/genesis.cpp`
- **Furnace SN76489:** `Reference Code/furnace-master/src/engine/platform/sms.cpp`
- **Furnace YM2151:** `Reference Code/furnace-master/src/engine/platform/ym2151.cpp`
- **VGM spec:** `vgmrips.net/wiki/VGM_Specification`

---

## Implementation Notes

**VGZ support:** VGZ files are gzip-compressed VGM. DEViLBOX inflates them before
parsing using the browser's DecompressionStream API or a bundled inflate library.

**Multi-chip files:** Many arcade VGMs use simultaneous FM + PSG. DEViLBOX creates
one instrument per detected chip and maps channels accordingly.

**Version gating:** Clock fields beyond 0x2C are only valid for VGM ≥ 1.10. Fields
at 0x38+ require ≥ 1.51. DEViLBOX checks `version >= 0x00000151` before reading
extended chip clocks.

