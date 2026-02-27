# Desire

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/DesireParser.ts`
**Extensions:** `DSR.*` (prefix-based)
**UADE name:** Desire
**Reference files:** (Amiga demo/game music — Dentons)
**Replayer reference:** `Reference Code/uade-3.05/players/Desire`

---

## Overview

Desire is an Amiga music format by Dentons, adapted for EaglePlayer by Wanted Team.
Files are compiled 68k executables (single-file: player + song data + samples).

Detection uses a multi-stage approach:
1. Fixed-pattern longs at four specific offsets
2. A scan forward for opcode `0x49FA` (LEA with PC-relative addressing)
3. Validation of a specific 12-byte byte sequence after the LEA
4. A self-referential relative offset check confirming the LEA branches back to the file base

Detection is ported from `Desire_v1.asm DTP_Check2`.

---

## Detection Algorithm

```
1. buf.length > 2500

2. Check 4 longs of 0x00010101, at offsets 8, 24, 40, 56:
   u32BE(8)  == 0x00010101
   u32BE(24) == 0x00010101
   u32BE(40) == 0x00010101
   u32BE(56) == 0x00010101

3. Scan forward from offset 72 for up to 400 bytes looking for word 0x49FA:
   (LEA d16(PC), An — PC-relative address load)

4. When 0x49FA found at position foundPos:
   a. Skip 2 bytes (A0 post-increments past the opcode)
   b. u32BE(foundPos + 2) == 0x45F900DF   → first half of hardware address sequence
   c. u32BE(foundPos + 6) == 0xF000357C   → second half
   d. u32BE(foundPos + 10) == 0x00FF009E  → third part
   e. u16BE(foundPos + 14) == 0x41FA      → another LEA opcode
   f. signed_i16(u16BE(foundPos + 16)) + (foundPos + 18) == 0
      (the 16-bit signed displacement from foundPos+16, added to foundPos+18,
       must equal 0 — the LEA branches back to file base address A2=0)
```

The self-referential offset check in step 4f is a unique property of the Desire
player: it contains a `LEA rel(PC)` that computes the file's load address relative
to itself, used for address fixups at runtime.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/DesireParser.ts`
- **Wanted Team asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/Desire/src/Desire_v1.asm`
- **UADE player:** `Reference Code/uade-3.05/players/Desire`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser validates the Desire signature and routes playback to UADE. The `DSR.*`
prefix is the primary routing key. Placeholder instruments are emitted.
