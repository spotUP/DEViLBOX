# Paul Tonge

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/PaulTongeParser.ts`
**Extensions:** (Amiga game music)
**UADE name:** PaulTonge
**Reference files:** (Amiga game music — rare)
**Replayer reference:** `Reference Code/uade-3.05/players/PaulTonge`

---

## Overview

Paul Tonge is an Amiga music format identified by a specific header word value
(`0x000C`) followed by three offset words that are each dereferenced to check for
specific sentinel byte values (`0x80` or `0x8F`).

Detection is ported from `Paul Tonge_v1.asm DTP_Check2`.

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0x00    2     0x000C (12) — header word marking the format
0x02    2     offset1: pointer into file (may be 0=skip, else must be even, non-negative)
0x04    2     offset2: pointer into file (may be 0=skip, else must be even, non-negative)
0x06    2     offset3: pointer into file (may be 0=skip, else must be even, non-negative)
...     ...   Data referenced by the offset words
```

---

## Detection Algorithm

```
1. u16BE(0) == 0x000C               → header word

For each of offsets at positions 2, 4, 6 (3 iterations):
  D1 = u16BE(position)
  If D1 == 0: skip (zero is allowed, treated as no entry)
  Else:
    D1 must be positive (bit 15 clear) and even (bit 0 clear)
    word at (base + D1) must be > 0    → indirect check: non-zero at target
    byte at (base + D1 - 1) must be 0x80 or 0x8F  → sentinel byte check
```

The sentinel bytes `0x80` and `0x8F` at `(base + D1 - 1)` identify the beginning
marker of data blocks in the Paul Tonge music engine.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/PaulTongeParser.ts`
- **UADE player:** `Reference Code/uade-3.05/players/PaulTonge`
- **Wanted Team asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/PaulTonge/src/Paul Tonge_v1.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser validates the header word and three offset/sentinel checks, then routes
playback to UADE. Placeholder instruments are emitted.
