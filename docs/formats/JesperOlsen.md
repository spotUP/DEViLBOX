# Jesper Olsen

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/JesperOlsenParser.ts`
**Extensions:** UADE eagleplayer (prefix-based detection in game directories)
**UADE name:** JesperOlsen
**Reference files:** `Reference Music/Jesper Olsen/` (38 files)
**Replayer reference:**
  `Reference Code/uade-3.05/amigasrc/players/wanted_team/JesperOlsen/src/Jesper Olsen_v1.asm`

---

## Overview

Jesper Olsen composed music for Amiga games in the early 1990s. The format is a
compiled 68k Amiga executable. Three sub-variants exist (Format 0, 1, and -1/latest),
distinguished by the binary structure at the start of the file. Detection mirrors the
Wanted Team EaglePlayer `DTP_Check2` routine.

---

## Format Variants

### Format -1 (New / Latest)

Detected when `word[0]` is NOT `0x6000`:

```
- word[0] (D1) must be in range [4, 0x200] (inclusive) and even
- Loop (D1 / 2 - 1) iterations:
    read word[2 + i*2], must be:
      > 0 (non-zero)
      even (bit 0 clear)
      data[word[2+i*2] - 2] == 0x7FFF  (sentinel check)
```

The `0x7FFF` sentinel is a ProTracker-era "end of pattern" marker that appears
at the end of each sub-table in this format.

### Format 1 (Old / Second)

Detected when `word[0] == 0x6000` (BRA opcode):

```
- Three consecutive pairs at A0+0, A0+2, A0+4 must be:
    0x6000 + positive-even offset (BRA forward)
- Navigate to song body via: A0+6, add word
- Check sequence: 0x4A406B00 / 0x000641FA
- Navigate further → check word[4] == 0x017FFF
```

The `0x017FFF` is again the ProTracker-era pattern sentinel marker.

### Format 0 (Oldest / Third)

Falls through from Format 1 when the `0x4A40...` test fails:

```
Sub-variant a:
  word at A0 is 0xC0FC → scan forward for sync marker 0x6AE064E0

Sub-variant b:
  scan up to 16 words for 0x02800000 →
  check 0x00FFC0FC →
  scan for 0x6AE064E0 within 800–900 bytes of current position
```

---

## Format Structure

Jesper Olsen modules are **single-file** compiled 68k executables containing all
player code, music data, and PCM samples. No separate sample companion file.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/JesperOlsenParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/JesperOlsen/src/Jesper Olsen_v1.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser creates placeholder instrument slots and identifies the format variant.
UADE handles all 68k player execution and audio synthesis.

Detection order: Format -1 first (no leading BRA), then Format 1 and 0 (both start
with BRA 0x6000). The `0x7FFF` ProTracker sentinel values serve as reliable
cross-variant identification markers.
