---
date: 2026-02-27
topic: game-music-creator-gmc-format
tags: [amiga, uade, pcm-sampler, format-research]
status: implemented
---

# Game Music Creator — `.gmc` Format

**Status:** Implemented. NATIVE_SAMPLER — full PCM extraction in DEViLBOX.

---

## Overview

Game Music Creator (GMC) is a 4-channel Amiga tracker format with ProTracker-compatible
pattern cells. It has no magic bytes and is detected by structural heuristics. Used in
several commercial Amiga games (e.g. Brides of Dracula, Jet Set Willy 2, Covert Action).

**Extension:** `.gmc`
**Magic bytes:** None — heuristic detection only
**UADE player:** `GameMusicCreator`
**Reference files:** Multiple files in `Reference Music/`
**DEViLBOX status:** `NATIVE_SAMPLER` — `GameMusicCreatorParser.ts` + `GMCParser.ts` + Sampler

---

## File Layout

```
Offset     Content
------     -------
0x000      15 × Sample header (16 bytes each = 240 bytes total)
0x0F0      3 zero bytes (padding, used for detection)
0x0F3      numOrders (uint8) — number of song positions (1–100)
0x0F4      100 × uint16 BE pattern offsets (200 bytes)
           Each value / 1024 = pattern index in the file
0x0DC/1BC  Pattern data (numPatterns × 1024 bytes)
           numPatterns = max(order values / 1024) + 1
x          Sample PCM data (sequentially, in sample header order)
```

Total header size = 444 bytes.

---

## Sample Header (16 bytes each, 15 slots at offset 0)

```
Bytes 0–3   (uint32 BE)  Start offset of sample data from file start
                         (absolute offset, valid in original Amiga memory; parser
                          recalculates from sequential PCM area)
Bytes 4–5   (uint16 BE)  Length in words (× 2 = length in bytes)
            (1 byte)     Zero (must be 0 — used for detection/validation)
Byte  7     (uint8)      Volume (0–64)
Bytes 8–11  (uint32 BE)  Original memory address (runtime, ignore in parser)
Bytes 12–13 (uint16 BE)  Loop length in words (× 2 = bytes; 2 = no loop = 4 bytes)
Bytes 14–15 (uint16 BE)  Data start (must be 0 or even — used for detection)
```

**Detection heuristic:**
- `bytes[240..242]` must all be 0
- `numOrders` (byte 243) in range 1–100
- All 15 sample headers pass field validation (length ≤ file_size, volume ≤ 64, dataStart must be 0 or even)

---

## Pattern Data

Position list (100 × uint16 BE at offset 0x0F4):
- Each entry is a raw byte offset into the pattern area → `patternIndex = offset / 1024`
- Patterns start at offset 444 (`HEADER_SIZE`)

Each pattern = **64 rows × 4 channels × 4 bytes = 1024 bytes**.

**Note cell format (4 bytes — standard ProTracker encoding):**

```
Byte 0: bits[7:4] = instrument high nibble; bits[3:0] = period high nibble
Byte 1: period low byte
Byte 2: bits[7:4] = instrument low nibble; bits[3:0] = effect type
Byte 3: effect parameter
```

Special encoding: `byte0 == 0xFF && byte1 == 0xFE` → note cut (XM note 97).

**Period-to-note mapping:** Standard Amiga ProTracker period table (C-2 = 856, etc.).

---

## Sample Data

Follows the last pattern. Sample N is stored at:
```
sampleBase + sum(length[0..N-1])
```
where `length[i] = sampleHeaders[i].lengthWords × 2`.

**Format:** 8-bit signed, mono, Amiga standard.
**Looping:** `loopLength > 2` (> 4 bytes) → sample loops from start to end.
  - Loop start = 0 (GMC always loops from beginning)
  - Loop end = `length`

---

## Effects

GMC uses a ProTracker-compatible effect set:

| Code | Name | Notes |
|------|------|-------|
| `0x00` | No effect / Arpeggio | |
| `0x01` | Portamento up | |
| `0x02` | Portamento down | |
| `0x03` | Tone portamento | |
| `0x04` | Vibrato | |
| `0x0A` | Volume slide | |
| `0x0B` | Position jump | |
| `0x0C` | Set volume | |
| `0x0D` | Pattern break | |
| `0x0F` | Set speed/BPM | |

---

## Instrument Parameters

| Parameter | Range | Notes |
|-----------|-------|-------|
| Volume | 0–64 | Amiga standard (64 = maximum) |
| Loop | loopLength > 4 bytes | Simple start-to-end loop |
| Playback rate | C-3 = 8287 Hz | PAL standard: `3546895 / (2 × period)` |

---

## DEViLBOX Implementation

Two parsers exist for this format:

### Primary: `src/lib/import/formats/GameMusicCreatorParser.ts`
- Heuristic detection (no magic bytes)
- Parses 15 sample headers, orders, patterns, PCM data
- Calls `createSamplerInstrument()` for all samples with data
- Used for `.gmc` extension routing

### Secondary: `src/lib/import/formats/GMCParser.ts`
- Alternative implementation with same format logic
- References OpenMPT `Load_gmc.cpp` as authoritative loader
- Uses ProTracker-style period decoding via `amigaNoteToXM()`

### Routing: `src/lib/import/parseModuleToSong.ts`

```
.gmc → GameMusicCreatorParser (native, heuristic) → Sampler instruments
       UADE fallback if parse fails
```

---

## Reference

- `Reference Music/` — test corpus
- `Reference Code/uade-3.05/players/GameMusicCreator` — UADE eagleplayer
- OpenMPT `Load_gmc.cpp` — authoritative reference loader
- Format spec: `docs/formats/Game Music Creator.txt`
