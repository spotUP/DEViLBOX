# CustomMade (Delitracker Custom / CustomMade)

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/CustomMadeParser.ts`
**Extensions:** `cm.*`, `rk.*`, `rkb.*` (prefix-based)
**UADE name:** CustomMade
**Reference files:** (identified in Amiga demo collections)

---

## Overview

CustomMade covers two related Amiga binary music sub-formats detected by the same parser:

1. **Delitracker Custom** — a HUNK executable beginning with the standard Amiga HUNK_HEADER
   magic `0x000003F3`, minimum 3001 bytes.
2. **CustomMade binary** — a 68k executable identified by opcode pattern at offset 0
   combined with a voice-clear signature scan in the first 400 bytes of the binary.

Both are compiled 68k player + data binaries; there is no fixed song data layout readable
without executing the replayer.

---

## Detection Algorithm

### Sub-format 1: Delitracker Custom

```
1. buf.byteLength > 3000
2. u32BE(buf, 0) == 0x000003F3   (Amiga HUNK_HEADER magic)
```

### Sub-format 2: CustomMade Binary

```
1. buf.byteLength >= 408
2. Opcode check at offset 0:
   buf[0..1] in { 0x4EF9, 0x4EB9, 0x6000 }  (JMP.L / JSR.L / BRA — 68k branch opcodes)
3. Voice-clear signature scan in bytes 8–407:
   Search for byte sequence 0x42 0x28 0x00 0x30  (CLRB 0x30(A0))
   then 0x42 0x28 0x00 0x31  (CLRB 0x31(A0))
   then 0x42 0x28 0x00 0x32  (CLRB 0x32(A0))
   — consecutive voice register clears, indicative of the CustomMade init routine
```

---

## File Prefixes

Files are distributed with prefix-based names:

| Prefix | Description |
|--------|-------------|
| `cm.*` | Standard CustomMade prefix |
| `rk.*` | Variant prefix |
| `rkb.*` | Variant prefix |

---

## Format Notes

- Both sub-formats are compiled 68k binaries; song data is embedded and not separately
  addressable without disassembly of the player routine.
- The voice-clear signature (`CLR.B 0x30(A0)`, `0x31(A0)`, `0x32(A0)`) is an idiom from
  the CustomMade init routine that clears the four Amiga hardware voice registers in sequence.
- Detection relies entirely on binary fingerprinting; no metadata (title, author, instruments)
  is extracted by the parser.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/CustomMadeParser.ts`
- **UADE eagleplayer:** `Reference Code/uade-3.05/players/CustomMade`
