---
date: 2026-04-05
topic: dave-lowe-format-research
tags: [amiga, parser, format, dave-lowe, uade]
status: final
---

# Dave Lowe Amiga Music Format — Binary Layout Research

## Overview

Two format variants:
- **DL (Dave Lowe)** — 1988-94, Amiga hunk executable wrapping player code + music data + samples. Used in: Lure of the Temptress, Incredible Shrinking Sphere, IK+, Midwinter 2, etc.
- **DLN (Dave Lowe New)** — 1993-95, raw binary (no hunk header). Two sub-formats internally (1st format from Flink, 2nd format from Super Street Fighter II). Used in: Flink, Super Street Fighter II, etc.

Both are **4-channel** Amiga formats using **raw Amiga period values** for note encoding.

## DL Format (Hunk Executable)

### File Structure

```
Offset    Size    Content
0x0000    32      Amiga hunk header (0x000003F3 magic, hunk sizes)
0x0020    4       CODE_BASE: 0x70FF4E75 (moveq #-1,d0 + rts)
0x0024    8       Magic bytes: "UNCLEART"
0x002C    36      Pointer table (9 x 4-byte offsets relative to CODE_BASE)
0x0050    24      Info string pointers + size values (6 x 4-byte)
0x0068+   var     Null-terminated ASCII strings (song name, author, special info)
...       var     Player code (68k instructions)
...       var     Subsong table + pattern sequences + pattern data + volume envelopes
...       var     Instrument/sample info table
...       var     Raw 8-bit signed PCM sample data
```

### Detection (from Dave Lowe_v3.asm Check3)

```
file[0..3]   == 0x000003F3  (HUNK_HEADER magic)
file[20]     != 0x00        (chip memory load flag)
file[32..35] == 0x70FF4E75  (moveq #-1,d0 + rts)
file[36..39] == "UNCL"
file[40..43] == "EART"
file[44..47] != 0x00000000  (InitSound pointer)
file[48..51] != 0x00000000  (Play pointer)
file[56..59] != 0x00000000  (SubsongCtr label)
```

### Pointer Table (CODE_BASE + 0x0C, 9 longwords)

All offsets are relative to CODE_BASE (file offset 0x20).

| Index | Offset | Name            | Description |
|-------|--------|-----------------|-------------|
| 0     | +0x0C  | InitSound       | Pointer to init sound routine |
| 1     | +0x10  | Play/Interrupt  | Pointer to play routine (called each tick) |
| 2     | +0x14  | EndSound        | Pointer to end sound routine |
| 3     | +0x18  | SubsongCtr      | Pointer to subsong counter variable |
| 4     | +0x1C  | SampleInfo      | Pointer to sample info table |
| 5     | +0x20  | EndSampleInfo   | Pointer past end of sample info table |
| 6     | +0x24  | Init2           | Optional init2 routine (0 if unused) |
| 7     | +0x28  | InitPlayer      | Optional init player routine (0 if unused) |
| 8     | +0x2C  | FirstSubsong    | Pointer to first subsong structure |

### Info String Table (CODE_BASE + 0x30, 6 longwords)

| Index | Offset | Name         | Description |
|-------|--------|--------------|-------------|
| 0     | +0x30  | SongNamePtr  | Offset to null-terminated song name |
| 1     | +0x34  | AuthorNamePtr| Offset to null-terminated author name |
| 2     | +0x38  | SpecialInfoPtr| Offset to null-terminated info text |
| 3     | +0x3C  | LoadSize     | Total size in bytes (raw value, not a pointer) |
| 4     | +0x40  | CalcSize     | Calculated size |
| 5     | +0x44  | SamplesSize  | Total sample data size in bytes |

### Example (incredibleshrinkingsphere.dl)

```
CODE_BASE = 0x20
InitSound      = 0x0172 -> file 0x0192
Play           = 0x00F8 -> file 0x0118
EndSound       = 0x0202 -> file 0x0222
SubsongCtr     = 0x00F6 -> file 0x0116
SampleInfo     = 0x2220 -> file 0x2240
EndSampleInfo  = 0x232A -> file 0x234A (19 samples: (0x232A-0x2220)/14 = 19)
Init2          = 0x0000 (unused)
InitPlayer     = 0x0000 (unused)
FirstSubsong   = 0x04CE -> file 0x04EE
SongName       = "Incredible Shrinking Sphere"
Author         = "Dave Lowe"
```

### Subsong Structure (DL)

Each subsong entry is **16 bytes** (4 longwords):
```
Offset  Size  Content
+0x00   4     Channel 0 pattern sequence pointer (offset from CODE_BASE)
+0x04   4     Channel 1 pattern sequence pointer
+0x08   4     Channel 2 pattern sequence pointer
+0x0C   4     Channel 3 pattern sequence pointer
```

Next subsong at +16 bytes. Linked list: entry+16 contains pointer to next, terminated by 0.

### Sample Info Table (DL)

Located at the SampleInfo pointer. Each entry is **14 bytes**. Number of entries = `(EndSampleInfo - SampleInfo) / 14`.

```
Offset  Size  Content
+0x00   2     Type/flag (word): 1 = valid sample
+0x02   4     Sample data offset (long, relative to CODE_BASE)
+0x06   2     Sample length in WORDS (multiply by 2 for bytes)
+0x08   2     Unknown (always 0x0000 in test file)
+0x0A   2     Unknown (always 0x23BC in test file, possibly loop offset related)
+0x0C   2     Unknown (0x0010 or 0x0008, possibly repeat length or finetune)
```

All sample data is 8-bit signed PCM. The sample address points to raw PCM data within the code hunk.

---

## DLN Format (Dave Lowe New)

### File Structure — Two Sub-Formats

The format is determined by the first word and long at offset 24:

| word[0] | long[24] | Sub-Format | Subsong Entry Size | Game |
|---------|----------|------------|-------------------|------|
| 8       | any      | 1st format | 16 bytes (4 ch ptrs) | Flink |
| 4       | != 0     | 1st format | 16 bytes | — |
| 4       | == 0     | 2nd format | 32 bytes (speed + 4 ch ptrs + padding) | Super Street Fighter II |

### Detection (from Dave Lowe New_v2.asm Check2)

The FirstCheck table starts at offset 4 or 8 depending on word[0] (see table above).

**FirstCheck** — 4 consecutive 4-byte entries at the computed offset:
```
For each of 4 entries:
  high word (bytes 0-1) == 0x0000
  low word (bytes 2-3): > 0, < 0x8000, and EVEN (bit 0 clear)
```

These entries are the channel data block offsets.

**SecondCheck** — for each of the 4 entries, dereference the offset and validate:
- At the pointed-to offset: word must be 0x0000, next word must be >0, <0x8000, even
- Then follow another pointer and look for command word 12 (0x000C) followed by word 4 (0x0004)

### DLN 2nd Format File Layout

```
Offset    Size    Content
0x0000    2       Format indicator word (0x0004 for 2nd format)
0x0002    2       Subsong table end offset (used to count subsongs)
0x0004    var     Subsong table entries (32 bytes each)
...       var     Channel data blocks (pattern sequences + pattern data)
...       var     Volume envelope data
...       var     Instrument/sample definition table
...       var     Sample info table (14 bytes per entry)
...       var     Raw 8-bit signed PCM sample data
```

**Number of subsongs** (2nd format): `(word[2] - 8) / 32`

**Subsong entry** (32 bytes for 2nd format):
```
Offset  Size  Content
+0x00   4     Speed divider (number of ticks between pattern advances)
+0x04   4     Channel 0 pattern data offset (from file start)
+0x08   4     Channel 1 pattern data offset
+0x0C   4     Channel 2 pattern data offset
+0x10   4     Channel 3 pattern data offset
+0x14   12    Padding/reserved (zeros)
```

### DLN 1st Format File Layout

```
Offset    Size    Content
0x0000    2       Format indicator word (0x0008 typically)
0x0002    2       Subsong table end offset
0x0004    var     Subsong table entries (16 bytes each)
```

**Number of subsongs** (1st format): counted by walking the table until an invalid entry

**Subsong entry** (16 bytes for 1st format):
```
Offset  Size  Content
+0x00   4     Channel 0 pattern sequence pointer (offset from file start)
+0x04   4     Channel 1 pattern sequence pointer
+0x08   4     Channel 2 pattern sequence pointer
+0x0C   4     Channel 3 pattern sequence pointer
```

### Example (m-bison.dln, 2nd format)

```
word[0]  = 0x0004 (2nd format)
word[2]  = 0x0048 -> num_subsongs = (0x48 - 8) / 32 = 2
long[24] = 0x00000000 -> table starts at offset 8

Subsong 1 (offset 0x04): speed=4, ch0=0x66, ch1=0x72, ch2=0x7E, ch3=0x102
Subsong 2 (offset 0x24): speed=5, ch0=0x48, ch1=0x48, ch2=0x48, ch3=0x48
```

---

## Pattern Data Stream Format (shared by DL and DLN)

Pattern data is a **variable-length command stream**, NOT a fixed-size cell grid like MOD/XM.

Each channel has its own independent stream. The player reads words sequentially:

### Stream Encoding

```
word > 100 (0x64):  NOTE — Amiga period value
                    Followed by: word = DURATION (number of ticks to hold this note)
                    
word <= 100 (0x64): COMMAND — dispatched via jump table (word value = byte offset into table)
```

### Command Table (word value -> function)

| Word | Index | Name | Arguments | Description |
|------|-------|------|-----------|-------------|
| 0    | 0     | NOP  | none | No operation, continue to next word |
| 4    | 1     | SET_INSTRUMENT | 1 long (instrument data offset) | Set current instrument/sample |
| 8    | 2     | PATTERN_SEQ_ADV | none | Advance to next pattern in sequence list |
| 12   | 3     | SET_VOL_ENVELOPE | 1 long (envelope data offset) | Set volume envelope |
| 16   | 4     | SET_PORTAMENTO | 2 longs (portamento params) | Enable portamento slide |
| 20   | 5     | SET_VIBRATO | 3 longs (speed, depth, delay) | Enable vibrato effect |
| 24   | 6     | CLEAR_PORTAMENTO | none | Disable portamento |
| 28   | 7     | CLEAR_VIBRATO | none | Disable vibrato |
| 32   | 8     | REST | 1 word (duration, signed) | Silence for N ticks; if negative = song end marker |
| 36   | 9     | (unused) | — | Maps to same handler as 40 |
| 40   | 10    | (unused) | — | Maps to same handler as 36 |
| 44   | 11    | LED_FILTER_ON | none | BCLR #1,$BFE001 (enable Amiga LED filter) |
| 48   | 12    | LED_FILTER_OFF | none | BSET #1,$BFE001 (disable Amiga LED filter) |
| 52   | 13    | SET_VIBRATO_FLAG | none | Toggle vibrato flag |
| 56   | 14    | JUMP | 1 long (pattern data offset) | Jump to another position in pattern data |

### Note Duration

Duration is in **player ticks**. The player is called at a fixed rate (typically 50Hz PAL VBlank).
- Duration 1 = 1 tick = 20ms at 50Hz
- Duration 16 = 16 ticks = 320ms

For DLN 2nd format, there is an additional speed divider from the subsong entry that controls
how many VBlank ticks pass between pattern advances.

### REST Command and Song End

Command 32 (REST) takes a signed word:
- Positive value = number of ticks of silence
- Negative value (bit 15 set) = song end marker (the absolute value is the rest duration)

---

## Pattern Sequence Lists (DL and DLN 1st format)

In DL and DLN 1st format, each channel has a **pattern sequence list** — an array of longword
offsets pointing to pattern data blocks, terminated by 0x00000000.

```
Pattern Sequence List:
  long  pattern_data_offset_0   (relative to CODE_BASE for DL, file start for DLN)
  long  pattern_data_offset_1
  ...
  long  0x00000000              (end of sequence -> loop back to start)
```

When the player reaches cmd 8 (PATTERN_SEQ_ADVANCE) in the pattern data stream, it advances
to the next entry in the sequence list. When it reaches the 0 terminator, it loops back to the
beginning (triggering song-end detection).

For **DLN 2nd format**, the pattern data for each channel is a single contiguous stream (no
separate sequence list). Cmd 8 still exists but serves as a sync point.

---

## Instrument/Sample Data Structure

### Instrument Definition (referenced by cmd 4)

The cmd 4 (SET_INSTRUMENT) argument is a long offset pointing to an instrument structure.

**Non-looping sample** (word[0] == 0):
```
Offset  Size  Content
+0x00   2     0x0000 (non-looping flag)
+0x02   4     Sample data offset (from CODE_BASE/file start)
+0x06   2     Sample length in WORDS
Total: 8 bytes
```

**Looping sample** (word[0] != 0):
```
Offset  Size  Content
+0x00   2     Loop type (non-zero, typically 1)
+0x02   4     Initial play-through sample data offset
+0x06   2     Initial play-through length in WORDS
+0x08   4     Loop body sample data offset
+0x0C   2     Loop body length in WORDS
Total: 14 bytes
```

When a looping sample triggers:
1. First, the full sample plays from the initial offset for the initial length
2. Then DMA switches to the loop body offset/length and repeats

### Volume Envelope Data (referenced by cmd 12)

```
Offset  Size  Content
+0x00   4     Envelope timing/scaling value
+0x04   var   Sequence of word volume values (0x0000-0x0040 = 0-64)
              Terminated by word 0x00FF
```

The player reads one volume value per tick from the envelope. When it hits 0x00FF, it holds
the last volume value.

### Sample Info Table (for EaglePlayer SampleInit)

Separate from the instrument definitions. Located at the SampleInfo pointer (DL) or found
by walking backwards from a pattern marker (DLN). Each entry is **14 bytes**:

```
Offset  Size  Content
+0x00   2     Valid flag (1 = valid sample)
+0x02   4     Sample data offset (from CODE_BASE for DL, from module start for DLN)
+0x06   2     Sample length in WORDS
+0x08   4     Loop start offset (or second sample reference)
+0x0C   2     Loop length in WORDS
```

For DL: sample offsets are absolute (already relocated CODE_BASE addresses).
For DLN: sample offsets are relative to module start; the EaglePlayer adds `LEA 0(A2,D1.L),A1`.

---

## Channel State Structure

The player maintains a per-channel state structure (approximately 0x44 bytes):

| Offset | Size | Name | Description |
|--------|------|------|-------------|
| 0x00   | 2    | Channel ID | 1-4 |
| 0x02   | 2    | Duration counter | Ticks remaining for current note |
| 0x04   | 2    | State flags | 0=reading stream, 1=last tick, 3=switching to loop |
| 0x06   | 2    | Current period | Amiga period value |
| 0x08   | 4    | Portamento params | Direction + speed |
| 0x0C   | 2    | Portamento target | Target period |
| 0x0E   | 2    | Portamento delay | Initial delay before slide |
| 0x10   | 2    | Vibrato state | Phase counter (1-5 cycle) |
| 0x12   | 4    | Volume envelope ptr | Current position in volume data |
| 0x16   | 4    | Pattern data ptr | Current position in pattern stream |
| 0x1A   | 4    | Sequence list ptr | Current position in pattern sequence |
| 0x1E   | 4    | Sequence list start | Start of pattern sequence (for loop) |
| 0x22   | 4    | Vol envelope start | Start of current envelope (for retrigger) |
| 0x26   | 4    | Loop sample address | DMA address for loop portion |
| 0x2A   | 2    | Loop sample length | Loop length in words |
| 0x2C   | 4    | Loop body address | Post-initial DMA address |
| 0x30   | 2    | Loop body length | Post-initial length in words |
| 0x32   | 2    | Vibrato speed ctr | Vibrato speed counter |
| 0x34   | 2    | Vibrato speed | Vibrato speed value |
| 0x36   | 2    | Vibrato depth down | Downward vibrato amount |
| 0x38   | 2    | Vibrato depth up | Upward vibrato amount |
| 0x3A   | 2    | Vol envelope delay | Initial delay before envelope starts |
| 0x3C   | 2    | Vol env delay init | Initial value for envelope delay |
| 0x3E   | 4    | Timing value | From volume envelope header |
| 0x42   | 2    | Special flag | Set by cmd 52 |

---

## Key Differences Between DL and DLN

| Feature | DL | DLN |
|---------|----|----|
| File wrapper | Amiga hunk executable | Raw binary data |
| Detection | 0x000003F3 + "UNCLEART" | word[0] = 4 or 8, FirstCheck validation |
| Channels | 4 (fixed) | 4 (fixed) |
| Pattern data | Command stream (same format) | Command stream (same format) |
| Subsong size | 16 bytes | 16 bytes (1st) or 32 bytes (2nd, has speed) |
| Speed control | Fixed (from player code) | Per-subsong speed divider (2nd format) |
| All pointers | Relative to CODE_BASE | Relative to file start |
| String metadata | Song name, author, special info at known offsets | None embedded |
| Sample info | Explicit pointer + end pointer | Found by walking from pattern markers |

---

## Source Files Referenced

| File | Path |
|------|------|
| DL EagleRipper | `third-party/uade-3.05/amigasrc/players/wanted_team/DaveLowe/src/Dave Lowe.s` |
| DL EaglePlayer | `third-party/uade-3.05/amigasrc/players/wanted_team/DaveLowe/src/Dave Lowe_v3.asm` |
| DLN EagleRipper | `third-party/uade-3.05/amigasrc/players/wanted_team/DaveLoweNew/src/Dave Lowe New.s` |
| DLN EaglePlayer | `third-party/uade-3.05/amigasrc/players/wanted_team/DaveLoweNew/src/Dave Lowe New_v2.asm` |
| Existing DL parser | `src/lib/import/formats/DaveLoweParser.ts` |
| Existing DLN parser | `src/lib/import/formats/DaveLoweNewParser.ts` |
| Sample DL file | `public/data/songs/formats/incredibleshrinkingsphere.dl` (122,564 bytes) |
| Sample DLN file | `public/data/songs/formats/m-bison.dln` (21,547 bytes) |
