# Leggless Music Editor (LME)

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/LMEParser.ts`
**Extensions:** `LME.*` / `.lme` (prefix or extension based)
**UADE name:** LME
**Reference files:** `Reference Music/Leggless Music Editor/` (4 files)
**Replayer reference:** `Reference Code/uade-3.05/players/LME`

---

## Overview

Leggless Music Editor (LME) is an Amiga tracker format created by Leggless. Files
are identified by the three-byte ASCII magic `"LME"` at offset 0 followed by a
format version byte, plus a zero longword at offset 36.

Detection is ported from the `LMEv3.asm Check2` routine in the Wanted Team eagleplayer.

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0x00    3     Magic: "LME" (0x4C, 0x4D, 0x45)
0x03    1     Format version (typically 1, 2, or 3)
...     ...   Header data
0x24    4     Must be 0x00000000 (zero longword at offset 36 = 9×4)
...     ...   Pattern/sample/instrument data
```

**Minimum file size:** 40 bytes (to reach offset 36 + 4 bytes).

---

## Detection Algorithm

```
1. bytes[0] == 0x4C ('L')
   bytes[1] == 0x4D ('M')
   bytes[2] == 0x45 ('E')
2. bytes[3] = version byte (any value; not checked)
3. u32BE(36) == 0
```

The 68k detection in `LMEv3.asm`:
```
move.l  (A0), D1           ; load first 4 bytes into D1
clr.b   D1                 ; clear lowest byte (version byte at index 3)
cmp.l   #'LME'<<8, D1      ; compare against 0x4C4D4500
bne.b   fail
tst.l   9*4(A0)            ; test long at offset 36 (must be zero)
bne.b   fail
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/LMEParser.ts`
- **Wanted Team asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/LME/src/LMEv3.asm`
- **UADE player:** `Reference Code/uade-3.05/players/LME`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser identifies LME files by the `LME` magic and zero sentinel at offset 36,
then routes playback to UADE. The `LME.*` prefix is the primary routing key.
4 channels with placeholder instruments are created.
