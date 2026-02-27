# Jeroen Tel

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/JeroenTelParser.ts`
**Extensions:** `jt.*`, `mon_old.*`, UADE eagleplayer
**UADE name:** JeroenTel
**Reference files:** `Reference Music/Jeroen Tel/` (9 files)
**Replayer reference:**
  `Reference Code/uade-3.05/amigasrc/players/wanted_team/JeroenTel/src/Jeroen Tel_v1.asm`

---

## Overview

Jeroen Tel (of Maniacs of Noise fame) is one of the most prolific Amiga game composers,
known for Cybernoid, Myth, Turrican, and many others. His player format is a compiled
68k Amiga executable combining player code and music data in a single self-contained file.

---

## Detection

Detection mirrors the UADE `Jeroen Tel_v1.asm` `DTP_Check2` routine:

1. File must be > 1700 bytes.
2. Scan the first 40 bytes (step 2) for the 4-byte sequence:
   `0x02, 0x39, 0x00, 0x01` — this is a 68k `ANDI.B #$01, ($XXXXXXXX).L` instruction
   (the low word of the absolute address bytes).
3. When found at `scanPos`:
   - byte at `scanPos + 8` must be `0x66` (BNE opcode)
   - byte at `scanPos + 9` = `D1` = **instrument count** (must be 1–127, i.e. > 0 and < 0x80)
   - bytes at `scanPos + 10..11` must be `0x4E, 0x75` (RTS instruction)
4. Skip D1 bytes forward from `scanPos + 12`:
   - If the word there is `0x4A39` (TST.B abs.l): it must appear 4 more times, each 18 bytes apart.
   - Otherwise the longword must be `0x78001839`.

The instrument count (D1) is embedded in the detection signature itself, making it
extractable during the scan.

---

## Format Structure

Jeroen Tel modules are **single-file** compiled 68k executables. All data — player
code, pattern/sequence tables, instrument/sample headers, and PCM sample data — are
embedded in a single binary file.

The player drives Amiga Paula directly: period registers, volume, DMA start/stop.
Instruments are PCM sample-based, with arpeggios and volume sequences embedded in
the player code.

---

## Instrument Count

The parser extracts the instrument count from the detection signature (`D1` byte at
`scanPos + 9`). Valid range: 1–127.

---

## UADE Configuration

```
eagleplayer.conf:
  JeroenTel  prefixes=jt
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/JeroenTelParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/JeroenTel/src/Jeroen Tel_v1.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser extracts the instrument count via the detection signature and creates
placeholder instrument slots. UADE handles all 68k player execution and audio synthesis.

**Related format:** Jeroen Tel also co-created Maniacs of Noise (`mon.*`) — see
`ManiacsOfNoise.md`. The `mon_old.*` prefix handled here refers to an older
variant of his personal player format.
