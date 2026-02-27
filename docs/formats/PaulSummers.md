# Paul Summers

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/PaulSummersParser.ts`
**Extensions:** `SNK.*` (prefix-based)
**UADE name:** PaulSummers
**Reference files:** `Reference Music/Paul Summers/` (4 files)
**Replayer reference:** `Reference Code/uade-3.05/players/PaulSummers`

---

## Overview

Paul Summers is an Amiga music format identified by a scanning search for a specific
68k interrupt vector setup sequence (`MOVE #$2700,SR` + `RTE`). The file is a compiled
Amiga executable with the player and song data combined.

Detection is ported from `Paul Summers_v2.asm Check2` in the Wanted Team eagleplayer.

---

## File Layout

Paul Summers files are compiled 68k executables. No fixed tracker structure is
documented — the player code and song data are baked into a single relocatable binary.

---

## Detection Algorithm

```
1. buf.length > 3000
2. Scan starting at offset 650, up to 20 positions, stepping by 2 bytes:
   At each position pos:
     a. u32BE(pos) == 0x46FC2700   → MOVE #$2700,SR opcode (interrupt disable)
     b. u16BE(pos+4) == 0x4E73     → RTE opcode (return from exception)
     c. u32BE(pos+4) != 0          → non-zero longword at pos+4 (tst.l check)
   If checks b and c pass → detection succeeds
   If only a passes but b or c fail → continue scanning
3. If no match found in 20 positions → not recognized
```

The `MOVE #$2700,SR` (opcode `0x46FC2700`) followed immediately by `RTE` (`0x4E73`)
forms the Paul Summers interrupt handler signature — a common Amiga pattern for
disabling interrupts at an entry point before playing music.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/PaulSummersParser.ts`
- **Wanted Team asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/PaulSummers/src/Paul Summers_v2.asm`
- **UADE player:** `Reference Code/uade-3.05/players/PaulSummers`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser scans for the interrupt-handler signature and routes playback to UADE.
The `SNK.*` prefix is the primary routing key. Placeholder instruments are emitted.
