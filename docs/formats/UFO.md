# UFO / MicroProse

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/UFOParser.ts`
**Extensions:** `MUS.*`, `UFO.*` (prefixes) or `*.mus`, `*.ufo`
**UADE name:** UFO
**Reference files:** `Reference Music/UFO/` (MicroProse game music — UFO: Enemy Unknown)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/UFO_v1.asm`

---

## Overview

UFO is a 4-channel Amiga music format created by MicroProse (1994), used in games
including *UFO: Enemy Unknown* (X-COM). It uses an **IFF-style structure** with a
custom `DDAT` form type, followed by a `BODY` chunk and a `CHAN` sub-chunk.

Two-file format: song data (`.mus` / `.ufo`) + samples (`SMP.set` companion file).

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0x00    4     "FORM" (0x464F524D) — IFF container magic
0x04    4     Total chunk size (u32BE)
0x08    4     "DDAT" (0x44444154) — custom form type (not standard IFF)
0x0C    4     "BODY" (0x424F4459) — body chunk ID
0x10    4     Body chunk size (u32BE)
0x14    4     "CHAN" (0x4348414E) — channel descriptor sub-chunk
0x18    ...   Channel + music data
```

---

## Detection

Based on `UFO_v1.asm DTP_Check2`:

```
bytes[0..3]   == "FORM"  (0x464F524D)
bytes[8..11]  == "DDAT"  (0x44444154)
bytes[12..15] == "BODY"  (0x424F4459)
bytes[20..23] == "CHAN"  (0x4348414E)
```

**Minimum file size:** 24 bytes.

The `DDAT` form type (non-standard IFF) is the distinguishing fingerprint — standard
IFF files use `FORM`/`ILBM`, `FORM`/`AIFF`, `FORM`/`8SVX`, etc., not `DDAT`.

---

## UADE Configuration

```
eagleplayer.conf:
  UFO  prefixes=mus,ufo
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/UFOParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/UFO_v1.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser validates the FORM/DDAT/BODY/CHAN structure and routes to UADE for playback.
The `MUS.*` / `UFO.*` filename prefix is the primary routing key. Audio is synthesized
by the UFO UADE eagleplayer using PCM samples from the companion `SMP.set` file.
