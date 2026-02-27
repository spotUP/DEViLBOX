# Steve Barrett

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/SteveBarrettParser.ts`
**Extensions:** `SB.*` (prefix-based)
**UADE name:** SteveBarrett
**Reference files:** `Reference Music/Steve Barrett/` (6 files)
**Replayer reference:** `Reference Code/uade-3.05/players/SteveBarrett`

---

## Overview

Steve Barrett is a compiled Amiga music format identified by four BRA opcodes at the
start of the file, followed by specific DMA hardware register access instructions
at offset 8.

Detection is ported from `Steve Barrett_v2.asm Check2`.

---

## File Layout

Steve Barrett files are compiled 68k executables with the player and song data combined.

```
Offset  Size  Description
------  ----  -----------
0x00    2     0x6000 — BRA opcode
0x02    2     BRA displacement (non-zero, positive, even)
0x04    2     0x6000 — BRA opcode
0x06    2     BRA displacement (non-zero, positive, even)
0x08    2     0x2A7C — MOVE.L #immediate, An (hardware register setup)
0x0A    4     0x00DFF0A8 — Amiga DMA audio base address ($DFF0A8)
0x0E+   ...   Player code and song data continuation
```

---

## Detection Algorithm

```
1. buf.length >= 14
2. u16BE(0) == 0x6000                       → first BRA opcode
   u16BE(2): non-zero, bit 15 clear, bit 0 clear  → valid even positive displacement
3. u16BE(4) == 0x6000                       → second BRA opcode
   u16BE(6): non-zero, bit 15 clear, bit 0 clear  → valid even positive displacement
4. u16BE(8)  == 0x2A7C                      → MOVE.L #imm,An opcode
5. u32BE(10) == 0x00DFF0A8                  → Amiga DMA audio register address
```

The `0x00DFF0A8` longword identifies the Amiga chip register `$DFF0A8` (AUD0LC —
audio channel 0 location register), confirming this is an Amiga audio player init
sequence. The two BRA instructions before it jump to the player entry point.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/SteveBarrettParser.ts`
- **Wanted Team asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/SteveBarrett/src/Steve Barrett_v2.asm`
- **UADE player:** `Reference Code/uade-3.05/players/SteveBarrett`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser identifies Steve Barrett files and routes playback to UADE. The `SB.*`
prefix is the primary routing key. 4 channel placeholder instruments are created.
