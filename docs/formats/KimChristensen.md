# Kim Christensen

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/KimChristensenParser.ts`
**Extensions:** (Amiga game music, 1989 era)
**UADE name:** KimChristensen
**Reference files:** (Amiga game music — rare)
**Replayer reference:** `Reference Code/uade-3.05/players/KimChristensen`

---

## Overview

Kim Christensen is a 1989 Amiga music format identified by scanning the first portion
of the file for a specific sequence of 68k opcodes. The detection performs six
sequential opcode scans, each bounded by a shared counter of 800 words.

Detection is ported from `Kim Christensen_v1.asm DTP_Check2`.

---

## File Layout

Kim Christensen files are compiled 68k executables. No fixed binary structure is
documented — detection is entirely via opcode scanning.

---

## Detection Algorithm

```
Minimum file size: 1800 bytes

Shared counter D2 = 800 (after step 2, shared across steps 3-7)

Step 1: Scan first 100 words (200 bytes) for opcode 0x207C
        (MOVEA.L #immediate, A0)
Step 2: From found position, scan up to 800 more words for opcode 0x0680
        (ADDI.L #n, D0); D2 starts counting here
Step 3: From found position, scan for opcode 0xE341
        (ASL.W #1, D1)
Step 4: From found position, scan for opcode 0x227C
        (MOVEA.L #immediate, A1)
Step 5: From found position, scan for opcode 0x0680 again
        (ADDI.L #n, D0 — second occurrence)
Step 6: From found position, scan for opcode 0x0087
        (last two bytes of ADDI.L $xx, D7 or similar)

All scans after step 2 share the same D2 counter (800 words maximum total).
All steps must succeed within the shared counter limit.
```

The sequence of opcodes forms the Kim Christensen player's initialization and period
calculation routine, providing a reliable fingerprint without requiring a magic number.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/KimChristensenParser.ts`
- **Wanted Team asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/KimChristensen/src/Kim Christensen_v1.asm`
- **UADE player:** `Reference Code/uade-3.05/players/KimChristensen`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser scans for the Kim Christensen opcode sequence and routes playback to UADE.
Placeholder instruments are emitted. The format has no standard file prefix or extension
in eagleplayer.conf — identification is entirely content-based.
