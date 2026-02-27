# Sean Conran

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/SeanConranParser.ts`
**Extensions:** `SCR.*` (prefix-based)
**UADE name:** SeanConran
**Reference files:** `Reference Music/Sean Connolly/` (3 files)
**Replayer reference:** `Reference Code/uade-3.05/players/SeanConran`

---

## Overview

Sean Conran is a compiled Amiga 68k music format. Files are identified by one of
three specific longword patterns at offsets 0, 4, 8, followed by a forward scan
for a specific termination sequence.

Detection is ported from `Sean Conran_v3.asm DTP_Check2`.

---

## Detection Algorithm

Three detection paths. All share a final scan step after establishing a scan start offset.

### Path A

```
u32BE(0) == 0x0FFF0FE2
u32BE(4) == 0x0FC40FA7
u32BE(8) == 0x0F8B0F6E
→ scanStart = 8 + 284 = 292
```

### Path B

```
u32BE(0) == 0x10000FE2
u32BE(4) == 0x0FC40FA7
u32BE(8) == 0x0F8B0F6E
→ scanStart = 8 + 284 = 292
```

### Path C (standard)

```
u32BE(0) == 0x0F1C0F0E
u32BE(4) == 0x0F000EF2
u32BE(8) == 0x0EE40ED6
→ scanStart = 168 + 284 = 452
```

### Common Scan (all paths)

From `scanStart`, scan for a termination/verification sequence (specific opcodes
that mark the end of the Sean Conran player initialization code block).

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/SeanConranParser.ts`
- **Wanted Team asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/SeanConran/src/Sean Conran_v3.asm`
- **UADE player:** `Reference Code/uade-3.05/players/SeanConran`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser identifies Sean Conran files via the three-longword patterns and routes
playback to UADE. The `SCR.*` prefix is the primary routing key. Placeholder
instruments are emitted.

The three longword patterns at offsets 0/4/8 are Amiga 68k channel period table
entries — frequency values for the four Amiga Paula channels at their initial
playback rates. Different player revisions use slightly different period base values,
explaining the three distinct path variants.
