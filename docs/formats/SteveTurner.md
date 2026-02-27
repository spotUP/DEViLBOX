# Steve Turner

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/SteveTurnerParser.ts`
**Extensions:** `JPO.*` / `.jpo` / `.jpold` (prefix-based)
**UADE name:** SteveTurner
**Reference files:** (Amiga game music — rare)
**Replayer reference:** `Reference Code/uade-3.05/players/SteveTurner`

---

## Overview

Steve Turner is a compiled Amiga music format identified by a sequence of seven
specific 68k instruction patterns at fixed offsets in the file. The four `MOVE.L`
instructions at offsets 0, 8, 16, and 24 initialize the four Amiga audio channels.

Detection is ported from `Steve Turner_v4.asm DTP_Check2`.

---

## File Layout

Steve Turner files are compiled 68k executables. The detection sequence covers the
player's channel initialization routine.

```
Offset  Size  Description
------  ----  -----------
0x00    2     0x2B7C — MOVE.L #imm, d(An)  (channel 0 init)
0x08    2     0x2B7C — MOVE.L #imm, d(An)  (channel 1 init)
0x10    2     0x2B7C — MOVE.L #imm, d(An)  (channel 2 init)
0x18    2     0x2B7C — MOVE.L #imm, d(An)  (channel 3 init)
0x20    4     0x303C00FF — MOVE.W #$00FF, D0 (voice count mask)
0x24    4     0x32004EB9 — MOVE.W D0,D1 + JSR abs.l (combined)
0x2C    2     0x4E75 — RTS (end of setup routine)
```

**Minimum file size:** 46 bytes (0x2E).

---

## Detection Algorithm

```
1. buf.length >= 46
2. u16BE(0x00) == 0x2B7C    → channel 0 MOVE.L init
3. u16BE(0x08) == 0x2B7C    → channel 1 MOVE.L init
4. u16BE(0x10) == 0x2B7C    → channel 2 MOVE.L init
5. u16BE(0x18) == 0x2B7C    → channel 3 MOVE.L init
6. u32BE(0x20) == 0x303C00FF → MOVE.W #$00FF,D0
7. u32BE(0x24) == 0x32004EB9 → MOVE.W D0,D1 + JSR
8. u16BE(0x2C) == 0x4E75    → RTS
```

The four `MOVE.L` opcodes at 8-byte intervals identify the four Amiga Paula channel
initialization sequence. The `0x303C00FF` + `0x32004EB9` pair is the voice-count
setup used consistently across all Steve Turner player variants observed.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/SteveTurnerParser.ts`
- **Wanted Team asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/SteveTurner/src/Steve Turner_v4.asm`
- **UADE player:** `Reference Code/uade-3.05/players/SteveTurner`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser identifies Steve Turner files and routes playback to UADE. The `JPO.*`
prefix is the primary routing key. 4 channel placeholder instruments are emitted.
