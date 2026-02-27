# Sound Master

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/SoundMasterParser.ts`
**Extensions:** `sm.*` / `sm1.*` / `sm2.*` / `sm3.*` / `smpro.*` (prefix-based)
**UADE name:** SoundMaster
**Reference files:** `Reference Music/Sound Master/` + `Reference Music/Sound Master II v1/` + `Reference Music/Sound Master II v3/`
**Replayer reference:** `Reference Code/uade-3.05/players/SoundMaster`

---

## Overview

Sound Master (versions 1.0–3.0) was written by Michiel J. Soede. Files are compiled
Amiga 68k executables. Detection uses three BRA opcodes followed by a forward scan
for a `LEA pc-relative` opcode, an `RTS`, and a specific hardware register constant.

Detection is ported from `Sound Master_v1.asm DTP_Check2`. MI_MaxSamples = 32.

---

## Detection Algorithm

```
1. u16BE(0) == 0x6000              → BRA.W opcode
2. D2 = u16BE(2): non-negative, non-zero, even   → BRA.W displacement
3. u16BE(4) == 0x6000              → second BRA.W
4. D3 = u16BE(6): non-negative, non-zero, even   → second BRA.W displacement

5. u16BE(8) == 0x6000              → third BRA.W opcode

6. Scan from (2 + D2) up to 30 bytes for u16 == 0x47FA
   (LEA d16(PC), An — PC-relative load for player data table)
   → found at scanPos

7. Scan from scanPos forward for u16 == 0x4E75  (RTS opcode)
   → found at rtsPos; rtsEnd = rtsPos + 2

8. New-format check (optional):
   if u32BE(rtsEnd - 8) == 0x177C0000:
     checkOff = rtsEnd - 6
   else:
     checkOff = rtsEnd

9. u32BE(checkOff - 6) == 0x00BFE001
   (Amiga CIA-A timer register write: hardware-specific constant)
```

The `0x00BFE001` longword at the end of the detection is a write to Amiga CIA-A
interrupt control register (`$BFE001`), confirming this is a Sound Master player
initialization sequence.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/SoundMasterParser.ts`
- **Wanted Team asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/SoundMaster/Sound Master_v1.asm`
- **UADE player:** `Reference Code/uade-3.05/players/SoundMaster`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser validates the BRA chain + scan sequence and routes playback to UADE.
The `sm.*`/`sm1.*`/`sm2.*`/`sm3.*`/`smpro.*` prefixes are routing keys. Up to 32
placeholder instruments are created.

**Not related to `SoundControl.md`** (Sound Control by a different author) or
`SoundFactory.md`. Sound Master uses a completely different player architecture
with CIA timer-based timing.
