# TCB Tracker

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/TCBTrackerParser.ts`
**Extensions:** `tcb.*` (prefix)
**UADE name:** TCB_Tracker
**Reference files:** (identified in Amiga demo collections)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/TCB Tracker/src/TCB Tracker_V2.asm`

---

## Overview

TCB Tracker (also known as "AN COOL!") was an Amiga music editor/player. Modules are
identified by the ASCII header `"AN COOL!"` (format 1) or `"AN COOL."` (format 2)
at the start of the file. Files are distributed with the `tcb.` UADE prefix.

Two format variants:
- **Format 1:** `"AN COOL!"` — pattern base offset `0x110`
- **Format 2:** `"AN COOL."` — pattern base offset `0x132`

Maximum 16 samples (`MI_MaxSamples = 16`).

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0x00    4     "AN C" (0x414E2043)
0x04    4     "OOL!" (0x4F4F4C21, format 1) or "OOL." (0x4F4F4C2E, format 2)
0x08    4     nbPatt — number of patterns (u32BE, ≤ 127)
0x0C    1     Speed (≤ 15)
0x0D    1     Must be 0
...
0x8E    1     Sequence length (signed, must be 1–127)
```

Pattern data at `pattBase + nbPatt × 0x200 + 0xD4` (end marker area).

---

## Detection

Based on `TCB Tracker_V2.asm DTP_Check2`:

```
1. file size >= 0x132
2. u32BE(0) == 0x414E2043          ("AN C")
3. u32BE(4) ∈ {0x4F4F4C21,         ("OOL!" → fmt1, pattBase=0x110)
               0x4F4F4C2E}         ("OOL." → fmt2, pattBase=0x132)
4. nbPatt = u32BE(8) <= 127
5. byte[12] <= 15                  (speed)
6. byte[13] == 0
7. byte[0x8E] in 1..127            (sequence length, signed)
8. A3 = pattBase + nbPatt×0x200 + 0xD4; file must extend past A3
9. u32BE(A3 - 8) == 0xFFFFFFFF    (end marker)
10. u32BE(A3 - 4) == 0x00000000   (trailing zero)
11. u32BE(A3 - 0x90) == 0x000000D4 (first sample at +$D4)
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/TCBTrackerParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/TCB Tracker/src/TCB Tracker_V2.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The 11-step detection mirrors the `DTP_Check2` algorithm exactly. The parser creates
a metadata-only `TrackerSong`; UADE handles audio playback via its TCB Tracker eagleplayer.
