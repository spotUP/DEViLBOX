# Martin Walker

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/MartinWalkerParser.ts`
**Extensions:** `avp.*`, `mw.*` (prefix-based)
**UADE name:** Martin_Walker
**Reference files:** (identified in Amiga collections — Avatar Productions games)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/MartinWalker/src/Martin Walker.AMP.asm`

---

## Overview

Martin Walker's Amiga music system (1990–94) was used in Avatar Productions games. Files are
compiled 68k player + data binaries with five recognized structural variants. Detection is
entirely opcode-pattern based with no fixed magic string.

---

## Detection Algorithm

All formats require the "inner loop" check at the located body offset:

**Inner loop check (`bodyOffset`):**
```
u32BE(bodyOffset+4)  == 0xE9417000   (68k opcode sequence)
u16BE(bodyOffset+8)  == 0x41FA
u32BE(bodyOffset+148) == 0x48E7FCFE
  OR u32BE(bodyOffset+164) == 0x48E7FCFE
  OR u32BE(bodyOffset+168) == 0x48E7FCFE
```

### Format 1 (no SFX)

```
u32BE(buf, 0)   == 0x48E7FCFE
u16BE(buf, 220) != 0x45FA           (presence of 0x45FA → reject format 1)
→ inner loop check at bodyOffset=0
```

### Format 2 (SFX, original)

```
u32BE(buf, 0)   == 0x2F0841FA
rel = u16BE(buf, 4)
bodyOffset = 4 + rel + 28
u16BE(buf, bodyOffset+220) == 0x45FA
→ inner loop check
```

### Format 3 (SFX, ripped with EagleRipper)

```
u32BE(buf, 28)  == 0x48E7FCFE       (MOVEM.L at +28)
bodyOffset = 28
u16BE(buf, bodyOffset+220) == 0x45FA
→ inner loop check
```

### Format 4 (SFX, $6000 header)

```
u16BE at offsets 0,4,8,12,16,20,24,28 all == 0x6000
rel = u16BE(buf, 14)
bodyA = 14 + rel
u32BE(bodyA) == 0x48E7FCFE
u16BE(bodyA+268) == 0x45FA  OR  u16BE(bodyA+274) == 0xE942
→ inner loop check at bodyA
```

### Format 5 (SFX variant, $2F0841FA at +28)

```
u32BE(buf, 28) == 0x2F0841FA  (scanned with step 2)
rel = u16BE(buf, 26)
bodyB = 26 + rel
→ inner loop check at bodyB
```

---

## File Prefixes

| Prefix | Description |
|--------|-------------|
| `avp.*` | Avatar Productions prefix |
| `mw.*` | Generic Martin Walker prefix |

---

## Format Notes

- Minimum file size: 300 bytes.
- All five formats ultimately verify the same 68k opcode fingerprint at the player body.
- The `0x45FA` word at `bodyOffset+220` (or `+268` for formats 4/5) distinguishes
  SFX-capable variants from format 1 (which has no SFX support).
- No metadata (title, instrument names) is extracted by the parser.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/MartinWalkerParser.ts`
- **UADE eagleplayer asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/MartinWalker/src/Martin Walker.AMP.asm`
