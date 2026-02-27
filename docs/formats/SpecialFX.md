# Special FX

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/SpecialFXParser.ts`
**Extensions:** `JD.*` (prefix-based)
**UADE name:** SpecialFX
**Reference files:** `Reference Music/Special FX/` (Amiga game/demo music)
**Replayer reference:** `Reference Code/uade-3.05/players/SpecialFX`

---

## Overview

Special FX is a composer-specific Amiga music format. It is **not related** to
`SoundFX.md` (which uses the `sfx.*` / `SFX.*` prefix and a completely different
binary layout). Special FX files use the `JD.*` filename prefix and are identified
by a distinctive chain of 68k BRA (branch) opcodes at the start of the file.

---

## File Layout

Special FX files are compiled 68k replayer binaries. The binary layout is not a
fixed tracker structure — the player code is baked in alongside the music data.

```
Offset  Size  Description
------  ----  -----------
0x00    2     BRA opcode (0x6000) + non-zero positive even displacement
0x04    2     BRA opcode (0x6000) + non-zero positive even displacement
0x08    2     BRA opcode (0x6000) + non-zero positive even displacement
0x0C    2     BRA opcode (0x6000) + non-zero positive even displacement
0x10+   ...   Replayer code + music data (format-specific)
```

---

## Detection Algorithm

```
For each pair at offset ∈ {0, 4, 8, 12}:
  bytes[offset]   == 0x60          → BRA opcode high byte
  bytes[offset+1] == 0x00          → BRA.W form (16-bit displacement)
  u16BE at offset+2: non-zero, positive (> 0), even (& 1 == 0)
                                   → valid branch displacement
All 4 pairs must pass.
```

The four consecutive `BRA.W` instructions with valid displacements form a unique
fingerprint that does not collide with other Amiga format signatures.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/SpecialFXParser.ts`
- **UADE player:** `Reference Code/uade-3.05/players/SpecialFX`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser identifies Special FX files via the 4× BRA opcode chain and the `JD.*`
prefix, then routes playback to UADE. The eagleplayer binary handles full synthesis.

**Do not confuse with SoundFX** (`sfx.*` / `SFX.*` prefix, `SoundFXParser.ts`).
These are unrelated formats with different binary layouts and different UADE players.
