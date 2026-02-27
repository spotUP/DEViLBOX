# Janko Mrsic-Flogel

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/JankoMrsicFlogelParser.ts`
**Extensions:** `JMF.*` (prefix)
**UADE name:** JankoMrsicFlogel
**Reference files:** (identified in Amiga game/demo collections)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/JankoMrsicFlogel/`

---

## Overview

Janko Mrsic-Flogel is a proprietary 4-channel Amiga music format. The module is a
compiled 68k Hunk executable identified by the HUNK_HEADER magic and the ASCII tag
`'J.FL'`+`'OGEL'` at offsets 36–43, alongside a function pointer table.

This format uses the same structural fingerprint pattern as Core Design, but with
different ASCII identification bytes and a different pointer table layout.

---

## Detection

Based on `Janko Mrsic-Flogel_v1.asm Check3`:

```
u32BE(0)  == 0x000003F3   → 68k HUNK_HEADER magic
buf[20]   != 0            → non-zero byte at offset 20
u32BE(32) == 0x70FF4E75   → MOVEQ #-1,D0 + RTS opcodes
u32BE(36) == 0x4A2E464C   → ASCII 'J.FL'
u32BE(40) == 0x4F47454C   → ASCII 'OGEL'
u32BE(48) != 0            → Interrupt pointer
u32BE(52) != 0            → InitSong pointer
u32BE(56) != 0            → Subsongs pointer
```

**Minimum file size:** 64 bytes.

The `'J.FL'` + `'OGEL'` signature (i.e. `'J.FLOGEL'` — the composer's surname) at
offsets 36–43 uniquely identifies this format among HUNK-based Amiga music binaries.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/JankoMrsicFlogelParser.ts`
- **UADE player:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/JankoMrsicFlogel/`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The HUNK_HEADER + `'J.FLOGEL'` + pointer table detection is unambiguous. UADE synthesizes audio.
