---
date: 2026-04-05
topic: wally-beben-format
tags: [wally-beben, amiga, format, parser, uade]
status: final
---

# Wally Beben Format — Binary Structure Research

**Files examined**: `total eclipse.wb` (60192 bytes), `dark side.wb` (62650 bytes), all 21 files in collection  
**Player source**: `third-party/uade-3.05/amigasrc/players/wanted_team/WallyBeben/src/Wally Beben_v1.asm`  
**Existing parser stub**: `src/lib/import/formats/WallyBebenParser.ts`

---

## File Type

A Wally Beben `.wb` file is a **self-contained 68k executable**. It contains the music player code and all music data (song structures, sample data) in one binary. UADE loads and runs it directly. The file is NOT a hunk-format executable — it lacks HUNK headers. It is a raw position-independent-ish 68k program with embedded absolute addresses that UADE patches at load time.

Detection already implemented correctly in the existing stub. The Check2 signature is:
- `u16BE(0)` = `0x6000` (BRA opcode)  
- `u16BE(2)` = positive, even, non-zero displacement  
- `u32BE(4)` = `0x48E7FFFE` (MOVEM.L all registers to stack)  
- `u16BE(8)` = `0x6100` (BSR opcode)

---

## Two Variants

| Variant | Detection | Example |
|---------|-----------|---------|
| **New format** | `u16BE(20)` == `0x4CF9` | total eclipse.wb |
| **Old format** | `u16BE(20)` != `0x4CF9` | dark side.wb, most files |

Nearly all files (20/21) use the old format. Only `total eclipse.wb`, `circusgames.wb`, `superman.wb` use new format. The distinction matters for internal player patches but does NOT affect the metadata parsing algorithm below.

---

## Origin (Load Base)

The file embeds an **origin** — the expected Amiga load address — in the code. All absolute address references in the file are relative to this origin. UADE patches them to the actual load address at runtime.

**Extracting origin**:
1. Scan for opcode `0x1039` (MOVE.B absaddr,D0) starting from offset 0
2. Let `abs_addr` = `u32BE(scan_pos + 2)`
3. Let `d0` = `scan_pos + 2` (A1 position after opcode word)
4. `origin` = `(abs_addr - d0) & 0xFFFFFFFF`

**File offset from stored absolute address**:
```
if origin >= 0x80000000:   # negative/small origin (old format typical)
    file_off = (stored_abs - origin) & 0xFFFFFFFF
else:                       # positive origin
    file_off = stored_abs - origin
```

**Observed origins across 21 files**:
- `0xFFFFFFF8` (-8): most old-format files (dark side, elite, foundation's waste, phantasm)
- `0xFFFFFFF4` (-12): ballgame, colossus chess, futuresport, hammerfist, pool of radiance, time machine
- `0x000299A8`: total eclipse (new format, large positive)
- `0x0000000C`: circusgames, superman (new format, small positive)
- Various small positive values: hawkeye, lancaster, mr do!, quartz, sdi, hyperdrome

---

## SongsPtr Table

The **SongsPtr** table holds absolute pointers to voice sequence byte streams. It's found by:
1. Scan for `0x223C` (MOVE.L #n,D1) — this also gives the subsong count
2. Continue scanning for the first `0x41F9` (LEA abs,A0) after the `0x223C`
3. The `0x41F9` operand = absolute address of SongsPtr table
4. Convert to file offset using origin formula above

**Table structure**:
- Contains `N_subsongs * 4` voice sequence pointer entries
- Each entry is 4 bytes (a 32-bit absolute address OR a 16-bit address in high word — see below)
- Entries 0..3 = voice pointers for subsong 1, entries 4..7 = subsong 2, etc.
- After the voice seq entries, the table continues with **phrase/pattern definition pointers** (not needed for metadata parsing)

### Pointer Entry Format

Two sub-formats detected from the low 16 bits of the first entry:

| Format | Detection | How to read file offset |
|--------|-----------|------------------------|
| `u32` | `u32BE(songs_ptr) & 0xFFFF != 0` | `abs_addr - origin` (standard) |
| `u16hi` | `u32BE(songs_ptr) & 0xFFFF == 0` | `(u32BE >> 16) - (origin & 0xFFFF)` |

Only `hyperdrome.wb` uses `u16hi`. All other 20 files use `u32`.

For `u16hi`: the 16-bit address is stored in the **upper 16 bits** of the 4-byte entry, lower 16 bits are 0x0000.

---

## Subsong Count

From opcode `0x223C` (MOVE.L #n,D1):
```
for i in range(0, min(0x200, file_len - 6), 2):
    if u16BE(i) == 0x223C:
        subsong_count = u32BE(i + 2)
        break
```

The stored value IS the subsong count directly (UADE stores it as `count - 1` internally, but the raw immediate = subsong count).

Observed range: 2–9 subsongs across the collection.

---

## Voice Sequences (Song Position Data)

Each voice sequence is a **byte array terminated by 0xFF**. Each byte is an index into the phrase table (defined by the remaining entries in the SongsPtr table after the voice seq entries).

For metadata purposes, the **length of the longest voice sequence** serves as a proxy for song length in steps.

```
for each subsong (0 to N-1):
    for each voice (0 to 3):
        ptr_off = songs_ptr + (subsong * 4 + voice) * 4
        seq_addr = read_pointer(ptr_off)  # using origin formula
        seq_bytes = read_until_0xFF(seq_addr)
        # seq_bytes is the "position list" for this voice
```

---

## Sample Table

**SamplesPtr table**: Array of 4-byte absolute pointers to raw PCM sample data, null-terminated.

Found via opcode `0xE584` (ASL.L #2,D4) in the player code:
1. Scan for `0xE584`
2. Check if bytes at `scan_pos - 6` to `scan_pos - 5` contain `0x41F9` or `0x43F9`
3. The LEA operand at `scan_pos - 4` = absolute address of SamplesPtr table
4. Count non-null entries = sample count

**SamplesLen table** (at a separately-found address): 8-byte entries per sample:
```
struct WBSampleEntry {
  u8  seq_index;     // sequential index (0, 1, 2...)
  u8  loop_flag;     // 1 = has loop, 0 = no loop
  u16 length_bytes;  // sample length in bytes
  u16 loop_start;    // loop start offset in bytes
  u16 loop_len;      // loop length in bytes (0x0002 = minimum/no-loop marker)
}
```

Validated against 11 samples in total eclipse.wb — the `length_bytes` values match exactly the differences between consecutive pointer entries.

For metadata (UADE handles actual playback), we only need the sample **count**, which can be derived from the SamplesPtr null-terminator scan.

---

## Period Table

Located in the player code section. Contains **36 entries** (3 octaves, C-1 to B-3):
- C-1 period = 856 (0x0358) — this double-word is the UADE scan marker
- B-3 period = 113 (0x0071)
- Standard Amiga chromatic scale (12 notes/octave)

The period table may be preceded by an additional octave (C-0 through B-0, periods 1616–904) not part of the main 36-entry range.

---

## Number of Channels

**Always 4** (Amiga has 4 DMA channels). The SongsPtr table always has `N_subsongs * 4` voice sequence entries.

---

## BPM / Timing

No explicit BPM field. The player is interrupt-driven at the **Amiga VBlank rate** (50 Hz PAL, 60 Hz NTSC). Effective tempo depends on internal counter values embedded in the music code. For display purposes, 125 BPM is a reasonable default approximation.

---

## File Layout Map (Total Eclipse, 60192 bytes)

```
0x0000  BRA opcode (0x6000) + displacement (0x07FE)
0x0004  Player function (MOVEM.L — called by UADE every VBlank)
0x000E  First RTS (0x4E75) — SubSongPtr anchor
0x001C  MOVE.B absaddr,D0 (0x1039) — origin anchor; abs=0x000299C6, origin=0x000299A8
0x0034  MOVE.L #2,D1 (0x223C) — subsong count = 2
0x0046  LEA SongsPtr,A0 (0x41F9) — SongsPtr abs=0x0002A742 → file=0x0D9A
0x0064  ADDA.L D1,A0 (0xD1C1) — VoicesPtr (runtime state, zeros in file)
0x09FC  ASL.L #2,D4 (0xE584) — SamplesPtr marker; LEA at 0x09F6 → file=0x0C6A

0x0AE2  Period table (36 × u16, 72 bytes): C-1(856) to B-3(113)
0x0B2A  BSS/zeros: runtime state area
0x0CA6  SamplesLen table (14 × 8 bytes = 112 bytes)
0x0C6A  SamplesPtr table (13 entries + null terminator = 52 bytes)
0x0D9A  SongsPtr table (32 × 4 bytes = 128 bytes):
        [0..7]   = voice sequence pointers for 2 subsongs (4 voices each)
        [8..31]  = phrase/pattern definition pointers
0x0E26  Voice sequence data + phrase/pattern command streams
        (byte arrays terminated by 0xFF)
0x3DBC  Sample data: 13 contiguous raw 8-bit signed PCM samples
0xEB2C  Sample 11 start (extends to EOF)
```

---

## Phrase/Pattern Command Encoding (informational)

The byte sequences in phrase entries are **variable-length command streams**. Bytes < some threshold are note indices into the period table; bytes >= threshold are control commands. The exact command byte encoding is undocumented from this research (would require tracing the 68k player code in the module). For DEViLBOX purposes, UADE handles decoding; we only need metadata.

Observed command byte ranges in phrases:
- `0x00–0x23` (0–35): likely note indices (matches 36-entry period table)
- `0x80–0xFF`: control commands (instrument select, tempo, vibrato, etc.)
- `0xFF` within voice sequences: end-of-sequence marker

---

## Metadata Parsing Algorithm (Production Quality)

```typescript
function parseWBMetadata(data: Uint8Array): {
  subsongs: number;
  maxSteps: number;
  numSamples: number;
  isOldFormat: boolean;
} {
  const u16 = (off: number) => (data[off] << 8) | data[off+1];
  const u32 = (off: number) =>
    (((data[off] << 24) | (data[off+1] << 16) | (data[off+2] << 8) | data[off+3]) >>> 0);

  // 1. Subsong count
  let nSubsongs = 1;
  for (let i = 0; i < Math.min(0x200, data.length - 6); i += 2) {
    if (u16(i) === 0x223C) { nSubsongs = u32(i + 2); break; }
  }

  // 2. Origin
  let origin = 0;
  for (let i = 0; i < Math.min(0x200, data.length - 6); i += 2) {
    if (u16(i) === 0x1039) {
      const absAddr = u32(i + 2);
      const d0 = i + 2;
      origin = (absAddr - d0) >>> 0;
      break;
    }
  }
  const toFileOff = (abs: number): number => {
    const result = origin > 0x80000000
      ? (abs - origin + 0x100000000) & 0xFFFFFFFF
      : abs - origin;
    return (result > 0 && result < data.length) ? result : -1;
  };

  // 3. SongsPtr
  let songsPtr = -1;
  let isU16Hi = false;
  let past223c = false;
  for (let i = 0; i < Math.min(0x200, data.length - 6); i += 2) {
    if (u16(i) === 0x223C) { past223c = true; }
    if (past223c && u16(i) === 0x41F9) {
      const foff = toFileOff(u32(i + 2));
      if (foff > 0 && foff + 4 < data.length) {
        isU16Hi = (u32(foff) & 0xFFFF) === 0;
        songsPtr = foff;
      }
      break;
    }
  }

  // 4. Max voice sequence length
  let maxSteps = 0;
  if (songsPtr >= 0) {
    for (let i = 0; i < nSubsongs * 4; i++) {
      const ptrOff = songsPtr + i * 4;
      let foff: number;
      if (isU16Hi) {
        const hi16 = (u32(ptrOff) >>> 16) & 0xFFFF;
        foff = hi16 - (origin & 0xFFFF);
      } else {
        foff = toFileOff(u32(ptrOff));
      }
      if (foff < 0 || foff >= data.length) break;
      let steps = 0;
      for (let j = 0; j < 500 && foff + j < data.length; j++) {
        if (data[foff + j] === 0xFF) break;
        steps++;
      }
      maxSteps = Math.max(maxSteps, steps);
    }
  }

  // 5. Sample count
  let numSamples = 0;
  for (let i = 0; i < data.length - 8; i += 2) {
    if (u16(i) === 0xE584) {
      const leaPos = i - 4;
      if (leaPos >= 2) {
        const leaOp = u16(leaPos - 2);
        if (leaOp === 0x41F9 || leaOp === 0x43F9) {
          const spOff = toFileOff(u32(leaPos));
          if (spOff > 0 && spOff < data.length) {
            for (let j = 0; j < 64; j++) {
              const ptr = u32(spOff + j * 4);
              if (ptr === 0 || toFileOff(ptr) < 0) break;
              numSamples++;
            }
          }
        }
      }
      break;
    }
  }

  return {
    subsongs: nSubsongs,
    maxSteps,
    numSamples,
    isOldFormat: u16(20) !== 0x4CF9,
  };
}
```

---

## Validation Results (21 files)

```
ballgame.wb             : 2 subsongs, 135 steps, 19 samples
circusgames.wb          : 7 subsongs,  39 steps,  5 samples
colossuschessx 1024k.wb : 5 subsongs,  90 steps, 13 samples
colossuschessx 512k.wb  : 5 subsongs,  90 steps, 13 samples
dark side.wb            : 2 subsongs, 154 steps, 15 samples
elite.wb                : 2 subsongs,  75 steps,  5 samples
foundation'swaste.wb    : 3 subsongs, 123 steps, 16 samples
futuresport.wb          : 3 subsongs,  59 steps,  7 samples
hammerfist.wb           : 8 subsongs,  94 steps, 13 samples
hawkeye.wb              : 7 subsongs,  68 steps, 13 samples
hyperdrome.wb           : 3 subsongs, 119 steps,  0 samples (u16hi fmt, sample scan incomplete)
lancaster.wb            : 2 subsongs,  36 steps, 14 samples
mr do! run run.wb       : 6 subsongs,  40 steps,  3 samples
phantasm.wb             : 4 subsongs,  65 steps,  8 samples
pool of radiance.wb     : 7 subsongs,  30 steps, 13 samples
quartz.wb               : 2 subsongs, 105 steps, 11 samples
sdi.wb                  : 8 subsongs,  54 steps, 13 samples
superman.wb             : 4 subsongs,  87 steps,  2 samples
timemachine ingame.wb   : 9 subsongs,  98 steps,  7 samples
timemachine title.wb    : 4 subsongs, 105 steps, 10 samples
total eclipse.wb        : 2 subsongs,  46 steps, 11 samples
```

---

## Notes for Implementation

1. **UADE handles all playback** — the parser only provides metadata display
2. **4 channels always** — Paula DMA voices 1–4
3. **BPM**: use 125 as default (interrupt-driven, no explicit field)
4. **Detection**: existing `isWallyBebenFormat()` is correct and sufficient
5. **Subsong display**: show as "Song 1 of N" where N = subsong count from `0x223C`
6. **Sample count**: reliable for 20/21 files; hyperdrome's u16hi sample scan is incomplete
7. **The `sdi.wb` file** has an unusually large origin (0x4E3EE) — parser handles it correctly
