# Mark Cooksey

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/MarkCookseyParser.ts`
**Extensions:** `mc.*`, `mco.*`, `mcr.*`, UADE eagleplayer
**UADE names:** Mark_Cooksey, Mark_Cooksey_Old
**Reference files:** `Reference Music/Mark Cooksey/` (9 files), `Reference Music/Mark Cooksey Old/` (7 files)
**Replayer references:**
  `Reference Code/uade-3.05/amigasrc/players/wanted_team/MarkCooksey/`

---

## Overview

Mark Cooksey composed music for many classic Amiga games including Commando,
Ghosts 'n Goblins, Forgotten Worlds, and Ghouls 'n Ghosts. The player was written
by Cooksey and Richard Frankish. Modules are compiled 68k executables combining
player code, music data, and samples in a single file.

Three sub-variants exist, grouped into two UADE player entries:
- **Old format** (`mco.*` prefix) → UADE: Mark_Cooksey_Old
- **New/Medium format** (`mc.*`, `mcr.*` prefix) → UADE: Mark_Cooksey

---

## Format Variants

### Old Format (`mco.*`)

```
Detection:
  - Starts with 0xD040D040 (ASR/LSR instructions)
  - Followed by 0x4EFB (JMP table)
  - Four 0x6000 BRA instructions at offsets 8, 12, 16, 20
  - Then either:
      0x43FA at offset 40  (short old format), or
      a fifth BRA at offset 24 followed by 0x43FA at offset 150
```

The Old format uses 68k JMP tables for player dispatch, a common pattern in
early Amiga game players.

### New / Medium Format (`mc.*`, `mcr.*`)

```
Detection:
  - Starts with 0x601A (BRA #26)
  - u32BE displacement D1 follows
  - Five zero longwords at offsets 8–27
  - Four 0x6000 BRA instructions starting after the zero block
  - 0x48E780F0 (MOVEM.L) found at the destination of the first BRA
```

---

## Format Structure

All Mark Cooksey variants are **single-file** compiled 68k executables. Player code,
sequence/pattern tables, and PCM sample data are all embedded in the binary.

Sample data is raw signed 8-bit PCM (Amiga Paula format). The player controls
Paula DMA channels directly via register writes embedded in the 68k player routine.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/MarkCookseyParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/MarkCooksey/`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser identifies the format variant and extracts basic metadata. UADE handles
all audio synthesis. The three sub-variants are checked in priority order:
1. Old format (strict 68k instruction pattern)
2. New/Medium format (BRA chain + MOVEM check)

Samples are raw PCM embedded in the file; no separate sample companion file is needed.
