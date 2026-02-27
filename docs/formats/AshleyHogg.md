# Ashley Hogg

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/AshleyHoggParser.ts`
**Extensions:** (Amiga game music)
**UADE name:** AshleyHogg
**Reference files:** `Reference Music/Ashley Hogg/` (8 files)
**Replayer reference:** `Reference Code/uade-3.05/players/AshleyHogg`

---

## Overview

Ashley Hogg is a compiled Amiga music format with two sub-variants (New and Old),
both starting with BRA chains but differing in what follows. The New format
requires a `MOVEM.L` push, a `BSR`, and a `LEA $DFF000` (Amiga hardware base).
The Old format is identified by a specific opcode pair at offset 16.

Detection is ported from `Ashley Hogg_v1.asm DTP_Check2`.

---

## Detection Algorithm

### Common Prefix (both variants)

All files begin with 4 BRA pairs at offsets 0, 4, 8, 12:
```
For i in 0..3:
  u16BE(i×4)   == 0x6000      → BRA opcode
  u16BE(i×4+2): non-zero, bit 15 clear, bit 0 clear  → valid positive even displacement
```

### New Format (Format = 0xFF)

After the 4 BRA pairs, 2 more BRA pairs are checked at offsets 16, 20:
```
u16BE(16) == 0x6000; u16BE(18): valid positive even displacement
u16BE(20) == 0x6000; dist6 = u16BE(22): valid positive even displacement
```

Then jump forward by dist6 from offset 22: `preambleOff = 22 + dist6`
```
u32BE(preambleOff)    == 0x48E7FFFE   → MOVEM.L push (save all registers)
u16BE(preambleOff+4)  == 0x6100       → BSR (branch to subroutine)
u16BE(preambleOff+6)  == 0x4DF9       → LEA abs.l (load Amiga hardware base)
u32BE(preambleOff+8)  == 0x00DFF000   → $DFF000 (Amiga custom chip base address)
```

### Old Format (Format = 0)

After the 4 BRA pairs, at offset 16 (the 5th pair's opcode slot):
```
u32BE(16) == 0x303C0000   → MOVE.W #0, D0
u32BE(20) == 0x662233C0   → BNE + AND.L D0,D0 (specific combined instruction sequence)
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/AshleyHoggParser.ts`
- **Wanted Team asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/AshleyHogg/src/Ashley Hogg_v1.asm`
- **UADE player:** `Reference Code/uade-3.05/players/AshleyHogg`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser identifies Ashley Hogg files via the BRA chain + variant-specific checks
and routes playback to UADE. Placeholder instruments are emitted.

The `LEA $DFF000,An` instruction at `preambleOff+6` is a standard Amiga player
initialization pattern — loading the base address of the custom chip registers for
Paula DMA setup. Its presence at a computed offset provides strong disambiguation.
