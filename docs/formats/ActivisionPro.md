# Activision Pro

**Status:** DETECTION_ONLY — parser identifies format, synthesis falls back to UADE
**Parser:** `src/lib/import/formats/ActivisionProParser.ts`
**Extensions:** UADE eagleplayer (no common standalone extension)
**Reference files:** `Reference Music/Activision Pro/`

---

## Overview

Activision Pro is an Amiga music format used in various Activision game titles.
It is a compiled-binary format (not a tracker): the file contains the 68k replay
routine and song data baked together, similar to Ben Daglish or Richard Joseph formats.

The format uses a position list of variable-length commands, per-track note data
encoded as variable-length rows with an instrument-reference byte and note byte, and
a 3-byte-per-point envelope table for volume automation.

Very limited public documentation exists for this format. The NostalgicPlayer spec
(`docs/formats/Activision Pro.txt`) covers only the position list, track, and envelope
structures — not the file header or instrument table layout.

---

## Position List

The position list consists of 2-byte commands:

```
Command byte → Data byte
```

| Command | Data | Description |
|---------|------|-------------|
| `0x00–0x3F` | Track number | Play track N, `xx` times |
| `0x40` | — | Loop: restart from beginning of list (no data byte) |
| `0x4x` | — | Set loop position to current position with count x |
| `0xFD` | Fade speed | Start master volume fade with speed |
| `0xFE` | New start position | End of list and stop playing |
| `0xFF` | New start position | End of list (restart at given position) |

---

## Track Format

Each track position is at least 2 bytes, encoded as:

```
xx (yy) zz
```

- `xx`:
  - `0xFF` = End of track
  - If bit 7 set: read `yy` next
  - If bit 6 set: reset/stop envelope
  - Else: speed counter / hold counter (ticks to hold current note)
- `yy` (only present if bit 7 of `xx` is set):
  - If positive: set as new instrument number
  - If negative: portamento command
- `zz`: Note value

---

## Envelope Format

Volume envelopes are defined as a sequence of 3-byte points:

```
Byte 0: xx — Ticks to wait.
             If xx >= 0xC0: set new envelope position to (xx & 0x3F)
Byte 1: yy — Volume increment value (signed; can be negative for decay)
Byte 2: zz — Number of times to process this point before advancing
```

---

## File Header (not publicly documented)

The file header for Activision Pro is not documented in the available NostalgicPlayer
spec. The format is a compiled 68k binary, meaning the replayer routine and song data
are interleaved without a clean separating header. Reverse-engineering the Activision
Pro eagleplayer binary from UADE (`Reference Code/uade-3.05/players/ActivisionPro`)
would be required to determine:
- File magic / detection heuristic
- Number and location of instruments
- PCM sample locations and sizes
- Position list start offset
- Track data start offset

---

## Reference Implementations

- **NostalgicPlayer spec:** `docs/formats/Activision Pro.txt`
- **UADE eagleplayer:** `Reference Code/uade-3.05/players/ActivisionPro`

---

## Implementation Notes

**Current status:** DETECTION_ONLY — `ActivisionProParser.ts` creates `'Synth' as const`
placeholder instruments. UADE handles synthesis.

**For instrument name extraction:** Without knowing the file header layout, it's unclear
whether instrument names are stored. The compiled-binary nature of this format means
PCM sample pointers are Amiga absolute addresses, requiring load-address recovery from
the init code (as with Ben Daglish).

**Priority:** Low — relatively few reference files exist, and the lack of public format
documentation makes this format difficult to reverse-engineer without deep 68k assembly
analysis of the UADE eagleplayer binary.
