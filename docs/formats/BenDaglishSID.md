# Ben Daglish SID

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/BenDaglishSIDParser.ts`
**Extensions:** `BDS.*` (prefix-based)
**UADE name:** BenDaglishSID
**Reference files:** `Reference Music/Ben Daglish SID/` (4 files)
**Replayer reference:** `Reference Code/uade-3.05/players/BenDaglishSID`

---

## Overview

Ben Daglish SID is a 3-voice variant of the Ben Daglish Amiga music player that
uses SID-style synthesis. Files are compiled Amiga HUNK-format executables identified
by the Amiga HUNK magic plus an 8-byte ASCII signature `"DAGLISH!"` embedded in the
player init code.

Detection is ported from `Benn Daglish SID_v2.asm EP_Check3 / DTP_Check1`.

**Not related to `BenDaglish.md`** (the standard 4-voice Amiga format). The SID
variant uses 3 voices with different player initialization code and a distinctive
signature string.

---

## File Layout

Ben Daglish SID files are Amiga HUNK-format executables.

```
Offset  Size  Description
------  ----  -----------
0x00    4     0x000003F3 — Amiga HUNK_HEADER magic
0x04    ...   HUNK structure (hunks, relocations, etc.)
0x14    1     Chip-RAM loading indicator (must be != 0 at offset 20)
0x20    4     0x70FF4E75 — MOVEQ #-1,D0 + RTS (player exit pattern)
0x24    4     0x44414749 — "DAGI" (first half of "DAGLISH!")
0x28    4     0x4953482E — "ISH." (second half of "DAGLISH!")
              NOTE: assembled from 'DAGL'+'ISH!' → combined "DAGLISH!"
0x2C    4     Interrupt pointer (must be != 0)
0x30    4     Audio Interrupt pointer (must be != 0)
0x34    4     InitSong pointer (must be != 0)
0x38    4     Subsongs count (must be != 0)
```

---

## Detection Algorithm

```
1. u32BE(0)  == 0x000003F3    → Amiga HUNK_HEADER magic
2. buf[20]   != 0              → chip-RAM loading indicator
3. u32BE(32) == 0x70FF4E75    → MOVEQ #-1,D0 + RTS opcodes
4. u32BE(36) == 0x44414749    → "DAGI" (first word of "DAGLISH!")
5. u32BE(40) == 0x4953482E    → "ISH." (second word of "DAGLISH!")
6. u32BE(44) != 0              → interrupt pointer non-zero
7. u32BE(48) != 0              → audio interrupt pointer non-zero
8. u32BE(52) != 0              → InitSong pointer non-zero
9. u32BE(56) != 0              → subsongs count non-zero
```

The 8-byte signature at offsets 36–43 spells `"DAGLISH!"` — Ben Daglish's composer
signature embedded in the player binary at a fixed offset.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/BenDaglishSIDParser.ts`
- **UADE player:** `Reference Code/uade-3.05/players/BenDaglishSID`
- **Wanted Team asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/BenDaglishSID/`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser identifies Ben Daglish SID files via the HUNK magic + `DAGLISH!` signature
and routes playback to UADE. The `BDS.*` prefix is the primary routing key. 3 channel
placeholder instruments are created.

**Contrast with BenDaglish.md:** The standard Ben Daglish format uses 4 Amiga Paula
channels and different detection. The SID variant targets 3-voice synthesis using
SID-emulation techniques on Amiga hardware.
