---
date: 2026-03-02
topic: zoundmon-synthesis-specification
tags: [zoundmon, amiga, synthesis, replayer, wasm]
status: final
---

# ZoundMonitor Synthesis Specification

Comprehensive specification derived from:
- `docs/formats/Replayers/ZoundMon/Zound.c` (C loader/data structures)
- `docs/formats/Replayers/ZoundMon/Player.c` (inline-asm replayer)
- `docs/formats/Replayers/ZoundMon/LetsHearIt.c` (example usage)
- `docs/formats/Replayers/ZoundMon/INFORMATION-FILE` (user guide)
- `third-party/uade-3.05/amigasrc/players/wanted_team/ZoundMonitor/src/ZoundMonitor_v1.asm` (UADE EaglePlayer)
- `src/lib/import/formats/ZoundMonitorParser.ts` (existing parser)
- `soundmon-wasm/include/format_synth_api.h` (WASM API contract)
- `soundmon-wasm/src/soundmon_synth.c` (SoundMon reference implementation)

---

## A. File Format Layout

### A.1 Magic Bytes / Detection

ZoundMonitor files have **no magic bytes**. Detection uses a structural offset check.

From `ZoundMonitor_v1.asm` DTP_Check2:

```
D1 = (byte[0] + 1) << 4       // (MaxTable + 1) * 16
D0 = (byte[1] + 1) << 7       // (MaxPart + 1) * 128
offset = D1 + D0 + 869

if offset >= fileSize → not ZoundMonitor

At file[offset], check for either:
  Pattern 1: "df?:" → byte[0]=='d', byte[1]=='f', byte[3]==':'
  Pattern 2: "?amp" → byte[1]=='a', byte[2]=='m', byte[3]=='p'
```

These patterns correspond to Amiga DOS device path strings (e.g. `"df0:"`, `"ramp"`) embedded in sample name fields within the file. The offset computation is based on the table and part counts — the check essentially jumps past all the structured data to where sample names should be. The `869` constant is:
- 5 bytes (header) + 16 samples * 54 bytes (864) = 869

UADE file naming convention: files are prefixed with `.SNG` extension (e.g. `song.sng`) or `sng.` prefix.

### A.2 File Header

The file begins with 5 bytes:

| Offset | Size | Field      | Description                            |
|--------|------|------------|----------------------------------------|
| 0      | 1    | MaxTable   | Highest table index used (0-based)     |
| 1      | 1    | MaxPart    | Highest part index used (0-based)      |
| 2      | 1    | loadstart  | Default StartTab for playback          |
| 3      | 1    | loadend    | Default EndTab for playback            |
| 4      | 1    | speed      | Default playback speed (ticks/row)     |

### A.3 Sample Table (16 entries)

Immediately after the 5-byte header. Each entry is 54 bytes (`sizeof(struct SampleData)` = 54 in `Zound.c`). The format is 16 entries total (indices 0-15), but only samples 1-15 are usable (0 means "no sample").

`struct SampleData` layout (54 bytes per entry):

| Offset | Size | Type  | Field    | Description                              |
|--------|------|-------|----------|------------------------------------------|
| 0      | 4    | ULONG | start    | Runtime pointer to sample data (unused in file; set at load time) |
| 4      | 40   | UBYTE[40] | name  | Sample filename (null-terminated string, e.g. "bass.smp") |
| 44     | 1    | UBYTE | vol      | Default sample volume (0-64)             |
| 45     | 1    | (pad) | —        | Padding byte (struct alignment)          |
| 46     | 2    | UWORD | length   | Sample length in WORDS (set at load time from file size / 2) |
| 48     | 2    | UWORD | replen   | Repeat/loop length in WORDS              |
| 50     | 2    | UWORD | restart  | Repeat start offset in WORDS             |
| 52     | 1    | UBYTE | preset   | Preset field (purpose unclear, possibly unused) |
| 53     | 1    | (pad) | —        | Padding to reach 54 bytes                |

**Important note on sample data:** The `start` field is a runtime pointer populated when samples are loaded from disk. In the file, these 4 bytes may contain garbage or zeros. Samples are stored as separate files on disk — they are NOT embedded in the song file. The `name` field specifies the filename to load from a configured sample directory.

**UADE EaglePlayer adaptation:** The UADE player (`ZoundMonitor_v1.asm`) uses the `ExtLoad` mechanism to load samples as separate list data entries. In `InitPlayer`, it copies the sample table from file data into the module buffer, adjusting pointers at runtime (line 487-511 of ASM). For IFF samples, it skips the first 100 bytes and recalculates the length.

**UADE sample field access from ASM (using offsets into $36-byte = 54-byte structs):**
- `(A6)` = offset 0 = sample start pointer (4 bytes)
- `4(A6)` = offset 4 = first byte of name (used for empty-name check)
- `$2C(A6)` = offset 44 = vol (1 byte)
- `$2E(A6)` = offset 46 = length (word)
- `$30(A6)` = offset 48 = replen (word)
- `$32(A6)` = offset 50 = restart (word)

### A.4 Table Data

After the sample table (16 * 54 = 864 bytes after header). There are `MaxTable + 1` entries. Each table entry contains 4 voices * 4 bytes = 16 bytes.

`struct TabData` layout (4 bytes per voice, 16 bytes per table row):

| Offset | Size | Type  | Field     | Description                              |
|--------|------|-------|-----------|------------------------------------------|
| 0      | 1    | UBYTE | partno    | Part number to play for this voice       |
| 1      | 1    | UBYTE | volume    | Volume add (signed, added to base volume)|
| 2      | 1    | UBYTE | instradd  | Instrument add (added to sample number)  |
| 3      | 1    | UBYTE | noteadd   | Note add (added to base note number)     |

Total table data size: `(MaxTable + 1) * 16` bytes.

**Song structure:** The table is the top-level sequencer. Each table row specifies, for each of the 4 voices, which part to play, what transposition to apply (noteadd), what instrument offset to apply (instradd), and a volume adjustment. This is analogous to a "song position list" in other tracker formats, but per-voice rather than shared.

### A.5 Part/Pattern Data

After the table data. There are `MaxPart + 1` parts. Each part contains 32 rows * 4 bytes (one longword per row).

Total part data size: `(MaxPart + 1) * 128` bytes (32 longwords = 128 bytes per part).

**CRITICAL:** Parts are **shared across voices** — the table assigns each voice to a part independently. Multiple voices can reference the same part simultaneously.

### A.6 Note Period Table (37 entries)

Stored in the replayer code (not in the file). Index 0 = silence (period 0), indices 1-36 = three octaves of notes.

```c
static WORD Periods[] = {
  0x0000,                                    // 0: silence/no-note
  0x0358, 0x0328, 0x02FA, 0x02D0,           //  1-4:  C-1, C#1, D-1, D#1
  0x02A6, 0x0280, 0x025C, 0x023A,           //  5-8:  E-1, F-1, F#1, G-1
  0x021A, 0x01FC, 0x01E0, 0x01C5,           //  9-12: G#1, A-1, A#1, B-1
  0x01AC, 0x0194, 0x017D, 0x0168,           // 13-16: C-2, C#2, D-2, D#2
  0x0153, 0x0140, 0x012E, 0x011D,           // 17-20: E-2, F-2, F#2, G-2
  0x010D, 0x00FE, 0x00F0, 0x00E2,           // 21-24: G#2, A-2, A#2, B-2
  0x00D6, 0x00CA, 0x00BE, 0x00B4,           // 25-28: C-3, C#3, D-3, D#3
  0x00AA, 0x00A0, 0x0097, 0x008F,           // 29-32: E-3, F-3, F#3, G-3
  0x0087, 0x007F, 0x0078, 0x0071            // 33-36: G#3, A-3, A#3, B-3
};
```

These are standard Amiga period values. Note 1 = C-1 (period 856 = 0x358), note 36 = B-3 (period 113 = 0x71). Three octaves total.

Note 63 (0x3F) is a special value meaning **note-off / silence** — the DMA is turned off but no new note is triggered.

### A.7 Complete File Layout Summary

```
Offset 0:                    Header (5 bytes)
Offset 5:                    Sample table (16 * 54 = 864 bytes)
Offset 869:                  Table data ((MaxTable+1) * 16 bytes)
Offset 869 + tableSize:      Part data ((MaxPart+1) * 128 bytes)
```

The detection offset formula `(byte[0]+1)*16 + (byte[1]+1)*128 + 869` computes the end of all structured data, which should land in the first sample's name field (if it exists). This is why the detection checks for DOS path strings ("df0:", "ramp") — they are typical sample paths on Amiga.

---

## B. Part Data Longword Encoding

Each row of a part is a 32-bit longword (big-endian). The bit layout is:

```
Bit 31  30  29  28  27  26  25  24  23  22  21  20  19  18  17  16  15  14  13  12  11  10   9   8   7   6   5   4   3   2   1   0
│         note[5:0]          │  sample[3:0] │  control[3:0]  │                    effect data [7:0] or arp data                    │
│ DMA │    note (6 bits)     │  sample (4b) │  control (4b)  │                         data (8 bits)                               │
```

### Extraction from code:

```c
// Note: bits 29-24 (after sign-extension of arithmetic shift right 24, then AND 0x3F)
note = (data >> 24) & 0x3F;        // 6 bits: note number 0-36, 63=note-off

// Sample: bits 23-20
sample = (data >> 20) & 0x0F;      // 4 bits: sample number 0-15 (0=use previous)

// Control: bits 19-16
control = (data >> 16) & 0x0F;     // 4 bits: effect control nibble

// Effect data: bits 7-0
effectData = data & 0xFF;          // 8 bits: effect parameter

// DMA flag: bit 31
dmaFlag = (data >> 31) & 1;        // 1 bit: controls DMA restart behavior
```

**More precisely from the ASM/C:**

```c
D0 = D4;                    // data → D0
D0 >>= 24;                  // arithmetic shift right 24 (sign-extends)
D0 &= 0x3F;                 // mask to 6 bits → note number

D0 = D4 & 0xF0000;          // extract bits 19-16 as nibble in position
D0 >>= 16;                  // shift to byte → control nibble

D0 = D4 & 0xF00000;         // extract bits 23-20
D0 >>= 20;                  // shift to byte → sample number

D0 = D4 & 0xFF;             // bottom byte → effect data

// Bit 31 check:
if (D4 & 0x80000000) ...    // DMA flag (btst #31,D4)
```

### Visual layout:

```
 3         2         1         0
 1098 7654 3210 9876 5432 1098 7654 3210
 DNNN NNNS SSSC CCCD DDDD DDDD DDDD DDDD
 │└─┘ └──┘ └──┘└──┘ └──────────────────┘
 │  │    │    │   │          │
 │  │    │    │   │          └── bits 7-0: effect data (signed byte for slide, nibbles for arp)
 │  │    │    │   └──────────── bits 19-16: control nibble (see section C)
 │  │    │    └──────────────── bits 23-20: sample number (0=keep current)
 │  │    └───────────────────── bits 29-24: note number (0=no new note, 1-36=notes, 63=note-off)
 │  └────────────────────────── (note bits continued)
 └───────────────────────────── bit 31: DMA control flag
```

Wait — let me re-examine. The note extraction is `(data >> 24) & 0x3F`, which means bits 29-24. Bit 30 is part of the note. Let me recount:

Bits 31-24 = high byte. After `asr.l #24, D0` we get the sign-extended high byte as a 32-bit value. `AND.b #$3F, D0` keeps only the low 6 bits of that byte.

So:
- **Bit 31**: DMA flag (checked separately via `btst #31, D4`)
- **Bit 30**: Part of the note? No — bit 30 is masked off by `& 0x3F`. The note is bits 29-24 (6 bits = 0-63 range). Bit 30 is unused/reserved.
- **Bits 29-24**: Note number (6 bits, range 0-63)
- **Bits 23-20**: Sample number (4 bits, range 0-15)
- **Bits 19-16**: Control nibble (4 bits)
- **Bits 15-8**: Volume add (signed byte, used by GetVolume: `data >> 8`, then `ext.w`)
- **Bits 7-0**: Effect parameter data

### Corrected layout:

```
 3         2         1
 10987654 32109876 54321098 76543210
 DXNNNNNN SSSSCCCC VVVVVVVV EEEEEEEE
 │││     │ │   │    │        │
 │││     │ │   │    │        └── bits 7-0:   effect parameter (E)
 │││     │ │   │    └─────────── bits 15-8:  volume add (V, signed byte)
 │││     │ │   └──────────────── bits 19-16: control nibble (C)
 │││     │ └──────────────────── bits 23-20: sample number (S, 0=keep)
 │││     └────────────────────── bits 29-24: note number (N, 0=no note, 1-36=notes, 63=note-off)
 ││└──────────────────────────── bit 30: unused (masked off by & 0x3F)
 │└───────────────────────────── bit 30: (same)
 └────────────────────────────── bit 31: DMA control flag (D)
```

### Volume Add Extraction (from GetVolume):

```c
D1 = D4;             // data
D1 >>= 8;            // logical shift right 8 → bits 15-8 now in bits 7-0
ext.w D1;            // sign-extend byte to word
// D1 is now the signed volume add from bits 15-8
```

### Arpeggio Data Extraction:

When control bit 0 is set and bit 1 is clear (arpeggio mode), the effect byte (bits 7-0) is split into two nibbles:

```c
arpData1 = (data >> 4) & 0x0F;    // bits 7-4 (lsr.b #4)
arpData2 = data & 0x0F;           // bits 3-0
```

Wait — reviewing the ASM more carefully:

```asm
MOVE.L D4,D0          ; Get data
LSR.B  #4,D0          ; shift low byte right 4 → upper nibble of low byte
MOVE.B D0,23(A2)      ; Store as arpdata1 (at offset 0x17)
MOVE.L D4,D0          ; Get data again
AND.B  #15,D0         ; lower nibble of low byte
MOVE.B D0,24(A2)      ; Store as arpdata2 (at offset 0x18)
```

Note: `LSR.B #4,D0` shifts only the low byte of D0 (bits 7-0) right by 4. Since the data was moved from D4 (the full longword), the low byte is bits 7-0 of the part data. So:
- arpData1 = bits 7-4 of data (high nibble of effect byte)
- arpData2 = bits 3-0 of data (low nibble of effect byte)

These are semitone offsets added to the base note for arpeggio cycling.

---

## C. Effect System (Control Nibble)

The control nibble (bits 19-16) has 4 bits with the following meanings:

| Bit | Flag          | Description                                          |
|-----|---------------|------------------------------------------------------|
| 0   | ARPEGGIO      | Enable arpeggio (when bit 1 is clear)                |
| 1   | SLIDE         | Enable pitch slide (when bit 0 is clear)             |
| 0+1 | ULTRA_SLIDE  | Both bits set = portamento/ultra-slide               |
| 2   | NO_NOTE_ADD   | Suppress noteadd from table                          |
| 3   | NO_INSTR_ADD  | Suppress instradd from table                         |

### C.1 Arpeggio (control bits: 0=1, 1=0)

**Trigger:** On each new note, arpeggio data is extracted from the effect byte. `arpData1 = effectByte >> 4`, `arpData2 = effectByte & 0x0F`. Counter is reset to 0.

**Per-tick algorithm (non-new-note ticks):**

```c
// Only on ticks where count < speed (i.e., between new-note ticks)
counter++;                              // increment arp counter (30(A2))
if (counter & 1) goto done;            // odd tick: skip (do nothing to period)

// Even ticks only:
step = (counter / 2) % 3;             // cycle through 0, 1, 2
arpOffset = arpDataTable[step];        // arpDataTable = [0, arpData1, arpData2]
                                       // where index 0 uses byte at offset 22 (=0),
                                       // index 1 = arpData1 (byte 23),
                                       // index 2 = arpData2 (byte 24)
noteIndex = baseNote + arpOffset;
period = Periods[noteIndex];
// poke period to hardware
```

Wait — the ASM at `specials` does:

```asm
MOVE.B 22(A2,D1.w),D2   ; Get current arpdata (D1=0,1,2 → offsets 22,23,24)
ADD.B  20(A2),D2         ; Add basenote
```

So the arp table is stored at offsets 22, 23, 24 of AudioTemp:
- offset 22 = 0x16 = arpData0 (always 0 — the base note offset, i.e., no transposition)
- offset 23 = 0x17 = arpData1 (upper nibble of effect byte)
- offset 24 = 0x18 = arpData2 (lower nibble of effect byte)

But looking at the `newvoices` code, only offsets 23 and 24 are written with arp data from the note. Offset 22 is never explicitly written — it comes from whatever was there before. Let me check: In the ASM `lbC001286` init (from UADE ASM), the entire AudioTemp is cleared to zero (160 bytes). So offset 22 starts at 0 and is never written by the arp setup. That means arpData[0] = 0, which means step 0 = base note (no transposition). Correct.

**Summary:** Arpeggio cycles every 2 ticks through three states: base note, base+arpData1 semitones, base+arpData2 semitones. The cycle repeats as: base, arp1, arp2, base, arp1, arp2, ...

**More precisely:** The counter increments every tick. On odd ticks, nothing happens (period is unchanged). On even ticks, the step = (counter/2) % 3, and the appropriate arp offset is applied.

### C.2 Slide (control bits: 0=0, 1=1)

**Trigger:** On each new note, the slide speed is extracted from the effect byte as a signed byte:

```c
slideSpeed = (int8_t)(effectByte);     // sign-extended from byte to word
// stored at audio->slidespeed (offset 2)
```

**Per-tick algorithm:**

```c
period = audio->period + audio->slideSpeed;   // add slide speed to current period
audio->period = period;                        // update stored period
// poke period to hardware
```

This is a simple linear pitch slide. Positive slideSpeed = slide down (higher period = lower pitch), negative = slide up (lower period = higher pitch). Applied every non-new-note tick.

### C.3 Ultra-Slide / Portamento (control bits: 0=1, 1=1)

**Trigger:** On a new note with both bits 0 and 1 set, the replayer reads the NEXT longword (D7) from the part data to get the target note:

```c
// Set slide flag for next row
audio->slideFlag = 1;                          // bset #0, 29(A2) — next row will continue sliding

// Extract target note from NEXT longword (D7)
targetNote = (D7 >> 24) & 0x3F;

// Check NONOTEADD flag in the NEXT longword (bit 18 of D7)
if (!(D7 & 0x40000)) {                        // btst #18, D7 → bit 18 = bit 2 of control nibble
    targetNote += table->noteadd;
}

targetPeriod = Periods[targetNote];
periodDiff = targetPeriod - currentPeriod;     // difference to slide

// Time = effectByte * speed
maxCount = (effectByte & 0xFF) * speed;

audio->periodDiff = periodDiff;                // offset 32
audio->counter = 0;                            // offset 30
audio->maxCount = maxCount;                     // offset 34
```

**Per-tick algorithm (applied on subsequent non-new-note ticks AND on the next row's new-note tick):**

```c
if (counter >= maxCount) return;               // slide complete

counter++;
period = startPeriod + (periodDiff * counter) / maxCount;   // linear interpolation
// poke period to hardware
```

**Key detail:** The ultra-slide uses linear interpolation over `effectByte * speed` ticks to smoothly glide from the current period to the target period. The next row's note is consumed by the ultra-slide setup (the `slideFlag` at offset 29 causes the next `newvoices` pass to call `specials` instead of processing a new note).

### C.4 Control Bit 2: NO_NOTE_ADD

When bit 2 of the control nibble is set, the table's `noteadd` value is NOT added to the base note. The note plays at its exact value from the part data without transposition.

### C.5 Control Bit 3: NO_INSTR_ADD

When bit 3 of the control nibble is set, the table's `instradd` value is NOT added to the sample number. The sample number from the part data is used directly.

### C.6 Bit 31: DMA Control Flag

Bit 31 of the part data longword controls DMA restart behavior:

```c
if (bit31 set) {
    // Only restart DMA if the sample is different from the last triggered sample
    if (currentSampleNo == lastPlayedSampleNo) {
        goto skipDMARestart;    // don't restart DMA, just poke period/volume
    }
    lastPlayedSampleNo = currentSampleNo;
}
// Fall through: always restart DMA (turn off, set up sample, turn on next tick)
```

When bit 31 is SET (1), it acts as a "don't retrigger" flag — if the same sample is already playing, the DMA is not restarted. When bit 31 is CLEAR (0), the DMA is always restarted (normal behavior).

---

## D. Per-Tick Voice Processing (Exact Order of Operations)

### D.1 AudioTemp Structure Layout

Each voice has a 40-byte (`$28` = 40 decimal) "AudioTemp" structure:

| Offset | Size | Type  | Field          | Description                              |
|--------|------|-------|----------------|------------------------------------------|
| 0      | 2    | WORD  | volume         | Current output volume (0-64)             |
| 2      | 2    | WORD  | slideSpeed     | Pitch slide speed (signed)               |
| 4      | 2    | WORD  | period         | Current period value                     |
| 6      | 2    | WORD  | dma            | DMA bit for this voice (1,2,4,8)         |
| 8      | 2    | WORD  | length         | Sample length in words (for DMA poke)    |
| 10     | 2    | WORD  | oneblowlen     | Repeat length in words (loop length)     |
| 12     | 4    | LONG  | sampleStart    | Pointer to sample start (for DMA trigger)|
| 16     | 4    | LONG  | restartPtr     | Pointer to loop restart position         |
| 20     | 1    | BYTE  | baseNote       | Current base note number (1-36)          |
| 21     | 1    | BYTE  | control        | Control nibble from current note         |
| 22     | 1    | BYTE  | arpData0       | Arpeggio offset 0 (always 0)            |
| 23     | 1    | BYTE  | arpData1       | Arpeggio offset 1 (upper nibble)        |
| 24     | 1    | BYTE  | arpData2       | Arpeggio offset 2 (lower nibble)        |
| 25     | 1    | BYTE  | (unused)       | —                                        |
| 26     | 2    | WORD  | sampleVol      | Base sample volume (from sample table)   |
| 28     | 1    | BYTE  | (unused)       | —                                        |
| 29     | 1    | BYTE  | flags          | bit 0: slideFlag (next row is slide continuation) |
| 30     | 2    | WORD  | counter        | Arpeggio/ultra-slide tick counter        |
| 32     | 2    | WORD  | periodDiff     | Ultra-slide period difference            |
| 34     | 2    | WORD  | maxCount       | Ultra-slide total tick count             |
| 36     | 1    | BYTE  | lastSampleNo   | Last DMA-triggered sample number         |
| 37     | 1    | BYTE  | currentSampleNo| Current sample number being set up       |
| 38     | 2    | (pad) | —              | Padding to 40 bytes                      |

### D.2 Initialization (SetUpInterrupt / Init)

```
1. Clear all 200 bytes of AudioTemp (4 voices * 40 + some extra = 200? Actually the C says 200 bytes cleared)
   Wait — the ASM clears 160 bytes (40 * 4), initialized as 160/4 = 40 longwords.
   Actually: `moveq #$31,D0` = 49, but UADE version uses `moveq #160/4-1,D0` = 39.
   So 40 longwords = 160 bytes = exactly 4 * 40 bytes.
2. Set DMA bits: voice0.dma=1, voice1.dma=2, voice2.dma=4, voice3.dma=8
3. Clear partvec to 0
4. Set tabvec = StartTab
5. Set count = speed - 1 (so first tick triggers new notes immediately)
```

### D.3 Per-VBlank Interrupt Processing

Called once per VBlank (~50Hz on PAL Amiga). The exact order:

```
1. count++
2. if (count == speed) → goto NEW_VOICES
3. // Non-new-note tick:
   a. if (dmaconhulp != 0) {
        // Turn on DMA for voices that were set up on the previous new-note tick
        DMACON = dmaconhulp | 0x8200;  // set bits
        dmaconhulp = 0;
      }
   b. // Wait for DMA to settle (hardware timing)
   c. For each voice (0-3):
        call specials()  → process arpeggio/slide/ultra-slide effects
        // After specials: poke restart pointer and loop length to hardware
   d. Exit

NEW_VOICES:
   4. count = 0
   5. For each voice (0-3):
      a. Get table entry for current tabvec position and this voice
      b. Check slideFlag at offset 29:
         - If set: clear flag, call specials(), skip to next voice
      c. Look up part data: Parts[table->partno][partvec]
         Also read next longword: Parts[table->partno][partvec + 1] (for ultra-slide)
      d. Extract note number (bits 29-24 & 0x3F)
         - If note == 0: call specials() (process ongoing effects), skip to next voice
         - If note != 0: process new note (steps e-n below)
      e. Store note as baseNote
      f. Extract control nibble (bits 19-16)
      g. If NO_NOTE_ADD (bit 2) not set: baseNote += table->noteadd
      h. Look up period from Periods[baseNote], store as current period
      i. Process effect based on control bits:
         - If bit0=1, bit1=0: ARPEGGIO setup
           Extract arp nibbles from effect byte, reset counter
         - If bit0=1, bit1=1: ULTRA-SLIDE setup
           Read next longword, compute target period, period diff, maxcount
           Set slideFlag for next row
         - If bit0=0, bit1=1: SLIDE setup
           Extract signed slide speed from effect byte
      j. Extract sample number (bits 23-20)
         - If NO_INSTR_ADD (bit 3) not set: sample += table->instradd
      k. If sample == 0: use old sample → call GetVolume, skip to step m
      l. If sample != 0 AND sample != currentSampleNo:
         - Load sample data (start, length, replen, restart, volume)
         - Call GetVolume
      m. DMA handling:
         - Check bit 31 (DMA flag):
           - If bit 31 SET: only restart DMA if sample changed from last trigger
           - If bit 31 CLEAR: always restart DMA
         - To restart DMA:
           1. Turn off this voice's DMA (write voice's DMA bit to DMACON)
           2. Check if baseNote == 63 → if so, skip (leave voice silent)
           3. Set dmaconhulp |= voice's DMA bit (will be turned on next tick)
           4. Poke sample start pointer and length to hardware registers
      n. Poke period and volume to hardware registers

   6. partvec++
   7. if (partvec == 32):
      a. partvec = 0
      b. tabvec++
      c. if (tabvec == EndTab):
         tabvec = StartTab  (song loop)
```

### D.4 GetVolume Calculation

```c
int volume = audio->sampleVol;           // base sample volume (0-64)

// Add volume-add from part data (bits 15-8, signed)
int volAdd = (int8_t)(data >> 8);        // sign-extended byte
volume += volAdd;

// Add table volume (signed)
int tabVol = (int8_t)(table->volume);    // sign-extended from table entry
volume += tabVol;

// Clamp to 0-64
if (volume >= 64) volume = 64;
if (volume < 0) volume = 0;

audio->volume = volume;
```

Volume is the sum of three components:
1. **Sample base volume** (from sample table, offset 44, unsigned 0-64)
2. **Part data volume add** (bits 15-8 of longword, signed byte)
3. **Table volume** (table entry byte at offset 1, treated as signed)

### D.5 Post-Note Hardware Pokes (specials routine — every tick)

After all effect processing, on every tick the replayer pokes:
```c
hardware->address = audio->restartPtr;   // Loop restart pointer
hardware->length  = audio->oneblowlen;   // Loop length
```

This ensures the Amiga hardware loops correctly after the initial sample trigger.

---

## E. Song Structure

### E.1 Table-to-Part Mapping

The **table** is the song sequencer. Each table row has 4 entries (one per voice). Each entry specifies:
- `partno`: which part (pattern) this voice plays
- `volume`: signed volume adjustment for this voice
- `instradd`: added to sample numbers in the part data (instrument transposition)
- `noteadd`: added to note numbers in the part data (pitch transposition)

This allows the same part to be reused across different table positions with different transpositions and instrument assignments — a powerful compositional tool.

### E.2 Song Loop

- `StartTab`: first table position to play (from file header or PlayZound argument)
- `EndTab`: table position where the song loops back to StartTab
- When `tabvec` reaches `EndTab`, it resets to `StartTab`

The `PlayZound(start, end)` function allows specifying custom start/end positions, enabling multiple "sub-songs" within a single file. `PlayZound(0, 0)` uses the file's default start/end values.

### E.3 Speed Control

`speed` (from file header, byte at offset 4) controls how many VBlank ticks elapse between new-note rows. Default is 6 (matching ProTracker's default). Each part row lasts `speed` ticks.

A complete part of 32 rows takes `32 * speed` ticks = 32 * 6 = 192 ticks at default speed.

At PAL VBlank rate (50Hz), each row lasts `speed / 50` seconds. Default: 6/50 = 0.12 seconds per row.

Equivalent BPM calculation: `BPM = (50 * 2.5) / speed = 125 / speed * (6/speed)` ... Actually the standard formula for Amiga trackers: rows per minute = 50 * 60 / speed = 3000 / speed. At speed 6: 500 rows/minute. Since ZoundMon has 32 rows per part (not 64), pattern rate = 500/32 = 15.625 parts per minute.

### E.4 Duration Calculation

From UADE ASM (`CalcDuration`):
```
Interrupts = speed * EndTab * 32     (total VBlank ticks)
Duration   = Interrupts / 50 + 1     (seconds, rounded up)
```

Wait, the actual calculation from `InitPlayer`:
```asm
lsl.w #5,D2       ; length * 32 (rows)
mulu.w D1,D2      ; speed * length * 32
```
where `D2` = EndTab (length), `D1` = speed. So:
```
Interrupts = (EndTab) * 32 * speed
Duration_seconds = Interrupts / 50
```

Note: this is the duration from `StartTab=0` to `EndTab`. Actual start position may differ.

---

## F. What the Existing TypeScript Parser Already Handles

### F.1 Detection (`isZoundMonitorFormat`)

The parser in `src/lib/import/formats/ZoundMonitorParser.ts` correctly implements:

1. **Filename check**: Requires `.sng` extension (case-insensitive)
2. **Structural offset computation**: `(byte[0]+1)*16 + (byte[1]+1)*128 + 869`
3. **Bounds check**: offset must be < buffer length
4. **Signature patterns**: Both `"df?:"` and `"?amp"` patterns with correct post-increment addressing logic

### F.2 Parsing (`parseZoundMonitorFile`)

Current parser is **DETECTION_ONLY** — it creates placeholder data:

- Derives module name from filename (strips `sng.` prefix)
- Creates 15 placeholder `'Synth'` instruments with no real data
- Creates a single empty 64-row pattern (not 32 rows as ZoundMon uses)
- Returns a single-position song with default speed 6, BPM 125
- Does NOT extract:
  - Actual header fields (MaxTable, MaxPart, StartTab, EndTab, speed)
  - Sample table data (names, volumes, lengths, loop points)
  - Table data (part assignments, transpositions)
  - Part/pattern data (notes, effects)
  - Sample PCM data (loaded from separate files)

### F.3 What Needs to Be Added for Full Native Playback

1. **Header parsing**: Extract MaxTable, MaxPart, StartTab, EndTab, speed from first 5 bytes
2. **Sample table parsing**: Read 16 x 54-byte sample entries, extract name/vol/length/replen/restart
3. **Table data parsing**: Read (MaxTable+1) x 16 bytes of table entries
4. **Part data parsing**: Read (MaxPart+1) x 128 bytes of part longwords, decode per section B
5. **Sample PCM data**: Samples are external files — need to handle external loading or embed in module
6. **WASM synth module**: Implement `zm_` prefixed functions following `format_synth_api.h` contract
7. **Replayer engine**: Port the `Player.c` / `ZoundMonitor_v1.asm` logic to the WASM module or TypeScript

---

## G. Key Differences from SoundMon (Reference Implementation)

ZoundMonitor is MUCH simpler than SoundMon:

| Feature                | SoundMon                          | ZoundMonitor                    |
|------------------------|-----------------------------------|---------------------------------|
| Instrument type        | Wavetable synth + PCM             | PCM only                        |
| Waveforms              | 16 built-in + custom wavetables   | None (samples only)             |
| ADSR envelope          | Full ADSR per instrument          | None (volume is static + additive) |
| Vibrato                | Sine LFO with delay               | None                            |
| Arpeggio               | Via arp table per instrument      | Via effect command per note      |
| Effects                | Arpeggio, vibrato, portamento     | Arpeggio, slide, ultra-slide    |
| Samples                | External files                    | External files                  |
| Rows per pattern       | 16                                | 32                              |
| Patterns shared?       | Yes (per voice via table)         | Yes (per voice via table)       |
| Table concept           | Yes (per-voice part assignment)  | Yes (identical concept)         |
| Speed                  | Global speed value                | Global speed value              |

The WASM synth for ZoundMonitor would primarily be a **PCM sample playback engine** with:
- Period-based pitch control
- Three effect types (arpeggio, slide, ultra-slide)
- Additive volume from three sources
- Amiga-style sample looping
- DMA restart logic

---

## H. WASM Implementation Notes

### H.1 Export Prefix

Following the convention in `format_synth_api.h`, ZoundMonitor exports should use the `zm_` prefix:
`zm_init`, `zm_load_instrument`, `zm_note_on`, `zm_note_off`, `zm_render`, `zm_set_param`, `zm_dispose`

### H.2 Instrument Blob Layout (Proposed)

Since ZoundMonitor is PCM-only, the instrument blob would be similar to SoundMon's PCM type:

```
[0]       type: 1 (PCM)
[1]       volume (0-64)
[2]       finetune (signed int8, if applicable — ZoundMon doesn't have finetune)
[3]       reserved
[4..7]    pcmLen (uint32 LE, in bytes)
[8..11]   loopStart (uint32 LE, in bytes — converted from restart * 2)
[12..15]  loopLen (uint32 LE, in bytes — converted from replen * 2)
[16..]    pcmData (pcmLen bytes of signed int8 PCM)
```

### H.3 Effect Processing in WASM

The WASM synth needs to handle three effects as part of its per-tick processing:
1. Arpeggio: maintain counter, cycle through 3 semitone offsets every 2 ticks
2. Slide: add signed delta to period every tick
3. Ultra-slide: linear interpolation of period over N ticks

The period-to-frequency conversion for rendering:
```c
float frequency = PAULA_CLOCK / (float)period;
// where PAULA_CLOCK = 3546895 (PAL) or 3579545 (NTSC)
```

### H.4 Volume Model

No ADSR envelope. Volume is computed once per new-note and remains constant until the next note. Three additive sources:
1. Sample base volume (from instrument data, 0-64)
2. Part data volume add (signed byte from bits 15-8)
3. Table volume add (signed byte from table entry)

Clamped to 0-64.

---

## I. Period Table Cross-Reference

For mapping ZoundMonitor note numbers to MIDI notes:

| ZM Note | Period | ~Freq Hz | Closest MIDI | Note Name |
|---------|--------|----------|--------------|-----------|
| 1       | 856    | 4143     | C-1 (ProTracker) | ~262Hz at /16 |
| 13      | 428    | 8287     | C-2          |           |
| 25      | 214    | 16574    | C-3          |           |

Actually, using PAL clock 3546895:
- Period 856: 3546895/856 = 4143.6 Hz... that's quite high. These are likely meant as Amiga hardware periods where the actual audible frequency depends on the sample's base rate.

Standard Amiga period for C-3 (middle C in ProTracker notation) is 428. ZoundMon's note 13 = period 428 = ProTracker C-3. So:

| ZM Note | ProTracker Note | MIDI Note |
|---------|-----------------|-----------|
| 1       | C-1             | 48        |
| 13      | C-2             | 60        |
| 25      | C-3             | 72        |

Wait — ProTracker's C-1 period is 856, which corresponds to MIDI note 48 (C3 in some naming conventions) at ~262Hz with a typical 8363 Hz base rate sample. The relationship is:

```
audible_freq = paula_clock / (period * 2)   // for 8-bit samples
// or more precisely:
audible_freq = paula_clock / period         // this is the DMA fetch rate
// actual pitch depends on sample's recorded pitch
```

For the WASM synth, the standard approach is:
```c
phase_increment = (paula_clock / period) / sample_rate;
```

---

## J. Summary of All Source Files Read

| File | Lines | Role |
|------|-------|------|
| `Zound.c` | 73 | Data structures, loader, period table |
| `Player.c` | 302 | Complete inline-assembly replayer |
| `LetsHearIt.c` | 32 | Example usage program |
| `INFORMATION-FILE` | 64 | User documentation |
| `ZoundMon.md` | 68 | Format overview doc |
| `ZoundMonitor.md` | 79 | Additional format doc |
| `ZoundMonitor_v1.asm` | 1038 | UADE EaglePlayer adaptation |
| `ZoundMonitorParser.ts` | 204 | Existing detection-only parser |
| `format_synth_api.h` | 173 | WASM synth API contract |
| `soundmon_synth.c` | 100+ | SoundMon reference implementation |
