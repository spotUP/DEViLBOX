# SID (PSID / RSID)

**Status:** FULLY_NATIVE — 6502 CPU + SID chip emulation via FurnaceSID
**Parser:** `src/lib/import/formats/SIDParser.ts`
**Extensions:** `.sid`, `.psid`, `.rsid`
**UADE name:** N/A (native engine)
**Reference files:** `Reference Music/SID/`
**Synth types:** `FurnaceSID6581`, `FurnaceSID8580`

---

## Overview

SID is the native music format of the Commodore 64, driven by the MOS 6581/8580 SID
(Sound Interface Device) chip. DEViLBOX supports both PSID (PlaySID) and RSID (RealSID)
variants. The parser emulates a 6502 CPU and intercepts SID register writes to extract
note and parameter data, producing static `TrackerSong` patterns using the FurnaceSID
chip engine.

SID files may contain multiple subsongs, each a separate music tune sharing the same
player code.

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0x00    4     Magic: "PSID" (0x50534944) or "RSID" (0x52534944)
0x04    2     Version: 1 or 2 (u16BE)
0x06    2     dataOffset: byte offset to C64 binary data (typically 0x76 or 0x7C)
0x08    2     loadAddress: C64 load address (0 = read first 2 bytes of data)
0x0A    2     initAddress: C64 address of init routine
0x0C    2     playAddress: C64 address of play routine
0x0E    2     songs: total number of subsongs
0x10    2     startSong: default starting subsong (1-based)
0x12    4     speed: bit flags (bit n set = song n+1 uses CIA timer, else VBlank)
0x16    32    name: PETSCII song title (null-terminated)
0x36    32    author: PETSCII author string
0x56    32    released: PETSCII copyright/release string
```

**Version 2 additional fields (dataOffset ≥ 0x7C):**
```
0x76    2     flags: chip model and player type bits
              bit 4 = MOS6581 supported
              bit 5 = MOS8580 supported
              bits 6–7 = clock (0=unknown,1=PAL,2=NTSC,3=MUS)
0x78    1     startPage: RSID real C64 memory page for player
0x79    1     pageLength: pages of memory used
0x7A    2     secondSIDAddress: second SID address (stereo, PSID v2NG extension)
```

**C64 binary data** immediately follows the header at `dataOffset`. If `loadAddress == 0`,
the first two bytes of the data area are the little-endian load address.

---

## Chip Model Detection

```
flags = u16BE(0x76)   (version 2 only)

if (flags >> 4) & 3 == 2 → SID8580 (MOS 8580)
else                     → SID6581 (MOS 6581, default)
```

The MOS 6581 has a different filter characteristic and voice 3 ring modulation behaviour
from the 8580. DEViLBOX uses `FurnaceSID6581` or `FurnaceSID8580` accordingly.

---

## Detection Algorithm

```
1. buf.length >= 124
2. magic == "PSID" or "RSID"
3. version == 1 or 2
4. dataOffset in [0x76, 0x7C] (standard header sizes)
```

---

## Synthesis Model

The parser runs a 6502 emulation loop:

```
1. Call init(songIndex) to set up the SID registers for a given subsong
2. For ~900 frames (≈ 15 seconds at 50Hz PAL):
   a. Call play() at 50Hz rate
   b. Capture SID register snapshot (0xD400–0xD418, 25 bytes)
3. Decode register snapshots → note events per voice
```

**SID register map (per voice, 3 voices):**
```
$D400 + voice*7 + 0  lo/hi frequency: freq = freqReg * (clock / 16777216) Hz
$D400 + voice*7 + 2  pulse width lo/hi
$D400 + voice*7 + 4  control: gate(1), sync(2), ring(4), test(8), waveform(F0)
$D400 + voice*7 + 5  attack(hi)/decay(lo) nibbles
$D400 + voice*7 + 6  sustain(hi)/release(lo) nibbles
$D408               filter cutoff (bits 0–2 lo + $D409 hi)
$D40A               filter resonance + voice routing
$D40B               volume + filter mode
$D418               misc flags
```

**Frequency to note:**
```
clock = 985248 (PAL) or 1022730 (NTSC)
freq_hz = freqReg * clock / 16777216
note = round(12 * log2(freq_hz / 440) + 69)
```

**Waveform bits (control register bits 7–4):**
- `0001` → triangle
- `0010` → sawtooth
- `0100` → pulse
- `1000` → noise

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/SIDParser.ts`
- **Furnace SID platform:** `Reference Code/furnace-master/src/engine/platform/c64.cpp`
- **SID spec:** HVSC documentation, `petscii.com`

---

## Implementation Notes

**Synth types:** `FurnaceSID6581` (default), `FurnaceSID8580` (for 8580 chip flags).

**Subsong handling:** Each subsong calls init with a different index. The parser generates
one pattern per subsong, stored as separate `TrackerSong` tracks or as a subsong map.

**RSID vs PSID:** RSID requires real C64 environment for banking and SID selection.
PSID is simpler (uses PSID-specific memory banking). Both are emulated via Cpu6502.

**Clock:** PAL (985248 Hz) is the default. NTSC support via the `clock` bits in flags.

