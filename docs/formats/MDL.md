# MDL (Digitrakker)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/MDLParser.ts`
**Extensions:** `.mdl`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/Digitrakker/`

---

## Overview

Digitrakker MDL is a PC DOS tracker format by Harald Zappe. It uses a RIFF-style chunk
structure with 2-byte chunk IDs. The format features a shared track pool (referenced from
pattern tables), separate volume/panning/pitch envelopes per instrument, MDL delta
compression for sample data, and two simultaneous effects per cell.

Reference: OpenMPT `soundlib/Load_mdl.cpp`

---

## File Layout

### File Header (5 bytes)

```
Offset  Size  Description
------  ----  -----------
0       4     Magic: "DMDL"
4       1     Version (u8)
```

### Chunk Stream (after header)

Each chunk:
```
id (u16LE, 2-byte ASCII)
length (u32LE)
data[length bytes]
```

| Chunk ID | Description |
|----------|-------------|
| `IN`     | Info: song name, speed, tempo, order list, channel setup |
| `ME`     | Message: song message text |
| `PA`     | Pattern headers + track index table |
| `PN`     | Pattern names |
| `TR`     | Tracks: compressed per-channel track data |
| `II`     | Instruments |
| `VE`     | Volume envelopes |
| `PE`     | Panning envelopes |
| `FE`     | Frequency (pitch) envelopes |
| `IS`     | Sample info: headers, filenames, c5speed, loop points |
| `SA`     | Sample audio data (MDL-compressed) |

---

## Detection Algorithm

```
1. buf.byteLength >= 5
2. buf[0..3] == "DMDL"
```

---

## PA Chunk (Pattern Headers)

Each pattern entry:
```
numRows (u8)         — row count in this pattern
name (null-terminated string, from PN chunk)
numChannels × u16LE  — track indices into the TR pool (0 = empty track)
```

---

## TR Chunk (Track Encoding)

Each track in the pool uses a run-length encoding:

```
Each byte = (x << 2) | y  where:

y = 0: skip (x+1) empty rows
y = 1: repeat previous cell (x+1) times
y = 2: copy cell from row x (back-reference)
y = 3: new cell data; x = bitmask of fields present:
  bit 0 (MDLNOTE_NOTE):    note byte follows
                             note > 120 → key-off; else 1-based note index
  bit 1 (MDLNOTE_SAMPLE):  sample byte follows (1-based)
  bit 2 (MDLNOTE_VOLUME):  volume byte follows (0–64)
  bit 3 (MDLNOTE_EFFECTS): effects byte follows:
                             low nibble  = effect1 (MDL effect code)
                             high nibble = effect2 (MDL effect code)
  bit 4 (MDLNOTE_PARAM1):  param1 byte follows
  bit 5 (MDLNOTE_PARAM2):  param2 byte follows
```

Two simultaneous effects per cell (effect1+param1, effect2+param2).

---

## Effect Translation

MDL uses its own effect numbering, translated to XM/OpenMPT commands:

| MDL | Description |
|-----|-------------|
| 0   | None |
| 1   | Portamento up |
| 2   | Portamento down |
| 3   | Tone portamento |
| 4   | Vibrato |
| 5   | Arpeggio |
| 7   | Tempo (BPM) |
| 8   | Panning |
| 9   | S3M command extended |
| B   | Position jump |
| C   | Global volume |
| D   | Pattern break |
| F   | Speed |
| G   | Volume slide up |
| H   | Volume slide down |
| I   | Retrigger |
| J   | Tremolo |
| K   | Tremor |

---

## IS Chunk (Sample Headers)

Per sample:
```
name[32] (ASCII)
filename[8] (ASCII)
c5speed (u32LE)
length (u32LE, in samples)
loopStart (u32LE)
loopEnd (u32LE)
volume (u8, 0–64)
flags (u8): bit0=loop, bit1=bidi, bit2=16-bit, bit3-4=compression
panning (u8)
```

---

## SA Chunk (Sample Audio)

Sample data uses MDL delta compression when `flags & 0x0C != 0`:
- 8-bit samples: delta-coded bytes, then reconstruction via running sum
- 16-bit samples: delta-coded words (LE), same reconstruction

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/MDLParser.ts`
- **OpenMPT reference:** `soundlib/Load_mdl.cpp`
