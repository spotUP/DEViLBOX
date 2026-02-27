# Ron Klaren Sound Module

**Status:** NATIVE_SAMPLER — PCM samples extracted from Hunk binary; plays via Sampler engine
**Parser:** `src/lib/import/formats/RonKlarenParser.ts`
**Extensions:** `.rk` / `.rkb`
**UADE name:** (no UADE; native extraction)
**Reference files:** `Reference Music/Ron Klaren/` (9 files)
**Reference:** NostalgicPlayer `RonKlarenWorker.cs`

---

## Overview

Ron Klaren Sound Module is a 4-channel Amiga tracker format stored as an Amiga
HUNK-format executable. Files are identified by the standard Amiga HUNK magic
plus the 23-byte ASCII string `"RON_KLAREN_SOUNDMODULE!"` at offset 40.

The parser scans the embedded 68k machine code to locate song structure data:
sub-song count, CIA timer (for tempo), track list pointers, instrument offsets,
and arpeggio table. PCM sample data is extracted directly from the binary.

Reference: NostalgicPlayer `RonKlarenWorker.cs` (authoritative loader).

---

## File Layout

Ron Klaren files are Amiga HUNK executables. The player code is 68k machine code
that the parser reverse-engineers to locate embedded data structures.

```
Offset  Size  Description
------  ----  -----------
0x00    4     0x000003F3 — Amiga HUNK_HEADER magic
0x04    ...   HUNK structure (standard Amiga loader format)
0x28    23    "RON_KLAREN_SOUNDMODULE!" (ASCII signature at offset 40)
...     ...   68k player code (scanned for data structure offsets)
...     ...   Embedded PCM sample data
```

**Minimum file size:** 0xA40 bytes (2624 bytes) for the code scanning region.

---

## Detection Algorithm

```
1. buf.length >= 0xA40 (2624 bytes)
2. u32BE(0) == 0x000003F3                  → Amiga HUNK_HEADER magic
3. buf[40..62] == "RON_KLAREN_SOUNDMODULE!"  (23 bytes, exact ASCII match)
```

---

## Code Scanning

After detection, the parser scans the first `0xA40` bytes starting at offset 32
(the HUNK code section start) for:

- **Sub-song count:** Counts `MOVE.W #n,D0` instruction patterns before the main JSR dispatch table
- **CIA timer value:** Used to calculate BPM/tempo
- **Sub-song info offset:** Each sub-song has 4 × uint32BE track list pointers
- **Instrument offset:** Location of instrument/sample descriptor table in the binary
- **Arpeggio offset:** Location of arpeggio table

---

## Track Format

Variable-length command stream per channel:

```
0x00-0x7F  Note byte (0-based period table index) + waitCount byte
           waitCount == 0: trigger note immediately (no wait)
           waitCount >  0: trigger note, wait (waitCount x 4 - 1) ticks
0x80       SetArpeggio: + 1 byte arpeggio number
0x81       SetPortamento: + endNote(1) + increment(1) + waitCount(1)
...        Additional effect commands (format-specific)
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/RonKlarenParser.ts`
- **NostalgicPlayer:** `RonKlarenWorker.cs` (authoritative format reference)

---

## Implementation Notes

**Current status:** NATIVE_SAMPLER

The parser extracts sample data from the HUNK binary and creates `SamplerSynth`
instruments. Sub-song structure is parsed from scanned 68k instruction patterns.

The `"RON_KLAREN_SOUNDMODULE!"` signature at offset 40 (immediately following the
HUNK header) provides a unique and reliable identification for this format.
