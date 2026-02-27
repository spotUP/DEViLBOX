# Speedy System / Speedy A1 System

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/SpeedySystemParser.ts`
**Extensions:** `ss.*` / `sas.*` (prefix-based)
**UADE name:** SpeedySystem / SpeedyA1System
**Reference files:** `Reference Music/Speedy System/` + `Reference Music/Speedy A1 System/` (3 files total)
**Replayer reference:** `Reference Code/uade-3.05/players/SpeedySystem`, `Reference Code/uade-3.05/players/SpeedyA1System`

---

## Overview

Two distinct Amiga music formats by Michael Winterberg share a single parser:

- **Speedy System** — identified by the 14-byte ASCII magic `"SPEEDY-SYSTEM\0"` at offset 0
- **Speedy A1 System** — identified by a heuristic byte check (no ASCII magic)

Both are compiled Amiga executables routed to UADE for synthesis.

---

## File Layout

### Speedy System

```
Offset  Size  Description
------  ----  -----------
0x00    14    Magic: "SPEEDY-SYSTEM\0" (0x53 0x50 0x45 0x45 0x44 0x59 0x2D 0x53
                                        0x59 0x53 0x54 0x45 0x4D 0x00)
0x0E+   ...   Player code and song data
```

### Speedy A1 System

```
Offset  Size  Description
------  ----  -----------
0x00    3     Must be 0x00 0x00 0x00
0x03    1     Channel/track count (1-31; must be non-zero and ≤ 31)
0x0E    2     Must be 0x02 0x00
```

---

## Detection Algorithm

### Speedy System

```
1. buf.length >= 14
2. buf[0..13] == "SPEEDY-SYSTEM\0"
```

### Speedy A1 System (heuristic)

```
1. buf.length >= 16
2. buf[0] == 0x00, buf[1] == 0x00, buf[2] == 0x00
3. buf[3] >= 1 and buf[3] <= 31     → channel/track count in valid range
4. buf[14] == 0x02, buf[15] == 0x00
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/SpeedySystemParser.ts`
- **UADE players:** `Reference Code/uade-3.05/players/SpeedySystem` and `SpeedyA1System`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser identifies both Speedy System variants and routes playback to UADE.
The `ss.*` and `sas.*` prefixes are the primary routing keys for each variant.
Placeholder instruments are emitted.

The Speedy A1 System heuristic relies on byte patterns empirically derived from
analysis of reference files, since the format has no ASCII magic identifier.
