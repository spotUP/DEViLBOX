# Jochen Hippel ST (TFMX-ST)

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/JochenHippelSTParser.ts`
**Extensions:** `hst.*`, `SOG.*`, `MCMD.*` (prefix-based)
**UADE name:** JochenHippel
**Reference files:** (identified in Amiga game collections)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/MartinWalker/src/Jochen Hippel_v1.asm`

---

## Overview

Jochen Hippel ST is the standard-voice (non-7V) TFMX variant used by composer Jochen Hippel
in Amiga games. Three detection paths exist, all ultimately validating that a TFMX-ST song
header is reachable:

1. **Raw TFMX-ST** — bare song file beginning with `"TFMX"` magic.
2. **MCMD wrapper** — loader binary starting with `0x48E7FFFE` (MOVEM.L push), navigating to
   an embedded `"MCMD"` song.
3. **SOG wrapper** — loader binary starting with `0x60xx` (BRA.S or BRA.W), navigating to an
   embedded `"TFMX"` song.

---

## Detection Algorithm

### Path 1: Raw TFMX-ST

```
1. u32BE(buf, 0) == 0x54464D58  ("TFMX")
   → immediately accepted
```

### Path 2: MCMD Wrapper

```
1. u32BE(buf, 0) == 0x48E7FFFE    (MOVEM.L — 68k push all registers)
2. buf[4] == 0x61                  (BSR.B opcode)
3. D1 = buf[5]  — must be > 0 and even
4. Advance by D1
5. u32BE(buf, off) == 0x2F006100
6. Advance +4; u16BE == 0x41FA; advance +18
7. u16BE == 0x41FA; advance +2; advance by word offset
8. u32BE(buf, off) == 0x4D434D44  ("MCMD")
```

### Path 3: SOG Wrapper (BRA short or long)

```
Short form (byte[1] != 0):
1. buf[0] == 0x60; D1 = buf[1]  — must be > 0 and even
2. Navigate: advance D1, check 0x48E7FFFE; check 0x6100; follow word jump;
   check 0x2F006100; follow word jump; check 0x41FA; advance +20
3. Check 0x41FA (try two positions); follow final word offset to songOff
4. Validate TFMX-ST at songOff (see below)

Long form (byte[1] == 0):
1. buf[0] == 0x60, buf[1] == 0x00; D1 = u16BE(buf, 2) — must be positive, even
2. Check 0x6000 word; advance to body: check 0x48E7FFFE
3. Follow 0x41FA / 0x41FA word offset chain to songOff
4. Validate TFMX-ST at songOff
```

### TFMX-ST Song Validation

```
u32BE(songOff)     == "TFMX"
buf[songOff+4]     == 0
u16BE(songOff+12)  != 0        (SFX file test)

D1 = (2 + w0 + w1) << 6        (header/pattern count scaling)
D2 = (1 + w2) * w4             (channel table size)
D3 = (1 + w3) * 12             (macro table — mulu #12; differs from 7V which uses 28)
D2b = (1 + w5) * 6             (sample table — mulu #6; differs from 7V)
checkOff = current_offset + D1 + D2 + D3 + D2b + 32

u32BE(checkOff)      == 0
u16BE(checkOff+4)    != 0  (D2final)
D2final * 2          == u32BE(checkOff+30)
```

---

## File Prefixes

| Prefix | Description |
|--------|-------------|
| `hst.*` | Standard Hippel ST prefix |
| `SOG.*` | Signed Object Group (SOG wrapper) |
| `MCMD.*` | MCMD wrapper variant |

---

## Format Notes

- TFMX-ST differs from TFMX-7V in the macro and sample table multipliers used in the
  structural size validation: ST uses `×12` and `×6`; 7V uses `×28` and `×8`.
- The SFX file test at `songOff+12` must be non-zero; this word encodes the number of SFX
  entries and confirms the file is a complete TFMX song rather than a truncated header.
- No metadata (title, instruments) is extracted; the parser emits placeholder instruments only.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/JochenHippelSTParser.ts`
- **UADE eagleplayer asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/MartinWalker/src/Jochen Hippel_v1.asm`
