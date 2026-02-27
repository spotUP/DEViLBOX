# RTM (Real Tracker 2)

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/RTMParser.ts`
**Extensions:** `.rtm`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/Real Tracker/`

---

## Overview

Real Tracker 2 is a DOS tracker by Arnaud Hasenfratz. Files use a chunked object format
identified by "RTMM" followed by a space and a 32-character name. The format supports up
to 32 channels, two effects per cell, and packed RLE pattern compression.

Reference: OpenMPT `soundlib/Load_rtm.cpp`

---

## File Layout

### Object Header (42 bytes, repeated for each object)

```
Offset  Size  Description
------  ----  -----------
0       4     Object type ID ("RTMM", "RTND", "RTIN", "RTSM")
4       1     Space separator (0x20)
5       32    Object name (null-padded ASCII)
37      1     EOF marker (0x1A)
38      2     Version (u16LE, 0x0100–0x0112)
40      2     objectSize (u16LE, size of data following header, >= 98 for RTMM)
```

### Object Types

| ID     | Description |
|--------|-------------|
| `RTMM` | Main song object (first in file) |
| `RTND` | Pattern object |
| `RTIN` | Instrument object |
| `RTSM` | Sample object |

---

## RTMM (Main Song Object)

After the 42-byte object header:

```
Offset  Size  Description
------  ----  -----------
0       32    Software/author string
32      1     flags (u8): bit 0 = linear freq, bit 1 = track names present
33      1     numChannels (u8)
34      2     numOrders (u16LE)
36      2     numPatterns (u16LE)
38      2     numInstruments (u16LE)
40      2     numSamples (u16LE)
42      2     numTracks (u16LE)
44      48    Channel settings (u8 per channel: low nibble = panning offset)
...     ...   Order list (numOrders × u16LE pattern indices)
...     ...   Track table (numPatterns × numChannels × u16LE track indices)
...     ...   Channel panning (numChannels × u8)
```

---

## RTND (Pattern Object)

After the 42-byte object header:

```
Offset  Size  Description
------  ----  -----------
0       2     numRows (u16LE)
2       2     dataSize (u16LE)
4       ...   Packed row data (dataSize bytes)
```

---

## RTIN (Instrument Object)

After the 42-byte object header, instrument data includes:
- Volume envelope
- Panning envelope
- Sample map (128 entries mapping notes to samples)
- Vibrato speed/depth/sweep

---

## RTSM (Sample Object)

After the 42-byte object header:

```
Offset  Size  Description
------  ----  -----------
0       2     flags (u16LE): bit0=16-bit, bit1=loop, bit2=bidi loop
2       1     baseNote (u8)
3       1     tuning (i8 signed)
4       4     sampleRate (u32LE, C5 speed in Hz; default 8363)
8       4     loopStart (u32LE, in samples)
12      4     loopLength (u32LE, in samples)
16      4     length (u32LE, in samples)
20      ...   PCM sample data (8-bit or 16-bit LE)
```

---

## Detection Algorithm

```
1. buf.byteLength >= 42
2. buf[0..3] == "RTMM"
3. buf[4] == 0x20  (space separator)
4. buf[37] == 0x1A (EOF marker)
5. u16LE(38) in [0x0100, 0x0112]  (version)
6. u16LE(40) >= 98  (objectSize)
```

---

## Pattern Cell Encoding (Packed RLE)

Patterns are row-oriented. Each row is encoded per channel:

```
0x00 = end of row (advance to next row)

If byte != 0x00:
  infobyte (u8) with flags:
    bit 0 (0x01): note present (u8: 1-96; 97=note-off; 0=empty; +1 offset from raw)
    bit 1 (0x02): instrument present (u8, 1-based)
    bit 2 (0x04): volume present (u8, 0-64)
    bit 3 (0x08): panning present (u8, 0-64)
    bit 4 (0x10): command1 present (u8 cmd + u8 param)
    bit 5 (0x20): command2 present (u8 cmd + u8 param)
    bit 6 (0x40): channel index present (u8; skip to this channel)
```

Two simultaneous effects per cell (command1+param1, command2+param2).

**Note conversion:**
```
XM_NOTE_OFF = 97
noteRaw = stored_byte  (0 = empty, 1-96 = note, 97 = key-off)
XM note = noteRaw + 12 + NOTE_MIN  (non-zero notes)
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/RTMParser.ts`
- **OpenMPT reference:** `soundlib/Load_rtm.cpp`
