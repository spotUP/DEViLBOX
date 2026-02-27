# Symphonie / Symphonie Pro

**Status:** FULLY_NATIVE — custom SymphonieSynth WASM engine
**Parser:** `src/lib/import/formats/SymphonieProParser.ts`
**Extensions:** `symmod.*`, UADE eagleplayer
**UADE name:** Symphonie, SymphoniePro
**Reference files:** `Reference Music/Symphonie/` (174 files)
**Reference source:** OpenMPT `soundlib/Load_symmod.cpp` (authoritative)

---

## Overview

Symphonie is an Amiga tracker with a structured chunk-based format. Symphonie Pro is
an enhanced version adding stereo-detune, stereo-phase, and sample-boost features.
Both variants share the `"SymM"` magic identifier and the same chunk stream layout;
Symphonie Pro is distinguished by the presence of positive chunk IDs (10, 11, 12).

Files use PCM samples stored as raw or delta-compressed blocks within the chunk stream.
The `SymphonieSynth` WASM engine handles synthesis directly from the parsed chunk data.

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0x00    4     Magic: "SymM"
0x04    4     Version: uint32BE (must be 1)
0x08    4     First chunk ID: int32BE (must be -1 = NumChannels)
0x0C    4     numChannels: uint32BE (1–256)
0x10    ...   Chunk stream until EOF
```

**Total header: 16 bytes.** The `numChannels` field in the header is the NumChannels
chunk value, inlined to simplify parsing. All subsequent data is chunk-based.

---

## Chunk Stream

Each chunk starts with a signed 4-byte type (int32BE), followed by data that is either
a 4-byte inline value or a length-prefixed packed block.

### Chunk Types

| ID  | Name           | Data |
|-----|----------------|------|
| -1  | NumChannels    | uint32BE — consumed in file header |
| -2  | TrackLength    | uint32BE — rows per track (max 1024) |
| -3  | PatternSize    | uint32BE — skip |
| -4  | NumInstruments | uint32BE — skip |
| -5  | EventSize      | uint32BE — must be 4 (bytes per event) |
| -6  | Tempo          | uint32BE — BPM = `floor(1.24 × min(val, 800))` |
| -7  | ExternalSamples| uint32BE — skip |
| -10 | PositionList   | packed array of SymPosition (32 bytes each) |
| -11 | SampleFile     | length-prefixed raw PCM sample blob |
| -12 | EmptySample    | no data; increments sample counter |
| -13 | PatternEvents  | packed array of SymEvent (4 bytes each) |
| -14 | InstrumentList | packed array of SymInstrument (256 bytes each) |
| -15 | Sequences      | packed array of SymSequence (16 bytes each) |
| -16 | InfoText       | packed text (first line used as song name) |
| -17 | SamplePacked   | delta-compressed 8-bit PCM sample |
| -18 | SamplePacked16 | block-delta-compressed 16-bit PCM sample |
| -19 | InfoType       | skip |
| -20 | InfoBinary     | skip |
| -21 | InfoString     | skip |
| 10  | SampleBoost    | uint32BE — normalisation factor (**Symphonie Pro marker**) |
| 11  | StereoDetune   | uint32BE — skip (**Symphonie Pro marker**) |
| 12  | StereoPhase    | uint32BE — skip (**Symphonie Pro marker**) |

Positive chunk IDs (10–12) indicate a **Symphonie Pro** file.

---

## Packed Block Format

Chunks that store arrays (PositionList, PatternEvents, InstrumentList, Sequences,
InfoText, SamplePacked) use a length-prefixed block:

```
uint32BE  packedLength
then either:
  "PACK\xFF\xFF"  →  packed (RLE)
    uint32BE  unpackedLength
    RLE payload
  else  →  raw bytes (packedLength bytes)
```

### RLE Encoding

The RLE stream consists of typed commands (int8):

| Code | Meaning |
|------|---------|
|  0   | `uint8 count` + `count` raw bytes — copy verbatim |
|  1   | `uint8 count` + `uint32 dword` — repeat dword `count` times |
|  2   | `uint32 dword` — write dword twice |
|  3   | `uint8 count` — write `count` zero bytes |
| -1   | End of stream |

---

## Data Structures

### SymEvent (4 bytes per event)

```
Offset  Size  Description
------  ----  -----------
0x00    1     command (uint8) — 0 = note, other values = special commands
0x01    1     note (int8) — note index 0–84; maps to output note = symNote + 25
0x02    1     param (uint8) — command parameter
0x03    1     inst (uint8) — instrument number (1-based)
```

**Note mapping:** `symNote 0–84` → output note `25–109` (1-based, C-0 offset).
This places note 0 at C-2 in XM/ProTracker notation.

---

### SymSequence (16 bytes)

```
Offset  Size  Description
------  ----  -----------
0x00    2     start (uint16BE) — event start index in pattern
0x02    2     length (uint16BE) — number of events
0x04    2     loop (uint16BE) — loop point
0x06    2     info (int16BE) — sequence flags/info
0x08    2     transpose (int16BE) — global semitone transpose
0x0A    6     padding
```

---

### SymPosition (32 bytes)

The song arrangement. Each position references a pattern to play.

```
Offset  Size  Description
------  ----  -----------
0x00    4     dummy (skip)
0x04    2     loopNum (uint16BE) — loop number
0x06    2     loopCount (uint16BE) — loop count
0x08    2     pattern (uint16BE) — pattern index
0x0A    2     start (uint16BE) — start row
0x0C    2     length (uint16BE) — row count
0x0E    2     speed (uint16BE) — ticks per row
0x10    2     transpose (int16BE) — semitone transpose
0x12    2     eventsPerLine (uint16BE) — events per row
0x14    12    padding
```

---

### SymInstrument (256 bytes)

```
Offset  Size  Description
------  ----  -----------
0x00    128   Name / virtual instrument header (null-terminated ASCII)
0x80    1     type (int8) — instrument type
0x81    1     loopStartHigh (uint8)
0x82    1     loopLenHigh (uint8)
0x83    1     numRepetitions (uint8)
0x84    1     channel (uint8) — default pan: channel&1 → right (+50), else left (−50)
0x85    1     dummy1
0x86    1     volume (uint8) — 0–199
0x87    3     dummy2
0x8A    1     finetune (int8)
0x8B    1     transpose (int8) — default semitone offset
0x8C    1     sampleFlags (uint8)
0x8D    1     filter (int8)
0x8E    1     instFlags (uint8)
0x8F    1     downsample (uint8)
...     ...   remaining bytes (sample length, loop points, other fields)
```

---

## Tempo and Speed

- **BPM:** `floor(1.24 × min(rawTempo, 800))` — default 125 if no Tempo chunk.
- **Speed:** Set by special events in pattern data; default 6.
- **Panning:** Determined by instrument `channel` field — odd channel → right (+50
  panning), even channel → left (−50 panning).

---

## Sample Storage

Samples arrive via three chunk types:

- **-11 SampleFile:** Raw PCM blob, length-prefixed. Stored directly.
- **-12 EmptySample:** No data; placeholder to advance the sample counter.
- **-17 SamplePacked:** Delta-compressed 8-bit PCM — differences between adjacent
  samples encoded, unpacked by the parser before playback.
- **-18 SamplePacked16:** Block-delta-compressed 16-bit PCM (parsed but treated
  same as -17 at the current engine level).

---

## Symphonie vs Symphonie Pro

| Feature | Symphonie | Symphonie Pro |
|---------|-----------|---------------|
| Chunk stream | Negative IDs only | Also positive IDs 10–12 |
| SampleBoost (ID 10) | Absent | Present — sample normalization factor |
| StereoDetune (ID 11) | Absent | Present — per-channel pitch detune |
| StereoPhase (ID 12) | Absent | Present — per-channel phase offset |

Both variants are handled identically by `SymphonieProParser.ts`; the positive chunk
IDs are detected to flag the Pro variant for metadata but their values are not applied
to synthesis in the current implementation.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/SymphonieProParser.ts`
- **Authoritative reference:** `Reference Code/openmpt-master/soundlib/Load_symmod.cpp`
- **UADE players:** `Reference Code/uade-3.05/players/Symphonie`, `SymphoniePro`

---

## Implementation Notes

**Current status:** FULLY_NATIVE — `SymphonieSynth` WASM engine handles synthesis.

The chunk-based layout makes this format straightforward to parse sequentially.
`SymphonieProParser.ts` reads the header, then iterates over chunks dispatching each
to the appropriate handler. Packed blocks are decompressed using the RLE engine.

**Note mapping offset (+25):** Symphonie uses note values 0–84 in pattern events.
Adding 25 aligns them to standard 1-based XM/ProTracker note numbering (C-0 = note 1),
so symNote 0 → note 25 (C-2).

**InfoText as song name:** The first line of the InfoText chunk (-16) is used as the
song name. The full text may contain multi-line composer notes.
