# Paul Shields

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/PaulShieldsParser.ts`
**Extensions:** `ps.*` (prefix-based)
**UADE name:** PaulShields
**Reference files:** `Reference Music/Paul Shields/` (14 files)
**Replayer reference:** `Reference Code/uade-3.05/players/PaulShields`

---

## Overview

Paul Shields is an Amiga music format by Paul Shields / Paul Hunter (c) 1988–91.
Files use the `ps.*` filename prefix. The format has three structural sub-variants
detected by pointer table locations and reference constants at those pointers.

Detection is ported from the `EP_Check5` / `DTP_Check2` routines in the Wanted Team
eagleplayer assembly. All three sub-variants share a common zero-prefix requirement
(bytes 0–9 all zero) before variant-specific checks.

---

## File Layout

Paul Shields files consist of a header with pointer tables pointing to sequence
and sample data. The three sub-variants differ in which offsets contain the pointer
tables and in the dereference constants used to validate those pointers.

---

## Sub-variant Detection

### Common Prefix

All three variants require bytes 0–9 to be zero:
```
u32BE(0) == 0   (tst.l (A0))
u32BE(4) == 0   (tst.l 4(A0))
u16BE(8) == 0   (tst.w 8(A0))
```

### New Format (Format = 1)

```
Offset  Checks
------  ------
160     sampleBlockPtr = u16BE(160); must be non-zero, non-negative, even
164     u16BE(164) == u16BE(168) == u16BE(172) == u16BE(176)  (all equal — song pointer table)
*       buf[base + sampleBlockPtr]..+3 as u32BE == 0x00B400B6  (dereference validation)
```

### Old Format (Format = 0xFF / -1)

```
Offset  Checks
------  ------
512     sampleBlockPtr = u16BE(512); must be non-zero, non-negative, even
516     u16BE(516) == u16BE(520) == u16BE(524) == u16BE(528)  (all equal — song pointer table)
*       buf[base + sampleBlockPtr]..+3 as u32BE == 0x02140216  (dereference validation)
```

### Very-Old Format (Format = 0)

```
Offset  Checks
------  ------
514     u16BE(514) == u16BE(518) == u16BE(522) == u16BE(526)  (all equal — song pointer table)
516     sampleBlockPtr = u16BE(516); must be non-zero, non-negative, even
*       buf[base + sampleBlockPtr - 2]..+1 as u16BE in {0xFFEC, 0xFFE8}
        (loop or stop marker at end of block)
```

The dereference constants (`0x00B400B6`, `0x02140216`) are 68k machine code patterns
embedded at fixed locations within the sample block, confirming the player's internal
data layout.

---

## Detection Priority

The variant check order in the parser: **New → Old → Very-Old**.
The first variant whose checks pass is used. Variants are mutually exclusive in
practice due to their differing pointer offsets.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/PaulShieldsParser.ts`
- **Wanted Team asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/PaulShields/src/`
- **UADE player:** `Reference Code/uade-3.05/players/PaulShields`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser identifies Paul Shields files and routes them to UADE for synthesis.
The `ps.*` prefix is the primary routing key. Placeholder instruments are emitted.

The internal `Format` field is stored as: `1` (New), `0xFF`/`-1` (Old),
`0` (Very-Old). The `st` 68k instruction sets the format byte to `0xFF` for Old.
