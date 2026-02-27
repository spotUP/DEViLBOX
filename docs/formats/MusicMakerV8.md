# Music Maker V8 (4V / 8V)

**Status:** NATIVE_SAMPLER — parser extracts PCM samples, uses Sampler engine
**Parser:** `src/lib/import/formats/MusicMakerParser.ts`
**Extensions:** `mm4.*`, `sdata.*` (4-voice), `mm8.*` (8-voice), UADE eagleplayer
**Replayer source:** UADE `amigasrc/players/music_maker/MusicMaker4.asm` and `MusicMaker8.asm`
**Reference files:** `Reference Music/MusicMaker V8/` (70 files)

---

## Overview

Music Maker V8 (also Music Maker 4V) is an Amiga IFF-based tracker format from around
1990, authored by Thomas Winischhofer (BSD license). Two variants exist:
- **MMV4 (4-voice):** IFF FORM with `MMV4` type; eagleplayer prefixes `mm4.*`, `sdata.*`
- **MMV8 (8-voice):** IFF FORM with `MMV8` type; eagleplayer prefix `mm8.*`

Both variants use the same IFF chunk structure. Instruments reference Amiga IFF
sound samples by library path (e.g., `"System:Instruments/egit2"`).

---

## File Layout

The format uses standard IFF FORM container:

```
Offset  Size  Description
------  ----  -----------
0x00    4     "FORM"
0x04    4     Total size (big-endian)
0x08    4     Type: "MMV4" or "MMV8"
0x0C    ...   IFF chunks (until end of file)
```

### IFF Chunks

#### `SDAT` — Song Data

```
4 bytes: Internal data size
2 bytes: Song ID (0x5345 = 'SE' = MMV8_SONGID)
20 bytes: Song name (ASCII, null-padded)
... (additional song data follows)
```

#### `INST` — Instrument Data

```
Optional SEI1 header:
  4 bytes: "SEI1"
  2 bytes: "XX" marker
  2 bytes: Instrument count (uint16)

N × 8-byte instrument entries:
  [0-1] uint16  Sample length in bytes (0 = empty slot)
  [2-3] uint16  Repeat length in bytes (0 = one-shot)
  [4-5] uint16  Loop start in bytes (offset from sample start to loop point)
  [6-7] uint16  Loop length in Amiga 16-bit words

4 bytes: "defsnd" block header (skipped)
N × PCM data blocks: consecutive signed 8-bit PCM, one block per non-empty instrument
```

#### `INAM` — Instrument Names

```
4-byte header:
  2 bytes: Entry size (typically 60)
  2 bytes: Name offset within each entry (typically 36)

Per entry (entry_size bytes):
  At offset name_offset: Sample name (24-byte ASCII, typically an Amiga library path)
  e.g., "System:Instruments/egit2"
```

The first N entries of `INAM` map 1:1 to the N instrument slots in `INST`.
Instrument names are the 24-byte strings at the name offset within each entry.

---

## Sample PCM Extraction

From the `INST` chunk:
- For each instrument entry where `sampleLength > 0`:
  - Sample data is 8-bit signed PCM
  - Length in bytes = `sampleLength` (as stored)
  - Loop: if `repeatLength > 0`, the sample loops; loopStart = `loopStartBytes`
  - One-shot: `repeatLength == 0`

Names come from the `INAM` chunk, 24-byte entries at offset `nameOffset`.

---

## Song Arrangement

The `SDAT` chunk contains the song arrangement data — sequence of pattern references
and per-voice assignments. The song format follows a pattern-based structure
(4 or 8 voices) where each position references a block/pattern and a transpose value.

Full song data parsing is handled by the UADE eagleplayer for synthesis. The native
parser extracts instrument names and PCM data for the Sampler engine.

---

## Reference Implementations

- **UADE replayer source:** `Reference Code/uade-3.05/amigasrc/players/music_maker/MusicMaker4.asm`
- **UADE replayer source:** `Reference Code/uade-3.05/amigasrc/players/music_maker/MusicMaker8.asm`
- **Parser:** `src/lib/import/formats/MusicMakerParser.ts`

---

## Implementation Notes

**Current status:** NATIVE_SAMPLER — `MusicMakerParser.ts` extracts instrument names
from the `INAM` chunk and PCM samples from the `INST` chunk via `createSamplerInstrument()`.

The IFF container structure makes this format relatively straightforward to parse.
Instrument names are Amiga library paths (e.g., `"System:Instruments/egit2"`) which
serve as display names in the UI.
