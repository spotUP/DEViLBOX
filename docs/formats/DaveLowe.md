# Dave Lowe (Uncle Tom)

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/DaveLoweParser.ts` (DL.* prefix)
           `src/lib/import/formats/DaveLoweNewParser.ts` (DLN.* prefix)
**Extensions:** `dl.*`, `DL.*`, `dln.*`, `DLN.*`, UADE eagleplayer
**UADE names:** DaveLowe, DaveLoweNew
**Reference files:** `Reference Music/Dave Lowe/` (46 files), `Reference Music/Dave Lowe New/` (42 files)
**Replayer references:**
  `Reference Code/uade-3.05/amigasrc/players/wanted_team/DaveLowe/src/Dave Lowe.s`
  `Reference Code/uade-3.05/amigasrc/players/wanted_team/DaveLowe/src/Dave Lowe_v3.asm`
  `Reference Code/uade-3.05/amigasrc/players/wanted_team/DaveLoweNew/src/Dave Lowe New_v2.asm`

---

## Overview

Dave Lowe (known as "Uncle Tom") composed music for many classic Amiga games including
Lure of the Temptress, Worlds of Legend, and Flight of the Amazon Queen. The modules
are compiled 68k Amiga executables combining player code, music data, and sample data
in a single self-contained file.

Two format variants exist:
- **Dave Lowe** (`DL.*`) — the original format
- **Dave Lowe New** (`DLN.*`) — an evolved version used in later titles

---

## Dave Lowe — Detection

The original format is detected by four specific 68k MOVE.L instructions at the
start of the file (from UADE `DaveLoweRipp1` in EagleRipper):

```
bytes[0..3]  = 0x21590032  (MOVE.L A1, ($32, A0))
bytes[4..7]  = 0x21590036  (MOVE.L A1, ($36, A0))
bytes[8..11] = 0x2159003A  (MOVE.L A1, ($3A, A0))
```

These three consecutive MOVE.L instructions appear at the start of all Dave Lowe
modules and serve as the reliable magic bytes for the format.

---

## Dave Lowe New — Detection

The newer format uses a more complex structural detection (from UADE
`Dave Lowe New_v2.asm`, `DTP_Check2` routine):

**Step 1 — Determine starting offset:**

| word[0] | long[24] | Starting offset |
|---------|----------|-----------------|
| 8       | any      | 8               |
| 4       | ≠ 0      | 4               |
| 4       | 0        | 8               |
| other   | —        | fail            |

**Step 2 — FirstCheck (4 iterations of 4-byte entries):**
- First word of entry must be 0x0000
- Second word of entry must be > 0, < 0x8000 (positive), and even (bit 0 clear)

**Step 3 — SecondCheck:** Dereference the 4 pointer entries from FirstCheck,
walk internal data structures to locate a pattern-start marker (word 0x000C / 12)
followed by word 0x0004.

---

## Format Structure

Both formats are single-file: **player code + music data + PCM samples** in one
binary blob. No separate sample file is required (unlike Richard Joseph).

The embedded samples are raw signed 8-bit PCM (Amiga Paula format). The player
routine manages Paula DMA registers directly from within the 68k code.

---

## Reference Implementations

- **Parser sources:** `src/lib/import/formats/DaveLoweParser.ts`, `DaveLoweNewParser.ts`
- **UADE player asm (original):** `Reference Code/uade-3.05/amigasrc/players/wanted_team/DaveLowe/`
- **UADE player asm (new):** `Reference Code/uade-3.05/amigasrc/players/wanted_team/DaveLoweNew/`

---

## Implementation Notes

**Current status:** DETECTION_ONLY (both variants)

Both parsers extract basic metadata (number of instruments inferred from the
format's internal table). UADE handles all audio synthesis.

The `DaveLoweNew` variant was used in later titles and differs in its internal
pointer-table structure, requiring a separate parser. Both parsers follow the
same UADE `DTP_Check2` logic but with different structural walking algorithms.
