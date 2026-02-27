# Jason Brooke

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/JasonBrookeParser.ts`
**Extensions:** `jcbo.*`, `jcb.*`, `jb.*`, UADE eagleplayer
**UADE name:** JasonBrooke
**Reference files:** `Reference Music/Jason Brooke/` (18 files)
**Replayer reference:**
  UADE eagleplayer: `JasonBrooke.library`

---

## Overview

Jason Brooke is an Amiga composer. This format uses **prefix-based detection only**
— there are no magic bytes in the file. Modules follow the UADE naming convention
where the format is identified entirely by the filename prefix.

---

## Detection

Pure prefix-based detection (no binary magic bytes):

```
Prefixes (checked longest-first to avoid jcb matching jcbo):
  jcbo.songname    ← checked first (longest prefix)
  jcb.songname
  jb.songname

Alternative extension format:
  songname.jcbo
  songname.jcb
  songname.jb
```

The longest prefix (`jcbo`) must be checked before the shorter `jcb` to avoid
false matches. No binary verification is performed.

---

## UADE Configuration

```
eagleplayer.conf:
  JasonBrooke  prefixes=jcbo,jcb,jb
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/JasonBrookeParser.ts`
- **UADE player:** `JasonBrooke.library`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

Since there are no magic bytes, this format relies entirely on filename conventions.
The parser returns a minimal stub song; all audio is handled by UADE via the
`JasonBrooke.library` eagleplayer binary.

This is an example of a "filename-only" format, contrasted with magic-byte formats
like TFMX or SoundMon. When ripping files from Amiga disk images, the prefix naming
convention (`jcbo.songname`) must be preserved for correct identification.
