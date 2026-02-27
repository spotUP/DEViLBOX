# Jochen Hippel 7V (TFMX-7V)

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/JochenHippel7VParser.ts`
**Extensions:** `hip7.*`, `S7G.*` (prefix-based)
**UADE name:** JochenHippel-7V
**Reference files:** (identified in Amiga game collections)

---

## Overview

Jochen Hippel 7V is a variant of the TFMX music format used by composer Jochen Hippel in
various Amiga games. The "7V" denotes 7-voice stereo output. Two detection paths exist:

1. **Loader stub path** — a small 68k loader binary (`BRA` opcode at offset 0) containing
   an embedded TFMX-7V song payload located by scanning for a specific 68k instruction
   sequence.
2. **Direct TFMX-7V path** — a bare TFMX-7V song file beginning with the `"TFMX"` magic.

---

## Detection Algorithm

### Path A: Loader Stub

```
1. u16BE(buf, 0) == 0x6000     (BRA — 68k branch-always opcode)
2. Scan buf[0x28..end-4] for MAGIC_FIND1 = 0x308141FA (68k LEA.L instruction pattern)
3. At match offset i, read embedded pointer:
     relOff = i32BE(buf, i + 4)
     songOff = i + 4 + 4 + relOff   (PC-relative pointer to TFMX-7V data)
4. Validate TFMX-7V song at songOff (see Path B validation below)
```

### Path B: Direct TFMX-7V Song

```
1. buf.byteLength >= 0x800
2. u32BE(buf, 0) == 0x54464D58   ("TFMX" in ASCII)
3. buf[4] == 0x00
4. Structural size validation:
     hdrEnd = u16BE(buf, 0x1A) * 2
     sfxEnd = u16BE(buf, 0x1C) * 2
     0x800 + hdrEnd <= buf.byteLength
     0x800 + sfxEnd <= buf.byteLength
```

---

## File Prefixes

| Prefix | Description |
|--------|-------------|
| `hip7.*` | Standard 7V prefix |
| `S7G.*` | Alternate 7V prefix (used in some games) |

---

## TFMX-7V Song Layout (from Path B)

```
Offset  Size  Description
------  ----  -----------
0       4     Magic: "TFMX" (0x54464D58)
4       1     Must be 0x00
0x1A    2     hdrEnd (u16BE) — header data length in words
0x1C    2     sfxEnd (u16BE) — SFX data length in words
0x800   ...   Header data (hdrEnd * 2 bytes)
0x800   ...   SFX data (sfxEnd * 2 bytes)
```

---

## Format Notes

- The loader stub (Path A) is a self-contained 68k binary that loads and plays the embedded
  TFMX-7V data. The actual song data begins at a PC-relative offset found by scanning.
- `MAGIC_FIND1 = 0x308141FA` is the encoding of `MOVE.W (A1,D0.W),D0 / LEA.L ...` —
  a sequence unique to the Jochen Hippel 7V loader routine.
- The 7V variant differs from standard TFMX/TFMX-Pro in supporting 7-voice playback
  using Amiga hardware tricks.
- No metadata (title, author, instrument names) is extracted by the parser.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/JochenHippel7VParser.ts`
- **UADE eagleplayer:** `Reference Code/uade-3.05/players/JochenHippel-7V`
