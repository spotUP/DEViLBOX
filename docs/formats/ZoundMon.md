# ZoundMonitor

**Status:** DETECTION_ONLY — parser identifies format, synthesis falls back to UADE
**Parser:** `src/lib/import/formats/ZoundMonitorParser.ts`
**Extensions:** `sng.*` (prefix convention, e.g. `sng.mysong`), UADE eagleplayer
**Replayer source:** `docs/formats/Replayers/ZoundMon/Zound.c`, `docs/formats/Replayers/ZoundMon/Player.c`
**Reference files:** `Reference Music/ZoundMon/`

---

## Overview

ZoundMonitor is a compiled-binary Amiga music format. Files contain 68k player code
and song data baked together (similar to Jeroen Tel, Ben Daglish, etc.). Files are
named with the `sng.` prefix. The format supports up to 15 samples (instruments).

The detection algorithm is structural — it uses the first two bytes of the file to
compute a target offset and then verifies a signature tag at that position.

---

## Detection Algorithm (from ZoundMonitor_v1.asm DTP_Check2)

```asm
D1 = (byte[0] + 1) * 16   ; lsl #4
D0 = (byte[1] + 1) * 128  ; lsl #7
D1 = D1 + D0 + 869        ; total offset
if D1 >= fileSize → not ZoundMon
A0 += D1                   ; advance to check position

; At offset D1, verify one of two patterns:
;   Pattern 1: byte[D1]=='d', byte[D1+1]=='f', byte[D1+3]==':'  → "df?:"
;   Pattern 2: byte[D1+1]=='a', byte[D1+2]=='m', byte[D1+3]=='p' → "?amp"
```

---

## Format Notes

ZoundMonitor is a compiled-binary format. The song data layout and sample table structure
are embedded in the 68k player code rather than at fixed offsets. The C-source replayer
(`docs/formats/Replayers/ZoundMon/Zound.c`, `Player.c`) is the primary reference for
understanding the internal data layout.

**Maximum samples:** 15 (MI_MaxSamples from the replayer `InfoBuffer` table).

---

## Reference Implementations

- **C source replayer:** `docs/formats/Replayers/ZoundMon/Zound.c`
- **Player:** `docs/formats/Replayers/ZoundMon/Player.c`
- **UADE 68k replayer:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/ZoundMonitor/src/ZoundMonitor_v1.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY — `ZoundMonitorParser.ts` creates 15 `'Synth' as const`
placeholder instruments. UADE handles synthesis.

The C-source replayer in the Replayers directory is unusual — most Amiga formats only have
assembly replayers. The C source provides a cleaner reference for understanding the binary
layout and should be used as the primary reference for any future native implementation.

**Note on naming:** The parser is called `ZoundMonitorParser.ts` (not `ZoundMonParser.ts`)
since the tool is officially named "ZoundMonitor" while "ZoundMon" is a community shorthand.
