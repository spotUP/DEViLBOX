# Images Music System

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/ImagesMusicSystemParser.ts`
**Extensions:** `IMS.*` (prefix-based)
**UADE name:** ImagesMusicSystem
**Reference files:** `Reference Music/Images Music System/` (13 files)
**Replayer reference:** `Reference Code/uade-3.05/players/ImagesMusicSystem`

---

## Overview

Images Music System (IMS) is an Amiga music format identified by a structural
signature at a fixed large offset (1080 bytes). The format stores pattern data
in 768-byte blocks with a pointer to the pattern region embedded at that offset.

Detection is ported from the `DTP_Check2` routine in the Wanted Team eagleplayer
`Images Music System_v3.asm`.

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0       950   MOD-like header region (sample names, lengths, etc.)
950     1     songLengthByte: must have bit 7 clear (< 0x80)
951     ...   Additional header data
1080    4     patternDataPtr (D1): u32BE — pointer to start of pattern data.
              Must be >= 1084. (D1 − 1084) must be divisible by 768.
D1      ...   Pattern data (768 bytes × number of patterns)
D1+4    ...   File must extend at least 4 bytes past D1
```

**Minimum file size:** 1852 bytes (to contain the header through offset 1080 + room
for at least one pattern pointer).

The 768-byte pattern stride (= 64 rows × 4 channels × 3 bytes/cell) is the primary
structural fingerprint that distinguishes IMS from MOD-like formats using 1024-byte
patterns (4 channels × 4 bytes).

---

## Detection Algorithm

```
1. buf.length >= 1852
2. D1 = u32BE(1080); require D1 >= 1084
3. (D1 − 1084) % 768 == 0              → pattern data size is divisible by 768
4. buf[950] < 0x80                      → song length byte bit 7 clear
5. buf.length >= D1 + 4                 → file extends past pattern data pointer
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/ImagesMusicSystemParser.ts`
- **Wanted Team asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/ImagesMusicSystem/src/Images Music System_v3.asm`
- **UADE player:** `Reference Code/uade-3.05/players/ImagesMusicSystem`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser validates the IMS structural layout and routes playback to UADE. The
`IMS.*` prefix is the primary routing key. Up to 31 sample placeholder instruments
are created.

The 1080-byte offset for the pattern data pointer corresponds to the end of the
standard 31-instrument MOD-style header (30 bytes × 31 samples = 930 bytes of
sample data, plus 128-byte order table, plus 22-byte song name = 1080 bytes total —
consistent with a MOD-derived format using 3-byte cells instead of 4-byte cells).
