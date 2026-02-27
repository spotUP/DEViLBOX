# Fashion Tracker

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/FashionTrackerParser.ts`
**Extensions:** `EX.*` (prefix)
**UADE name:** FashionTracker
**Reference files:** (identified in Amiga collections)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/FashionTracker-v1.0/FashionTracker.asm`

---

## Overview

Fashion Tracker is an Amiga music format by Richard van der Veen (1988), adapted by
Wanted Team. Files are compiled 68k executables prefixed `EX.*`. Detection identifies
five specific 68k instruction sequences at fixed byte offsets.

---

## Detection

Based on `FashionTracker.asm DTP_Check2`:

```
u32BE(0x00) == 0x13FC0040   MOVE.B #$40,abs.l  (volume init)
u32BE(0x08) == 0x4E710439   NOP; TRAP #9
u16BE(0x0C) == 0x0001       word constant == 1
u32BE(0x12) == 0x66F44E75   BNE -12; RTS
u32BE(0x16) == 0x48E7FFFE   MOVEM.L d0-d7/a0-a6,-(sp)
```

**Minimum file size:** 26 bytes.

The `MOVEM.L d0-d7/a0-a6,-(sp)` instruction (`0x48E7FFFE`) is the standard Amiga
68k register save opcode used in interrupt handlers, combined with the volume init
and RTS pattern providing a reliable fingerprint.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/FashionTrackerParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/FashionTracker-v1.0/FashionTracker.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The 5-check opcode pattern mirrors `DTP_Check2` exactly. UADE synthesizes audio.
