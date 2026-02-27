# Sonix Music Driver

**Status:** DETECTION_ONLY — sub-format detected, synthesis via UADE
**Parser:** `src/lib/import/formats/SonixMusicDriverParser.ts`
**Extensions:** `smus.*`, `tiny.*`, `snx.*` (prefix-named files)
**UADE name:** `SonixMusicDriver`
**Reference files:** `Reference Music/Sonix Music Driver/`

---

## Overview

Sonix Music Driver is a 4-channel Amiga music format by Mark Riley (© 1987–91), with
EaglePlayer adapter by Wanted Team. Three sub-formats exist, each identified by a
different file prefix and first-byte pattern. Synthesis is handled by UADE.

Reference: `Reference Code/uade-3.05/amigasrc/players/wanted_team/Sonix Music Driver_v1.asm`

---

## Detection Algorithm

Three sub-formats detected by first-byte analysis:

### SMUS sub-format (`smus.*`)
```
buf[0..3] == "FORM"
```
Uses IFF SMUS structure with chunks: SNX1, INS1, TRAK, NAME.
Minimum file size: 28 bytes.

### TINY sub-format (`tiny.*`)
```
(buf[0] & 0x0F) != 0   (low nibble of first byte is non-zero)
buf[0..3] != "FORM"
```
Detected when the first word's low nibble (bits 0-3) is non-zero.
Minimum file size: 21 bytes.

### SNX sub-format (`snx.*`)
```
(buf[0] & 0x0F) == 0   (low nibble of first byte is zero)
buf[0..3] != "FORM"
```
Detected via structural validation (ported from DTP_Check2):
1. Read 4 u32BE lengths from offset 0; each must be > 0, positive, and even
2. Cumulative sum (starting from 20) must be < fileSize
3. Skip 4 bytes; check 4 sequence bytes: each must have bit7 set or equal 0xFFFF, and if byte ≤ 0x84 it's valid
4. Final byte after jumps must be non-zero
Minimum file size: 21 bytes.

---

## Format Characteristics

- **Channels:** 4 (Amiga Paula)
- **Synthesis:** UADE 68k emulation (no custom WASM synth)
- **Instrument count:** Placeholder only (no metadata extraction)

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/SonixMusicDriverParser.ts`
- **UADE player source:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/Sonix Music Driver_v1.asm`
