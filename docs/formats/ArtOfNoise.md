---
date: 2026-02-27
topic: art-of-noise-aon-format
tags: [amiga, uade, pcm-sampler, chunk-format, format-research]
status: analyzed
---

# Art Of Noise — `.aon` / `.aon4` / `.aon8` Format

**Status:** Analyzed. Chunk-based format with full instrument data extractable.

---

## Overview

Art of Noise (AoN) is a proprietary Amiga music format by **Bastian Spiegel (Twice/Lego)**.
It is a chunk-based binary format similar to IFF. Files contain song name, author, instruments
with PCM samples, pattern data, and a song sequence.

**Extensions:**
- `.aon`, `.aon4` — 4-voice version (uses standard Paula hardware)
- `.aon8` — 8-voice version (uses mixed or emulated extra channels)

**Magic bytes:** `41 4F 4E 34` = ASCII `AON4` (at offset 0x00)

**Eagleplayer binaries:**
- `ArtOfNoise-4V` — 8.5 KB (medium complexity)
- `ArtOfNoise-8V` — 26.3 KB (large, extra voice mixing)

**UADE 68k source:** `Reference Code/uade-3.05/amigasrc/players/artofnoise/ArtofNoise.s`

---

## Binary Structure

### File Layout

```
Offset  Content
------  -------
0x0000  4 bytes     "AON4" magic
0x0004  variable    Author string (null-terminated ASCII, embedded by composer tool)
          e.g. "artofnoise by bastian spiegel (twice/lego)\0"
0x002E+  Chunks      IFF-style chunks (see below), until end of file
```

The author string at offset 0x0004 is always `"artofnoise by bastian spiegel (twice/lego)"` (42 chars + null = 43 bytes), so chunks always start at offset 0x002F... but the actual offset varies because the string is terminated by the first null byte. In all files analyzed, the first chunk `NAME` started at offset 0x002E (with the null at 0x002D).

**Safe approach:** Start scanning for chunks from offset 0x04 until the first recognized 4-byte tag is found.

### Stonecracker-packed files

Some `.aon` files are prefixed with `S404` (Stonecracker v4.04 packed data). The file must be
decompressed before parsing. The magic check in the eagleplayer handles this:
```
cmp.l  #"S404", (a0) → decompress first
cmp.l  #"AON4", (a0) → parse directly
```

---

## Chunk Format

Each chunk follows IFF conventions:
```
Offset  Size  Content
------  ----  -------
0       4     Tag (ASCII, e.g. "NAME", "INST", "WAVE")
4       4     Length (big-endian uint32, NOT including the 8-byte header)
8       N     Data (N bytes)
8+N     0-1   Padding byte if N is odd (to align to word boundary)
```

### Known Chunks

| Tag    | Description                                    | Typical Size      |
|--------|------------------------------------------------|-------------------|
| `NAME` | Song title (null-terminated ASCII)             | 8–32 bytes        |
| `AUTH` | Author name (null-terminated ASCII)            | 8–32 bytes        |
| `DATE` | Composition date (null-terminated ASCII)       | 8–16 bytes        |
| `RMRK` | Remarks/comment (null-terminated ASCII)        | 0–256 bytes       |
| `INFO` | Global settings (4 bytes, see below)           | 4 bytes           |
| `ARPG` | Arpeggio sequences table                       | 64 bytes          |
| `PLST` | Song playlist (pattern indices, 1 byte each)   | variable          |
| `PATT` | Pattern data (all patterns concatenated)       | N × 1024 bytes    |
| `INST` | Instrument definitions                         | N × 16 bytes      |
| `INAM` | Instrument names (often empty/zero-filled)     | 1952 bytes        |
| `WLEN` | Waveform lengths (repeat_offset + length pairs)| 256 bytes         |
| `WAVE` | Raw PCM waveform data (signed 8-bit, concatenated) | variable     |

---

## Chunk Details

### INFO (4 bytes)

```
Byte 0: Initial speed/CIA timer (0x34 = 52 in all files analyzed)
Byte 1: Number of song positions (matches PLST length)
Byte 2: 0 (reserved)
Byte 3: 0 (reserved)
```

**Note:** The `initial speed` value 0x34 = 52 is passed to the AoN replayer as the starting
CIA timer value, which controls playback speed.

### PLST (Song Playlist)

Array of 1-byte pattern indices defining the playback order. Length = INFO[1].

```
Example: [0, 1, 2, 3, 4, 5, 7, 1, 2, 3, 4, 8, 9, 10]
         Pattern 6 is unused (not in playlist, but exists in PATT)
```

### PATT (Pattern Data)

All patterns concatenated. Each pattern = **4 channels × 64 rows × 4 bytes per note** = 1024 bytes.

**Note format (4 bytes per note):**
```
Byte 0: Note  — packed as (octave_nibble << 4) | note_in_octave
         0x00 = empty (no note)
         High nibble = octave (0–3)
         Low nibble  = note in octave (0=C, 1=C#, 2=D, ..., 11=B)
         e.g. 0x32 = octave 3, note 2 = D3
              0x35 = octave 3, note 5 = F3
              0x22 = octave 2, note 2 = D2

Byte 1: Instrument (1-based index, 0 = no instrument / keep previous)

Byte 2: Effect number (ProTracker-compatible)
         0x00 = no effect
         0x01 = slide up
         0x02 = slide down
         0x03 = tone portamento
         0x0E = extended effects
         0x0F = set speed/BPM

Byte 3: Effect parameter
```

**Empty cell:** `00 00 00 00` = no note, no instrument, no effect.

### INST (Instrument Definitions)

Each instrument = **16 bytes**. Number of instruments = INST_chunk_length / 16.

```
Bytes 0–1 (uint16): Volume (0–64, where 64 = maximum)
Bytes 2–3 (uint16): Waveform index (0-based, indexes into WLEN/WAVE)
Bytes 4–9         : Unknown (ADSR? synthesis params? Zero in all analyzed files)
Bytes 10–11       : Unknown (appears to be 0x05xx values, possibly base period?)
Bytes 12–15       : Unknown (zero in analyzed files)
```

Example instruments from `action section.aon`:
```
Inst 1: vol=64, waveIdx=0, unk10=0x05D5
Inst 3: vol=64, waveIdx=1, unk10=0x054C
```

### INAM (Instrument Names)

1952 bytes. Usually zero-filled. When populated, contains null-terminated strings for instrument
names. The stride between entries is unclear — appears to be 64 bytes per entry when used,
giving space for 30 instrument names. Often contains references to source sample filenames
(e.g. "FutureComposer3.iff") rather than human-readable instrument names.

**Practical approach:** Read null-terminated strings at stride 64. If INAM is all-zeros,
generate names like "Instrument N".

### WLEN (Waveform Lengths)

256 bytes = 64 waveform entries × 4 bytes each:
```
Per entry (big-endian):
  Bytes 0–1 (uint16): Repeat offset (word offset from start of waveform for loop)
  Bytes 1–2 (uint16): Waveform length in bytes
```

**Parsing waveforms from WAVE chunk:**
- Accumulate offsets: wave N starts at sum of lengths[0..N-1]
- An entry with length=0 means no waveform (slot unused)

Example from `action section.aon`:
```
WLEN entry 0: repeat=0, length=2986  → waveform 0: WAVE[0..2985]
WLEN entry 1: repeat=0, length=2712  → waveform 1: WAVE[2986..5697]
WLEN entry 2: repeat=0, length=2096  → waveform 2: WAVE[5698..7793]
...
Sum of all lengths = 16096 = WAVE chunk size ✓
```

### WAVE (Waveform Data)

Raw PCM audio, signed 8-bit, mono. Amiga standard. Waveforms are stored concatenated in the
order they appear in WLEN. Each waveform plays at a period determined by the pattern note data.

**Playback:** On the Amiga, waveform data is loaded into Paula DMA. The period register
determines playback frequency. Standard Amiga formula: `frequency = 3546895 / period` (PAL).

---

## ARPG (Arpeggio Sequences)

64 bytes = 8 arpeggio sequences × 8 bytes per sequence. Each byte = semitone offset (0–11).
Arpeggio sequences are triggered by effect 0x00 with a non-zero parameter.

---

## Instrument Format for DEViLBOX

```typescript
export interface ArtOfNoiseConfig {
  volume: number;        // 0–64
  waveformIndex: number; // 0-based index into WLEN/WAVE
  waveformData: number[]; // raw PCM bytes (signed 8-bit) for this waveform
  repeatOffset: number;  // loop start offset in bytes (0 = no loop or loop from start)
  waveformLength: number; // sample length in bytes
}
```

---

## File Examples

| File | Size | Instruments | Patterns | Positions | WAVE |
|------|------|-------------|----------|-----------|------|
| `DSN/action section.aon` | 30,088 B | 16 | 11 | 14 | 16,096 B |
| `DSN/money in honey.aon` | 20,865 B | 18 | 7 | 8 | 8,515 B |
| `DSN/picket fences.aon` | 10,684 B | — | — | — | — |
| `Pink/the art of noise.aon` | ? | 8 | 1 | 2 | 512 B |

---

## Implementation Approach

### Step 1 — TypeScript Parser (DETECTION + sample extraction)

`src/lib/import/formats/ArtOfNoiseParser.ts`

```typescript
// 1. Verify "AON4" magic
// 2. Skip to first chunk (scan from offset 4 for a known tag)
// 3. Parse all chunks, store in a map
// 4. Extract NAME → song title
// 5. Extract AUTH → author
// 6. Extract INST → N instruments (volume, waveformIndex)
// 7. Extract WLEN → N waveform lengths + repeat offsets
// 8. Extract WAVE → concatenated PCM data; split using WLEN
// 9. For each instrument: emit ArtOfNoiseSynth config with PCM data
```

### Step 2 — WASM Synth

A simple PCM playback synth:
- `synth_set_instrument()`: receives instrument config (PCM bytes, loop points)
- `synth_note_on()`: triggers playback at given Amiga period
- `synth_render()`: outputs audio by reading PCM + applying volume

### Reference

- `Reference Code/uade-3.05/amigasrc/players/artofnoise/ArtofNoise.s` — UADE wrapper source
- `Reference Code/uade-3.05/amigasrc/players/artofnoise/ArtofNoise8.s` — 8-voice variant
- Files in `Reference Music/Art Of Noise/` — test corpus

---

## Open Questions

1. **INST bytes 4–15**: What are the additional synthesis parameters? ADSR? Fine-tuning?
2. **INFO byte 0 = 52**: Exact CIA timer formula to convert to BPM?
3. **ARPG format**: What exactly are the 8 bytes per arpeggio sequence?
4. **AON8**: Does the 8-voice format use the same chunk structure? Likely yes, with an extra
   mixing parameter.
5. **INAM stride**: Is it always 64 bytes per instrument name? Needs more test files.
