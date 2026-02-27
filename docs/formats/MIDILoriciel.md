# MIDI Loriciel

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/MIDILoricielParser.ts`
**Extensions:** `MIDI.*`, `midi.*`, UADE eagleplayer
**UADE name:** MIDI-Loriciel
**Reference files:** `Reference Music/MIDI-Loriciel/` (44 files)
**Replayer reference:**
  `Reference Code/uade-3.05/amigasrc/players/MIDI - Loriciel_v1.asm`

---

## Overview

MIDI Loriciel is a format used in some French Amiga games by Loriciel. It plays
**standard MIDI files** (Format 0 or Format 1) using a proprietary Amiga MIDI bank —
not General MIDI. The UADE player uses a built-in bank of Amiga PCM instruments to
synthesize the MIDI events.

Detection is essentially a **MIDI file validator**: the parser checks that the file
is a valid MIDI Format 0 or Format 1 file with at least one track.

---

## Detection

Based on `MIDI - Loriciel_v1.asm` `DTP_Check2` routine — validates standard MIDI
header fields:

```
bytes[0..3] = "MThd"              → MIDI header chunk magic
u32BE at 4  == 6                  → MIDI header length (always 6)
u16BE at 8  ∈ {0, 1}             → MIDI format: 0 (single track) or 1 (multi-track)
u16BE at 10 != 0                  → track count > 0
u16BE at 12 != 0                  → division/tempo word > 0
bytes[14..17] = "MTrk"            → first track chunk magic
```

Minimum file size: 22 bytes (14-byte MThd chunk + 4 bytes for `MTrk` header + overhead).

---

## MIDI File Structure (for reference)

Files are standard SMF (Standard MIDI File) format:

```
Offset  Size  Description
------  ----  -----------
0x00    4     "MThd" — header chunk ID
0x04    4     Header length: always 6 (u32BE)
0x08    2     Format: 0 (single track) or 1 (multi-track) (u16BE)
0x0A    2     Track count (u16BE)
0x0C    2     Division: ticks per quarter note (u16BE)
0x0E    4     "MTrk" — first track chunk ID
0x12    4     First track length (u32BE)
0x16    ...   Track event data
```

---

## Synthesis

MIDI Loriciel files are standard SMF files; the audio is synthesized by the UADE
Loriciel player using a proprietary Amiga PCM instrument bank rather than
General MIDI instruments. The timbre is therefore Amiga-specific and will sound
different from General MIDI renditions.

---

## UADE Configuration

```
eagleplayer.conf:
  MIDI-Loriciel  prefixes=MIDI
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/MIDILoricielParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/MIDI - Loriciel_v1.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

Since the files are standard MIDI (SMF), the DEViLBOX MIDI Loriciel parser acts
as a MIDI format validator, accepting only Format 0/1 MIDI files. UADE provides
the proprietary Amiga bank and synthesizes audio using its embedded PCM samples.

**Note:** These are not General MIDI files — the `MIDI.*` prefix (used in game disk
directories) distinguishes them from general-purpose MIDI files.
