# Core Design

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/CoreDesignParser.ts`
**Extensions:** `CORE.*` (prefix-based)
**UADE name:** CoreDesign
**Reference files:** `Reference Music/` (titles by Core Design studio)
**Replayer reference:** `Reference Code/uade-3.05/players/CoreDesign`

---

## Overview

Core Design is a proprietary 4-channel Amiga music format used in games developed
by Core Design (e.g. *Chuck Rock*, *Jaguar XJ220*, *Heimdall*). Files are compiled
Amiga HUNK-format executables identified by the HUNK magic plus the 8-byte ASCII
signature `"S.PHIPPS"` embedded in the player initialization code.

Detection is ported from the `Core Design.asm Check3` routine in the Wanted Team
eagleplayer.

---

## File Layout

Core Design files are Amiga HUNK-format executables. No fixed tracker structure
exists — the player code and song data are a single relocatable binary.

```
Offset  Size  Description
------  ----  -----------
0x00    4     0x000003F3 — Amiga HUNK_HEADER magic
0x04    ...   HUNK structure
0x14    1     Must be != 0 (non-zero byte at offset 20)
0x20    4     0x70FF4E75 — MOVEQ #-1,D0 + RTS (player exit pattern)
0x24    4     0x532E5048 — "S.PH" (first word of "S.PHIPPS")
0x28    4     0x49505053 — "IPPS" (second word of "S.PHIPPS")
0x2C    4     Interrupt pointer (must be != 0)
0x30    4     Audio Interrupt pointer (must be != 0)
0x34    4     InitSong pointer (must be != 0)
0x38    4     EndSong pointer (must be != 0)
0x3C    4     Subsongs pointer (must be != 0)
```

---

## Detection Algorithm

```
1. u32BE(0)  == 0x000003F3   → Amiga HUNK_HEADER magic
2. buf[20]   != 0             → non-zero byte at offset 20
3. u32BE(32) == 0x70FF4E75   → MOVEQ #-1,D0 + RTS
4. u32BE(36) == 0x532E5048   → "S.PH"
5. u32BE(40) == 0x49505053   → "IPPS" (combined: "S.PHIPPS")
6. u32BE(44) != 0             → interrupt pointer non-zero
7. u32BE(48) != 0             → audio interrupt pointer non-zero
8. u32BE(52) != 0             → InitSong pointer non-zero
9. u32BE(56) != 0             → EndSong pointer non-zero
10. u32BE(60) != 0            → subsongs pointer non-zero
```

The 8-byte signature at offsets 36–43 spells `"S.PHIPPS"` — a reference to
Stephen Phipps, the Core Design composer responsible for the replayer code.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/CoreDesignParser.ts`
- **UADE player:** `Reference Code/uade-3.05/players/CoreDesign`
- **Wanted Team asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/CoreDesign/`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser identifies Core Design files via the HUNK magic + `S.PHIPPS` signature
and routes playback to UADE. The `CORE.*` prefix is the primary routing key.
4 channel placeholder instruments are created.

The `"S.PHIPPS"` signature appears in the player binary at a fixed offset, used
by the Wanted Team eagleplayer to uniquely fingerprint Core Design executables
without ambiguity against other HUNK-format players.
