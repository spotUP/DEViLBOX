# AMOS Music Bank

**Status:** NATIVE_SAMPLER — PCM extracted, plays via Sampler engine
**Parser:** `src/lib/import/formats/AMOSMusicBankParser.ts`
**Extensions:** `.abk`
**UADE name:** N/A (native sampler)
**Reference files:** `Reference Music/AMOS Music Bank/`

---

## Overview

AMOS Music Bank is the music format for AMOS BASIC (François Lionet, Europress, 1990).
Files are standard AMOS bank files containing music data: instruments (PCM samples),
songs (playlists with tempo control), and patterns (command-based channel sequences).

The format uses a **command-based** (not fixed-row) pattern encoding where note and
effect commands appear as 2-byte words, and row timing is controlled by delay commands
rather than a fixed grid.

References: `libxmp` `abk_load.c`, `Reference Code/libxmp-master/docs/formats/AMOS_Music_Bank_format.txt`

---

## File Layout

### AMOS Standard Bank Header (20 bytes)

```
Offset  Size  Description
------  ----  -----------
0       4     "AmBk" magic (0x416D426B)
4       2     bankType: must be 0x0003 (music bank)
6       2     chipFast (0 = chip RAM, 1 = fast RAM)
8       4     bankLength (u32BE)
12      8     bankName: "Music   " (padded to 8 chars)
```

### Main Header (at offset 0x14)

```
Offset  Size  Description
------  ----  -----------
0x14    2     instruments_offset (u16BE, relative to 0x14)
0x16    2     songs_offset (u16BE, relative to 0x14)
0x18    2     patterns_offset (u16BE, relative to 0x14)
```

### Instruments Section (at 0x14 + instruments_offset)

```
+0  numInstruments (u16BE)
+2  numInstruments × ABKInstrumentHeader (20 bytes each):
    +0  name[16]       (null-padded ASCII)
    +16 sampleOffset   (u32BE, from instruments section start)
    → After all headers: PCM data at each sampleOffset
    Length derived from next instrument's offset or end-of-section.

ABKInstrumentHeader (from libxmp ABK format doc):
    name[16], sampleOffset(u32BE), repeatOffset(u32BE),
    sampleLength(u16BE, words), repeatEnd(u16BE, words), volume(u8)
```

### Songs Section (at 0x14 + songs_offset)

```
+0  numSongs (u16BE)
Each song: tempo (u8) + numPlaylists (u8) + playlist entries (u16BE pattern refs)
```

### Patterns Section (at 0x14 + patterns_offset)

```
+0  numPatterns (u16BE)
+2  numPatterns × u32BE channel offsets (4 offsets per pattern, one per channel)
Each channel pattern: variable-length command stream
```

---

## Detection Algorithm

```
1. buf[0..3] == "AmBk"  (0x416D426B)
2. u16BE(4) == 0x0003   (bank type = music bank)
3. buf[12..19] == "Music   " (8 bytes, space-padded)
```

---

## Pattern Command Encoding

ABK patterns use 2-byte word commands:

```
bit 15 == 1 → command word:
  bits 14–8: command code
  bits 7–0:  parameter

  Command codes:
    0x00  End of pattern (terminates channel sequence)
    0x01  Set instrument (param = instrument index)
    0x02  Set volume (param = 0–64)
    0x03  Set speed (param = ticks per row)
    0x04  Set loopback (param = loopback count)
    0x05  Jump to position (param = order index)
    0x08  Jump to pattern row (param = row)
    0x0A  Set arpeggio (param = chord code)
    0x0B  Set vibrato (param = speed/depth)
    0x0C  Set portamento up
    0x0D  Set portamento down
    0x0E  Set tone portamento
    0x0F  Volume slide
    0x10  Delay (advance row) — param = number of frames to wait

bit 15 == 0 → note word:
  bit 14 == 0 (new format): bits 11–0 = Amiga period
  bit 14 == 1 (old format): bits 7–0 = delay, next word bits 11–0 = period
  0x8000 / 0x9100 → end of pattern
```

**Row timing:** Rows advance only on delay (0x10) commands. Multiple note/effect
commands in a row appear at the same row position.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/AMOSMusicBankParser.ts`
- **libxmp reference:** `Reference Code/libxmp-master/src/loaders/abk_load.c`
- **Format spec:** `Reference Code/libxmp-master/docs/formats/AMOS_Music_Bank_format.txt`

