# Richard Joseph Player

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/RichardJosephParser.ts`
**Extensions:** `rjp.*`, `RJP.*`, `sng.*`, `SNG.*`, UADE eagleplayer
**UADE name:** RichardJoseph, Richard_Joseph
**Reference files:** `Reference Music/Richard Joseph/` (154 files)
**Replayer reference:**
  `Reference Code/uade-3.05/amigasrc/players/wanted_team/RichardJosephPlayer/src/Richard Joseph Player_v2.asm`

---

## Overview

Richard Joseph Player is a 4-channel Amiga PCM-sample music format created by
Richard Joseph and Andi Smithers (1992–93). Richard Joseph was a prolific Amiga
game composer known for James Pond 2, Worms, and many other Ocean/Renegade titles.

The format is a **two-file** system:
- **Song data:** `RJP.songname` or `songname.SNG`
- **Sample data:** `SMP.songname` or `songname.INS` or `SMP.set` (James Pond 2 AGA)

`RichardJosephParser.ts` parses the song data file only. The sample companion file
is not loaded at the parser level; playback always falls back to UADE which handles
both files.

---

## File Layout — Song Data File

```
Offset  Size  Description
------  ----  -----------
0x00    3     Magic: "RJP" (0x52, 0x4A, 0x50)
0x03    1     Version byte (any)
0x04    4     "SMOD" tag (0x53, 0x4D, 0x4F, 0x44)
0x08    4     samples_table_size (u32BE) = numSamples × 32
0x0C    4     Must be 0 (uninitialized SMP file pointer — identity check)
0x10    ...   Sample descriptors (32 bytes each × numSamples)
```

**Sample descriptor (32 bytes):**
```
+0..+3    u32BE   sample start offset in SMP file (0 at rest)
+4..+7    u32BE   additional SMP file pointer
+16..+17  u16BE   loop start (in words)
+18..+19  u16BE   loop size (in words)
+26..+27  u16BE   sample length (in words)
```

Following the sample table:
```
[12+S]   u32BE   intermediate chunk size (skip this many bytes + 4)
[12+S+4+skip]  u32BE  subsong_table_size = numSubsongs × 4
[...]    numSubsongs × 4-byte subsong pointers (u32BE each)
[...]    Pattern data, sequence data, note data (variable layout)
```

---

## Detection

```
buf[0..2] = "RJP"  AND  buf[4..7] = "SMOD"  AND  u32BE(buf, 0x0C) = 0
```

The zero at 0x0C is required: it represents an uninitialized pointer that would be
filled at load time. Its presence as zero confirms this is an unloaded module on disk.

---

## Subsong Count

Derived from the subsong table size: `numSubsongs = u32BE(buf, offset) / 4`.
Each subsong is an absolute pointer into the song data.

---

## Sample Format

Samples are raw signed 8-bit PCM stored in the companion `SMP.*` / `INS.*` file.
Loop points are stored in words (multiply by 2 for byte offsets). UADE loads both
files together and handles Paula DMA register setup for playback.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/RichardJosephParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/RichardJosephPlayer/src/Richard Joseph Player_v2.asm`
- **Format notes:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/Richard Joseph/EP_RJoseph.readme`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser extracts the number of instruments and subsongs from the song data file.
All instrument slots are created as metadata-carrying placeholders. The SMP/INS
companion file is not loaded in this parser — UADE requires both files for audio.

**Companion file loading:** DEViLBOX's UADE integration attempts to locate
`SMP.songname` or `songname.INS` alongside the song file at load time.
