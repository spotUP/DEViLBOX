# Mark II (Mark I Sound System)

**Status:** DETECTION_ONLY — parser identifies format, synthesis falls back to UADE
**Parser:** None (UADE catch-all via `mk2`/`mkii` extension)
**Extensions:** `mk2.*`, `mkii.*`, UADE eagleplayer
**UADE name:** MarkII (prefixes=mk2,mkii)
**Reference files:** `Reference Music/Mark II/` (35 files total)
**Replayer source:** `docs/formats/Replayers/MarkII/` (MarkI.s, MarkI+.s stubs; player code in binary)

---

## Overview

Mark II (also known as "Mark I Sound System") is an Amiga 4-channel sample-based
tracker format. The format uses a position-list song structure with separate song,
pattern, sample table, and sample data blocks. Files are identified by the `"MRK1"`
magic bytes and use `.mk2` or `.mkii` filename prefixes.

The Replayers directory contains two assembly stubs (`MarkI.s`, `MarkI+.s`) with
inline format documentation. The `MarkIISoundSystem.s` and `MarkII.s` files are
wrapper stubs that reference the compiled player binary (`_adr_data`).

**Credit:** "MarkI Player - Coded by Vampire!" (PseudoDOS Group) — embedded string
in the replayer binary.

---

## File Layout

All offsets in the file are stored as absolute values relative to the start of
the module in memory (i.e., values must be adjusted to be file offsets).

```
Offset  Size  Description
------  ----  -----------
0x00    4     Magic: "MRK1"
0x04    2     Number of subsongs (uint16BE)
0x06    4     Offset to first song data (uint32BE)
0x0A    4     Offset to pattern data (uint32BE)
0x0E    4     Offset to sample table (uint32BE)
0x12    4     Offset to sample data (uint32BE)
0x16    ...   Song data, pattern data, sample table, sample data blocks
```

Total header size: 22 bytes (`"MRK1"` + uint16 + 4 × uint32).

---

## Song Data

Each subsong is a variable-length sequence of 4-voice position entries, terminated
by `0xFFFF`. The player supports multiple subsongs; each subsong starts at a
`0xFFFF`-delimited boundary within the song data block.

```
Per step (4 voices × 2 bytes = 8 bytes/step):
  byte  pattern number for voice 0
  byte  transpose for voice 0
  byte  pattern number for voice 1
  byte  transpose for voice 1
  byte  pattern number for voice 2
  byte  transpose for voice 2
  byte  pattern number for voice 3
  byte  transpose for voice 3

Terminator: 0xFF 0xFF (at the voice-0 pattern byte, signals end-of-sequence)
```

---

## Pattern Data

Each pattern entry is 98 (`0x62`) bytes. The pattern number in the song data is
multiplied by 98 to get the byte offset into the pattern data block.

```
Pattern entry (98 bytes):
  4 bytes per row, fixed row count
  Each row:
    byte  note value (0 = rest)
    byte  sample flags (bit 7 = arpeggio flag)
    byte  volume
    byte  instrument flags (bit 0 = loop control)
```

The exact row count is determined by `98 / 4 = 24` rows per pattern (4 channels
share one row, or 24 single-channel rows of 4 bytes each).

---

## Sample Table

Each sample table entry is 8 bytes:

```
Offset  Size  Description
------  ----  -----------
0x00    4     Offset to sample data (uint32BE, from sampledata base)
0x04    2     Unknown (possibly loop info)
0x06    2     Sample length (uint16BE, in words; ×2 for bytes)
```

Sample data is 8-bit signed PCM. Sample table is accessed with `index × 8`.

---

## Period Table

From the replayer source, Mark I uses a non-standard 42-entry period table (6
octaves):

```
$05A0, $054C, $0500, $04B8, $0474, $0434
$03F8, $03C0, $038A, $0358, $0328, $02FA
$02D0, $02A6, $0280, $025C, $023A, $021A
$01FC, $01E0, $01C5, $01AC, $0194, $017D
$0168, $0153, $0140, $012E, $011D, $010D
$00FE, $00F0, $00E2, $00D6, $00CA, $00BE
$00B4, $00AA, $00A0, $0097, $008F, $0087
```

Plus two null/marker entries. Period 0x05A0 = 1440 is the lowest note (below standard
ProTracker range of 856).

---

## Subsong Selection

The init routine accepts a subsong number in D0:

```
d0 = subsong number (0-based)
a0 = pointer to loaded module data
bsr init        ; initialize player for subsong d0
bsr play        ; advance one frame
bsr stop        ; stop audio
```

Multiple subsongs are common — songs often contain several independent tracks
within one file.

---

## Reference Implementations

- **Assembly stubs:** `docs/formats/Replayers/MarkII/MarkI.s`, `MarkI+.s`
- **Player stubs:** `docs/formats/Replayers/MarkII/MarkII.s`, `MarkIISoundSystem.s`
- **UADE player:** `Reference Code/uade-3.05/players/MarkII` (binary)

---

## Implementation Notes

**Current status:** DETECTION_ONLY — handled by UADE's MarkII eagleplayer. No native
DEViLBOX parser exists for Mark II.

**Path to NATIVE_SAMPLER:**
The format is sample-based (no software synthesis), making it a good candidate for
native extraction:
1. Parse the 22-byte header to get the four block offsets
2. Extract sample table entries (8 bytes each; length at offset 6)
3. Read PCM at each sample data offset
4. Build `createSamplerInstrument()` entries

The main complexity is that the binary offsets in the header are absolute Amiga
memory addresses — they need to be converted to file offsets by subtracting the
load base. The load base can be recovered from the `"MRK1"` magic position
(the header starts at offset 0, so the Amiga load address is the base for all
internal pointers).

Alternatively, for files from UADE's `players/MarkII` eagleplayer: the module
data itself (as extracted from the eagleplayer) should already have the offsets
relative to the start of the data block.
