# NSF (NES Sound Format)

**Status:** FULLY_NATIVE — 6502 CPU + NES APU emulation via FurnaceNES + expansion chips
**Parser:** `src/lib/import/formats/NSFParser.ts`
**Extensions:** `.nsf`, `.nsfe`
**UADE name:** N/A (native engine)
**Reference files:** `Reference Music/NSF/`
**Synth types:** `FurnaceNES`, `FurnaceOPLL` (VRC7), `FurnaceFDS`

---

## Overview

NSF (NES Sound Format) encapsulates NES music replayer code and song data for the
Nintendo Entertainment System's Ricoh 2A03/2A07 audio hardware. DEViLBOX supports both
the classic NSF container and the extended NSFE (NES Sound Format Extended) variant.

The parser emulates a 6502 CPU and intercepts APU register writes to extract note events
and parameters, converting them to `TrackerSong` patterns using the Furnace NES chip engine.
Multiple expansion audio chips (VRC7, FDS, N163, etc.) are detected from the expansion byte.

---

## File Layout (NSF)

```
Offset  Size  Description
------  ----  -----------
0x00    5     Magic: "NESM\x1A" (0x4E45534D1A)
0x05    1     Version: 1
0x06    1     totalSongs: total number of tunes
0x07    1     startSong: first song to play (1-based)
0x08    2     loadAddress: C64-style load address (LE u16)
0x0A    2     initAddress: init routine address (LE u16)
0x0C    2     playAddress: play routine address (LE u16)
0x0E    32    songName: ASCII null-terminated
0x2E    32    artistName: ASCII null-terminated
0x4E    32    copyright: ASCII null-terminated
0x6E    2     playSpeedNTSC: timing value in µs (LE u16, typically 16666)
0x70    8     bankswitch: starting values for bankswitching (0 = not bankswitched)
0x78    2     playSpeedPAL: timing value in µs (LE u16)
0x7A    1     PALNTSCBits: 0=NTSC, 1=PAL, 2=dual
0x7B    1     expansionBits: expansion chip flags (see below)
0x7C    4     reserved
0x80    ...   NSF data (loaded at loadAddress)
```

**Expansion chip bits:**
```
bit 0 → VRC6 (Konami VRC6: 2 pulse + 1 sawtooth)
bit 1 → VRC7 (Konami VRC7: 6-op FM, OPL-compatible)
bit 2 → FDS  (Famicom Disk System: wavetable)
bit 3 → MMC5 (extra pulse channels + PCM)
bit 4 → N163 (Namco 163: up to 8 wavetable channels)
bit 5 → S5B  (Sunsoft 5B: AY-3-8910 clone, 3 voices)
```

---

## File Layout (NSFE)

NSFE uses an IFF-like chunk structure:

```
0x00    4     Magic: "NSFE" (0x4E534645)
0x04    ...   Chunks:
              "INFO" (mandatory, 8+ bytes):
                loadAddr u16LE, initAddr u16LE, playAddr u16LE
                PALNTSCbits u8, expansionBits u8, totalSongs u8, startSong u8
              "DATA" (mandatory): NSF code/data
              "RATE" (optional): play speed override
              "BANK" (optional): bankswitching init values
              "tlbl" (optional): track label strings
              "time" (optional): track duration (ms, s32LE per track)
              "fade" (optional): fadeout duration (ms, s32LE per track)
              "auth" (optional): author/copyright/ripper strings (null-sep)
              "NEND" (mandatory): end marker
```

---

## Detection Algorithm

```
NSF:  buf[0..4] == "NESM\x1A"  (5 magic bytes)
NSFE: buf[0..3] == "NSFE"      (4 magic bytes)
```

---

## Synthesis Model

The parser runs 6502 emulation, capturing APU register writes:

```
1. Call init(songIndex)
2. For ~900 frames at 60Hz (NTSC) or 50Hz (PAL):
   a. Call play() routine
   b. Capture APU register snapshot
3. Decode APU registers → note events per channel
```

**NES APU register map:**
```
$4000–$4003  Pulse 1 (duty, volume, sweep, timer, length)
$4004–$4007  Pulse 2
$4008–$400B  Triangle (linear counter, timer, length)
$400C–$400F  Noise (volume, mode, period, length)
$4010–$4013  DMC (rate, direct, address, length)
$4015         Status (channel enable bits)
$4017         Frame counter (mode, IRQ inhibit)
```

**Frequency (pulse/triangle):**
```
freq_hz = CPU_CLOCK / (16 * (timer + 1))
CPU_CLOCK = 1789773 (NTSC) or 1662607 (PAL)
```

**Expansion chip routing:**
```
VRC7 (bit 1) → FurnaceOPLL (chipType=13), 6 FM channels, OPL patch set
FDS  (bit 2) → FurnaceFDS  (chipType=15), wavetable oscillator
Other chips  → FurnaceNES baseline engine
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/NSFParser.ts`
- **Furnace NES platform:** `Reference Code/furnace-master/src/engine/platform/nes.cpp`
- **Furnace OPLL (VRC7):** `Reference Code/furnace-master/src/engine/platform/opll.cpp`
- **Furnace FDS:** `Reference Code/furnace-master/src/engine/platform/fds.cpp`
- **NSF spec:** `nesdev.com/NSF.txt`

---

## Implementation Notes

**Chip type IDs (Furnace internal):**
- `FurnaceNES` = chipType 34 (base NES APU)
- `FurnaceOPLL` = chipType 13 (used for VRC7 / YM2413 family)
- `FurnaceFDS` = chipType 15 (Famicom Disk System wavetable)

**Bankswitching:** Many NSF files use bankswitching (8KB banks mapped at $8000–$FFFF).
The bankswitch init values at offset 0x70 seed the initial bank configuration. The
emulation handles $5FF8–$5FFF bankswitching writes.

**Dual mode:** PALNTSCBits == 2 means the file supports both rates. DEViLBOX defaults
to NTSC timing in dual mode.

