# onEscapee

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/OnEscapeeParser.ts`
**Extensions:** (Amiga game — onEscapee by Imagine Software, 1997)
**UADE name:** onEscapee
**Reference files:** (rare — single Amiga game)
**Replayer reference:** `Reference Code/uade-3.05/players/onEscapee`

---

## Overview

The onEscapee format is the music system used in the Amiga game *onEscapee* (Imagine
Software, 1997). Files are identified by 24 consecutive occurrences of one of two
specific 32-bit fill patterns: `0xAA55FF00` or `0x55AA00FF`.

Detection is ported from `onEscapee.asm EP_Check3`.

---

## File Layout

The file begins with a 96-byte (24 × 4 byte) synchronization block of fill patterns,
followed by song and sample data.

```
Offset  Size    Description
------  ----    -----------
0x00    24 × 4  Fill pattern block: 24 consecutive u32BE values
                Pattern A: all 0xAA55FF00
                Pattern B: all 0x55AA00FF (starting at offset 4)
0x60+   ...     Song data and embedded samples
```

---

## Detection Algorithm

```
Pattern A (standard songs):
  For i in 0..23: u32BE(i × 4) == 0xAA55FF00   → all 24 match

Pattern B (mzeperx song variant):
  For i in 0..23: u32BE(4 + i × 4) == 0x55AA00FF → all 24 match
  (note: starts at offset 4, not 0)

Either pattern succeeds → file is recognized as onEscapee format.
```

The fill pattern serves as a synchronization marker between the player executable
and the song data binary. The two patterns (`0xAA55FF00` / `0x55AA00FF`) are
bitwise complements that alternate between nibbles — a simple anti-pattern checksum
used by the game's music system.

From the assembly (`onEscapee.asm`):
```
moveq  #23, D1           ; 24 iterations (0..23)
NextLong:
  cmp.l  #$AA55FF00,(A0)+ ; check and advance A0
  dbf    D1, NextLong
; if all match → success
; otherwise try 0x55AA00FF starting from A0+4 position
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/OnEscapeeParser.ts`
- **UADE player:** `Reference Code/uade-3.05/players/onEscapee`
- **Replayer asm:** `Reference Code/uade-3.05/amigasrc/players/onEscapee.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser detects the fill-pattern synchronization block and routes playback to UADE.
Placeholder instruments are emitted. The file is not prefix-routed — detection is
entirely by the fill-pattern content check.
