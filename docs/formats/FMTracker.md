# FMTracker (Tim Follin Player)

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/FMTrackerParser.ts`
**Extensions:** `tf.*` (prefix-based)
**UADE name:** TimFollin
**Reference files:** `Reference Music/Follin Player II/Tim Follin/` (13 files)
**Replayer reference:** `Reference Code/uade-3.05/players/TimFollin`

---

## Overview

FMTracker is the proprietary Amiga music player written by Tim Follin, used in
games published by Ocean/US Gold including *Ghouls 'n' Ghosts* and *Sly Spy*. Files
are compiled Amiga executables — a single-file binary with the player code and
embedded song data baked together.

The name "FMTracker" is a parser-internal identifier. The format is identified in UADE
as `TimFollin` and in reference collections as `Follin Player II`.

---

## File Layout

Tim Follin player files are compiled 68k executables. There is no fixed tracker
structure — the player code and song data are tightly bound together as a single
relocatable binary.

```
Offset  Size  Description
------  ----  -----------
0x00    1     0x60 — BRA short opcode
0x01    1     0x1A — displacement 26 (branch target = 0x1C)
0x02    ...   Player initialization code
0x1C    1     0x10 — fingerprint byte at branch target
0x1D    1     0x10 — fingerprint byte at branch target + 1
0x1E+   ...   Embedded song data + player code continuation
```

---

## Detection Algorithm

```
1. bytes.length >= 30 (0x1E)
2. bytes[0x00] == 0x60    → BRA short opcode
3. bytes[0x01] == 0x1A    → displacement = 26 → target PC = 0x1C
4. bytes[0x1C] == 0x10    → fingerprint at branch target
5. bytes[0x1D] == 0x10    → fingerprint byte + 1
```

All four conditions must pass. This is an empirically derived signature from
analysis of all reference `.tf` files. There are no alternative magic bytes.

The BRA displacement of 0x1A (26 bytes) is a constant in all Tim Follin player
variants observed, and the 0x10 0x10 pair at the branch target is a consistent
fingerprint of the player initialization sequence.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/FMTrackerParser.ts`
- **UADE player:** `Reference Code/uade-3.05/players/TimFollin`
- **Reference files:** `Reference Music/Follin Player II/Tim Follin/`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser identifies Tim Follin player files and routes them to UADE for playback.
The `tf.*` filename prefix is the primary routing key. UADE's `TimFollin` eagleplayer
handles the full 68k binary playback loop.

4 channels are created as placeholder instruments. No instrument names are extracted
(the binary format does not contain ASCII sample names).
