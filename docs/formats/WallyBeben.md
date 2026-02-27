# Wally Beben

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/WallyBebenParser.ts`
**Extensions:** `WB.*`, UADE eagleplayer
**UADE name:** WallyBeben
**Reference files:** `Reference Music/Wally Beben/` (24 files)
**Replayer reference:**
  `Reference Code/uade-3.05/amigasrc/players/wanted_team/WallyBeben/src/Wally Beben_v1.asm`

---

## Overview

Wally Beben composed music for Amiga games and demos in the late 1980s–early 1990s.
Modules are compiled 68k executables containing player code, music data, and samples
in a single self-contained file.

---

## Detection

Based on `Wally Beben_v1.asm` Check2 routine — four sequential checks at fixed offsets:

```
u16BE(buf, 0) == 0x6000    → BRA opcode (branch to player init)
u16BE(buf, 2) is non-zero  AND  bit 15 clear (positive)  AND  bit 0 clear (even)
u32BE(buf, 4) == 0x48E7FFFE  → MOVEM.L (all registers pushed to stack)
u16BE(buf, 8) == 0x6100    → BSR opcode (branch to subroutine)
```

The `0x48E7FFFE` (MOVEM.L D0-D7/A0-A6 to stack) is a standard 68k routine prologue.
The `0x6000` BRA + `0x6100` BSR pair forms the typical two-level dispatch structure
used in compiled Amiga players.

---

## Format Structure

Wally Beben modules are **single-file** compiled 68k executables. Player code,
pattern/sequence tables, and PCM sample data are all embedded in the binary.

Sample data is raw signed 8-bit PCM (Amiga Paula format). No separate sample
companion file is required.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/WallyBebenParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/WallyBeben/`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser creates placeholder instrument slots. UADE handles all 68k execution
and audio synthesis. The four-byte fingerprint at offsets 0, 2, 4, 8 provides
reliable detection with very low false-positive probability.
