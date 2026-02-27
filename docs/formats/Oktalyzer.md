# Oktalyzer

**Status:** NATIVE_SAMPLER — PCM samples via Sampler engine
**Parser:** `src/lib/import/formats/OktalyzerParser.ts`
**Extensions:** `okt`, UADE eagleplayer
**Replayer source:** `docs/formats/Replayers/Oktalyzer/Oktalyzer_v1.1.s`
**Reference files:** `Reference Music/Oktalyzer/`

---

## Overview

Oktalyzer is an 8-channel Amiga tracker using IFF (Interchange File Format) chunk
structure. Despite the IFF chunks, Oktalyzer files do **not** use an IFF FORM wrapper —
they begin directly with the magic string `OKTASONG` (8 bytes), followed by raw IFF-style
chunks. Supports up to 8 channels (4 stereo pairs), amplitude control, and ProTracker-
compatible effects.

---

## File Layout

```
Offset  Size      Description
------  --------  -----------
0x00    8         Magic: "OKTASONG"
0x08    ?         IFF-style chunks (no FORM header — just raw 4CC + length + data blocks)
```

### Chunk Order (canonical)

| Chunk | Description |
|-------|-------------|
| `CMOD` | 8 bytes — 4 × u16BE channel pair modes: 0=stereo pair, 1=mono-left, 2=mono-right |
| `SAMP` | Sample headers (32 bytes each): name[20], length[4], loopStart[4], loopEnd[4], pad[2], volume[2] |
| `SPEE` | 2 bytes — Tempo (ticks per row) |
| `SLEN` | 2 bytes — Song length (number of positions) |
| `PLEN` | 2 bytes — Pattern count |
| `PATT` | SLEN bytes — Song sequence (position → pattern index) |
| `PBOD` | Per-pattern body chunks (one per pattern): 4 bytes per channel-row |
| `SBOD` | Per-sample PCM chunks (one per non-empty sample, 8-bit signed) |

---

## Sample Headers (SAMP chunk, 32 bytes each)

```
Offset  Size  Description
------  ----  -----------
0x00    20    Sample name (null-padded ASCII)
0x14    4     Sample length in bytes
0x18    4     Loop start in bytes
0x1C    4     Loop end in bytes (exclusive; loop length = end - start)
0x20    2     Padding
0x22    2     Volume (0–64)
```

**Sample names** are at offset 0x00 (20 bytes). Use these as instrument display names.

---

## Pattern Data (PBOD chunks)

Each PBOD chunk covers one pattern. Each row of the pattern is:
`numChannels × 4 bytes = 32 bytes` (for 8 channels).

Row format per channel (4 bytes):
```
Byte 0: Note (0 = empty; 1-based note index)
Byte 1: Sample number (0 = none; 1-based)
Byte 2: Effect command
Byte 3: Effect argument
```

Standard ProTracker effects (arpeggio, slide, volume, etc.) are supported.

---

## Reference Implementations

- **Replayer:** `docs/formats/Replayers/Oktalyzer/Oktalyzer_v1.1.s`
- **External reference:** https://wiki.multimedia.cx/index.php/Oktalyzer

---

## Implementation Notes

**Current status:** NATIVE_SAMPLER — `OktalyzerParser.ts` extracts sample names and PCM
data from SAMP+SBOD chunks, creating `'Sampler'` instruments.

Loop handling: `loopLength = loopEnd - loopStart`. If `loopLength <= 2` (words ≤ 1),
treat as no-loop (one-shot). The SBOD chunk for a sample contains exactly
`ceil(sampleLength / 2) * 2` bytes of 8-bit signed PCM.
