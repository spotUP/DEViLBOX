# Future Player

**Status:** DETECTION_ONLY — parser detects format; UADE synthesizes audio
**Parser:** `src/lib/import/formats/FuturePlayerParser.ts`
**Extensions:** `FP.*` (prefix), `.fp`
**UADE name:** FuturePlayer
**Reference files:** (identified in Amiga game/demo collections)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/FuturePlayer/Future Player_v1.asm`

---

## Overview

Future Player is an Amiga 4-channel music format from the Wanted Team. Files contain
embedded player code plus music data in a single binary. The format is identified by an
Amiga HUNK header magic and the embedded string `"F.PLAYER"` at a fixed offset.

---

## Detection Algorithm

Based on `Check3` from `Future Player_v1.asm`:

```
1. buf.length >= 68
2. u32BE(buf, 0)  == 0x000003F3   (Amiga HUNK_HEADER magic)
3. buf[20]        != 0            (chip-memory loading flag, must be non-zero)
4. u32BE(buf, 32) == 0x70FF4E75   (JSR trampoline constant)
5. u32BE(buf, 36) == 0x462E504C   ("F.PL")
6. u32BE(buf, 40) == 0x41594552   ("AYER")
7. u32BE(buf, 64) != 0            (song pointer must be non-zero)
```

Together, bytes 36–43 spell `"F.PLAYER"`.

**Minimum file size:** 68 bytes.

---

## Format Notes

- 4-channel Amiga audio (LRRL panning)
- Song name suffix: `[Future Player]`; `FP.`/`.fp` stripped from module name

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/FuturePlayerParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/FuturePlayer/Future Player_v1.asm`
