# Peter Verswyvelen Packer

**Status:** DETECTION_ONLY — parser detects format; UADE synthesizes audio
**Parser:** `src/lib/import/formats/PeterVerswyvelenPackerParser.ts`
**Extensions:** `PVP.*` (prefix)
**UADE name:** PeterVerswyvelenPacker
**Reference files:** (identified in Amiga game collections)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/PeterVerswyvelenPacker/Peter Verswyvelen Packer_2.asm`

---

## Overview

Peter Verswyvelen Packer is an Amiga 4-channel music format by the Wanted Team. Files are
identified by structural consistency checks on sample header blocks and a pattern/song
metadata block. Files are prefixed `PVP.`.

---

## Detection Algorithm

Based on `Check2` from `Peter Verswyvelen Packer_2.asm`:

### Step 1 — 31 sample headers (offsets 0..247, 8 bytes each)

For each header `i` (i = 0..30):
```
word at i*8+0: bit 15 must be clear
word at i*8+2: must be <= 64 and bit 15 clear  (volume constraint)
word at i*8+4: bit 15 must be clear
word at i*8+6: bit 15 must be clear
```

### Step 2 — Metadata block (offsets 248..255)

```
u16BE(248): patCount — non-zero, bit 15 clear
u16BE(250): songLen  — non-zero, bit 15 clear, even
u16BE(252): val252   — songLen must be strictly < val252
u16BE(254): limit    — non-zero, bit 15 clear
```

### Step 3 — Step table (offset 256..., length = (patCount-2) × 2 bytes)

Each word in the step table must be:
- bit 15 clear
- even
- ≤ limit
- non-decreasing (each entry ≤ next)

**Minimum file size:** 260 bytes.

---

## Format Notes

- 4-channel Amiga audio (LRRL panning)
- Song name suffix: `[Peter Verswyvelen Packer]`; `PVP.` prefix stripped from module name

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/PeterVerswyvelenPackerParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/PeterVerswyvelenPacker/Peter Verswyvelen Packer_2.asm`
