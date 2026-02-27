# Rob Hubbard ST

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/RobHubbardSTParser.ts`
**Extensions:** `RHO.*` (prefix-based)
**UADE name:** RobHubbardST
**Reference files:** `Reference Music/Rob Hubbard ST/` (3 files)
**Replayer reference:** `Reference Code/uade-3.05/players/RobHubbardST`

---

## Overview

Rob Hubbard ST is the Atari ST port of Rob Hubbard's Amiga/C64 music replayer.
Like the Amiga `RobHubbard` format, the file is a compiled executable with the
player code and song data baked together as a single 68k binary.

**Not related to `RobHubbard.md`** (Amiga format, FULLY_NATIVE). The ST variant
uses different 68000 initialization sequences and is routed to UADE. Detected
by three specific 68k machine code longwords in the player init routine.

---

## File Layout

Rob Hubbard ST files are compiled 68k executables. No fixed tracker structure
exists — the player and song data are a single relocatable binary unit.

```
Offset  Size  Description
------  ----  -----------
0x00    4     0x00407F40 — machine code fingerprint (MOVEQ / ADDA.L sequence)
0x04    4     0x00C081C0 — machine code fingerprint
...     ...   Player init code
0x38    4     0x41FAFFEE — LEA + displacement (identifies ST player entry point)
0x3C+   ...   Song data and player continuation
```

---

## Detection Algorithm

```
1. buf.length >= 60
2. u32BE(0)  == 0x00407F40   → machine code constant at offset 0
3. u32BE(4)  == 0x00C081C0   → machine code constant at offset 4
4. u32BE(56) == 0x41FAFFEE   → LEA + displacement at offset 56
```

All three longword checks must pass. These constants are 68000 machine code patterns
specific to the Rob Hubbard ST player init routine, ported directly from:

```
"Rob Hubbard ST_v2.asm" DTP_Check2 (Wanted Team eagleplayer):
  cmp.l  #$00407F40,(A0)+   → A0 now at offset 4
  cmp.l  #$00C081C0,(A0)    → check at offset 4
  cmp.l  #$41FAFFEE,52(A0)  → check at offset 4+52 = 56
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/RobHubbardSTParser.ts`
- **UADE player:** `Reference Code/uade-3.05/players/RobHubbardST`
- **Wanted Team asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/RobHubbardST/`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser identifies Rob Hubbard ST files and routes them to UADE for synthesis.
The `RHO.*` filename prefix is the primary routing key. A single placeholder
instrument is created; no instrument names are extracted from the binary.

**Contrast with Amiga Rob Hubbard:** `RobHubbard.md` documents the Amiga format
(FULLY_NATIVE with `RobHubbardSynth`). The ST variant has different init sequences
and does not share the 5×BRA + LEA fingerprint used by the Amiga format.
