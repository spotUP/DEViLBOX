# Andrew Parton

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/AndrewPartonParser.ts`
**Extensions:** `bye.*` (prefix-based)
**UADE name:** AndrewParton
**Reference files:** (Amiga game music — rare)
**Replayer reference:** `Reference Code/uade-3.05/players/AndrewParton`

---

## Overview

Andrew Parton is a 4-channel Amiga music format identified by the ASCII magic
`"BANK"` at offset 0, followed by two validation tables: 20 Amiga chip-RAM pointers
(each < 2 MB) and 40 sample length values (each < 64 KB).

Detection is ported from the `DTP_Check2` routine in the Wanted Team eagleplayer
`Andrew Parton_v2.asm`.

---

## File Layout

```
Offset  Size     Description
------  ----     -----------
0x00    4        Magic: "BANK" (0x42414E4B)
0x04    20 × 4   Chip-RAM pointer table (20 entries × 4 bytes):
                 Each u32BE must be < 0x200000 (2 MB Amiga chip-RAM limit)
0x54    40 × 4   Sample length table (40 entries × 4 bytes):
                 Each u32BE must be < 0x10000 (64 KB max sample size)
0xF4+   ...      Song and sample data
```

**Minimum file size:** 4 + 80 + 160 = 244 bytes (0xF4).

---

## Detection Algorithm

```
1. u32BE(0) == 0x42414E4B   → "BANK" magic
2. D1 = 0x200000
   For i in 0..19 (20 entries at offsets 4, 8, ..., 80):
     u32BE(4 + i×4) < 0x200000   → valid chip-RAM pointer
3. D1 = 0x10000
   For i in 0..39 (40 entries at offsets 84, 88, ..., 240):
     u32BE(84 + i×4) < 0x10000   → valid sample length
```

The 68k detection (from the assembly source):
```
cmp.l  #'BANK',(A0)+      → read and advance, A0 now at offset 4
moveq  #$20, D1
swap   D1                  → D1 = 0x200000
moveq  #19, D2             → loop 20 times (0..19)
loop1: cmp.l (A0)+, D1     → read and advance; fail if value >= D1
       dbf   D2, loop1
moveq  #0, D1
move.w #$FFFF, D1          → D1 = 0x0000FFFF + 1 = 0x10000
moveq  #39, D2             → loop 40 times (0..39)
loop2: cmp.l (A0)+, D1     → read and advance; fail if value >= D1
       dbf   D2, loop2
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/AndrewPartonParser.ts`
- **Wanted Team asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/AndrewParton/src/Andrew Parton_v2.asm`
- **UADE player:** `Reference Code/uade-3.05/players/AndrewParton`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser validates the `BANK` magic and the two pointer/length tables, then routes
playback to UADE. The `bye.*` prefix is the primary routing key. Placeholder
instruments are emitted.
