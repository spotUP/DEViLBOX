# Jason Page

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/JasonPageParser.ts`
**Extensions:** `jpn.*`, `jp.*`, UADE eagleplayer
**UADE name:** JasonPage
**Reference files:** `Reference Music/Jason Page/` (64 files)
**Replayer reference:**
  `Reference Code/uade-3.05/amigasrc/players/wanted_team/JasonPage/src/Jason Page_v5.s`

---

## Overview

Jason Page composed music for many classic Amiga games including Gods, Assassin,
and Robocop 3. The player was written by Jason Page and adapted by Wanted Team for
EaglePlayer / DeliTracker. Modules are compiled 68k Amiga executables combining
player code and music data into a single self-contained file.

---

## Format Variants

Three sub-variants are detected by `JasonPageParser.ts`, distinguished by binary
signatures at the start of the file:

### Format 1 — Old

```
- word[0] == 0x0002
- bit 0 of byte[3] clear
- word at offset 4 = D1: must be even and non-zero
- word at offset D1 must be 0x0000
- Loop 23 iterations over words at offsets 2, 4, ..., 46:
    each word non-zero, bit 0 of low byte clear, word > D0
- word at offset 0x2E = D0; A0 += D0
- (A0) & 0x0F00 == 0x0F00  → old format (1)
```

### Format 2 — New

Same structural checks as Format 1, but the final test differs:

```
- (A0) & 0x0F00 != 0x0F00  → new format (2)
```

### Format 3 — Raw Binary

Identified by fixed magic values at specific offsets:

```
- word[0] == 0x0000
- u32BE at 0x80  == 0x00000000
- u32BE at 0x84  == 0x00000CBE
- u32BE at 0xCB6 == 0x000308BE
- u32BE at 0xCBA == 0x000309BE
- file must be at least 0xCBE bytes
```

---

## Sample Count

`MI_MaxSamples = 32` — the player supports up to 32 sample slots (sourced from
the `InfoBuffer` field in the UADE assembly source).

---

## UADE Configuration

```
eagleplayer.conf:
  JasonPage  prefixes=jpn,jpnd,jp
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/JasonPageParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/JasonPage/src/Jason Page_v5.s`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser identifies the format variant and creates instrument placeholder slots
(up to 32). UADE handles all audio synthesis using the embedded 68k player code.

**Format selection:** The three variants are checked in order. Format 3 (raw binary)
has the most precise fixed-offset fingerprints. Formats 1 and 2 require structural
walking through the file's internal pointer chain, mirroring the UADE `DTP_Check2`
routine logic.
