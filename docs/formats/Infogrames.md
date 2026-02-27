# Infogrames (RobHubbard2)

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/InfogramesParser.ts`
**Extensions:** `.dum` (extension-based; companion: `.dum.set`)
**UADE name:** Infogrames
**Reference files:** (Amiga Infogrames game music — Gobliins, Ween, Horror Zombies)
**Replayer reference:** `Reference Code/uade-3.05/players/Infogrames`

---

## Overview

The Infogrames music format (also called "RobHubbard2") was used in Amiga games
published by Infogrames. The format requires two files: the song data (`.dum`) and
an external sample bank (`.dum.set`).

Detection uses an indirect offset-dereference scheme: a word at offset 0 of the
file is an offset into the file itself, and the byte at `offset + 2 + relativePointer`
must be 0 (null terminator) followed by the value `0x0F` (version/tag byte).

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0x00    2     selfOff: relative offset to internal structure (non-zero, even, < fileSize)
...     ...   Song data
selfOff 2     + 0: arbitrary word
selfOff + 2   2     relPtr: relative pointer within structure
selfOff + relPtr  1  Must be 0x00 (null terminator)
selfOff + relPtr + 1  1  Must be 0x0F (version/tag byte)
```

**Two-file format:** Song data in `.dum`; sample data in `.dum.set`.

---

## Detection Algorithm

```
1. selfOff = u16BE(0)
   require: selfOff != 0, (selfOff & 1) == 0 (even), fileSize > selfOff
2. relPtr = u16BE(selfOff + 2)
3. targetPos = selfOff + relPtr
   require: buf[targetPos] == 0x00      → null terminator
            buf[targetPos + 1] == 0x0F  → version/tag byte
```

The tag byte `0x0F` at the dereference target is the primary fingerprint of the
Infogrames player format. This indirect detection avoids false positives from
other binary formats that start with a non-zero even word.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/InfogramesParser.ts`
- **UADE player:** `Reference Code/uade-3.05/players/Infogrames`
- **Replayer asm:** `Reference Code/uade-3.05/amigasrc/players/infogrames/Infogrames.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser validates the Infogrames header structure and routes playback to UADE.
The `.dum` extension is the primary routing key. UADE loads the companion `.dum.set`
sample file automatically.

**Two-file requirement:** The UADE player needs both `.dum` (song) and `.dum.set`
(samples) in the same directory. The parser creates a single-file stub; the companion
sample file resolution is handled by the UADE runtime.

**Name "RobHubbard2":** Some references call this format "RobHubbard2" because
it uses a player inspired by Rob Hubbard's architecture. It is unrelated to
`RobHubbard.md` (Amiga) and `RobHubbardST.md` (ST).
