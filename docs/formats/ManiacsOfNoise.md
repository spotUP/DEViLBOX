---
date: 2026-02-27
topic: maniacs-of-noise-mon-format
tags: [amiga, uade, macro-synth, 68k, format-research]
status: analyzed-deferred
---

# Maniacs Of Noise — `.mon` Format

**Status:** Analyzed. Deferred — macro-synth engine requires 68k emulation for correct playback.

---

## Overview

The `.mon` format is a self-contained Amiga 68k binary. Each file contains the **complete
replay engine compiled in**, along with song data and audio assets. There is no single fixed
binary layout: each file is effectively a compiled program.

**Extensions:** `.mon`
**Eagleplayer:** `ManiacsOfNoise` (1,292 bytes — the smallest UADE player; it's just a shim)
**Reference files:** 27 files across 3 composers

### Composers / Sub-types

| Composer | File sizes | Synth type |
|----------|-----------|------------|
| Jeroen Tel | 7–8 KB | **Macro-synth** (no PCM samples) |
| Charles Deenen | 10–212 KB | **PCM-sampler** (hardware DMA + macro control) |
| Reyn Ouwehand | 10–101 KB | **PCM-sampler** |

---

## Binary Structure

### Common Header (all `.mon` files)

```
Offset  Size  Content
------  ----  -------
0x0000  4     JSR (d16,PC)  — init routine entry point
0x0004  4     JSR (d16,PC)  — play routine entry point
0x0008  4     JSR (d16,PC)  — stop routine entry point
0x000C  var   Credits text (ASCII, null-terminated or length-delimited)
              e.g. "Music by MANIACS of NOISE/ 02-02-90"
              e.g. "  Music by Maniacs of Noise/Charles Deenen 14-05-90 ..."
              Followed by: 68k replayer code
```

The 3 JSRs form a dispatcher table. UADE calls `init()`, then `play()` on each tick, then
`stop()` when done.

### Decoding Jump Targets

`JSR (d16,PC)` = opcode `4E FA xx xx`. Target = (instruction_offset + 2) + signed_d16.

Example — `gyroscope.mon`:
```
0x0000: 4E FA 00 0A  → init  = 0x0002 + 0x000A = 0x000C
0x0004: 4E FA 01 5C  → play  = 0x0006 + 0x015C = 0x0162
0x0008: 4E FA 00 64  → stop  = 0x000A + 0x0064 = 0x006E
```

Example — `flimbos quest.mon`:
```
0x0000: 4E FA 00 2E  → init  = 0x0002 + 0x002E = 0x0030
0x0004: 4E FA 01 A8  → play  = 0x0006 + 0x01A8 = 0x01AE
0x0008: 4E FA 00 B0  → stop  = 0x000A + 0x00B0 = 0x00BA
```

---

## Init Routine Analysis

The init routine:
1. Sets A5 to the **runtime data workspace** via `LEA d16(PC), A5` (at the very start of init)
2. Builds a **waveform macro pointer table** at A5+0x0000 using repeated `LEA d16(PC),A0; MOVE.L A0,(A1)+`
3. Resets A1 mid-way via `LEA 0x18(A5), A1` and builds a second block of the table
4. Stores a **song data pointer** at A5+0x013C

### Computed Load Address

The runtime data workspace is populated with absolute Amiga memory addresses. The load
address can be back-computed from any PC-relative LEA in the init vs the stored value:

**`flimbos quest.mon` load address = 0x7000** (verified against all 13 waveform entries)

Formula: `loadAddress = storedAbsoluteAddress - fileOffset_of_target`

### Waveform Pointer Table (flimbos quest.mon)

```
A5+0x0000 = 0x7356 → file offset 0x0356  (instrument macro 1)
A5+0x0004 = 0x729C → file offset 0x029C  (instrument macro 2)
A5+0x0008 = 0x7294 → file offset 0x0294  (instrument macro 3)
A5+0x000C = 0x72BA → file offset 0x02BA  (instrument macro 4)
A5+0x0010 = 0x72E6 → file offset 0x02E6  (instrument macro 5)
A5+0x0014 = 0x7336 → file offset 0x0336  (instrument macro 6)
A5+0x0018 = 0x738A → file offset 0x038A  (instrument macro 7)
A5+0x001C = 0x7396 → file offset 0x0396  (instrument macro 8)
A5+0x0020 = 0x73B0 → file offset 0x03B0  (instrument macro 9)
A5+0x0024 = 0x73CA → file offset 0x03CA  (instrument macro 10)
A5+0x0028 = 0x7390 → file offset 0x0390  (instrument macro 11)
A5+0x002C = 0x740C → file offset 0x040C  (instrument macro 12)
A5+0x0030 = 0x73DE → file offset 0x03DE  (instrument macro 13)
```

---

## Instrument Macro System

**This is the key architectural insight**: the "waveforms" stored in the pointer table are NOT
PCM audio data. They are small blocks of **68k machine code** (macros) that run per-tick to
control the Amiga's Paula custom chip hardware registers directly.

### Example Macro (instrument 6 from `gyroscope.mon`, file offset 0x0336)

```
11 40 00 34   MOVE.B D0, 0x0034(A0)   ; write byte to hardware period register
60 D6         BRA.B  -0x2A            ; jump back to replayer main loop
```

This 6-byte macro: writes a computed period byte to an Amiga custom chip register, then
loops back. This IS the synthesis — a single register write per tick that creates a tone.

### More Complex Macros

```
26 4C         MOVEA.L A4, A3
D6 C2         ADD.B D2, D3
21 4B 00 08   MOVE.L A3, 8(A0)      ; set DMA sample data pointer
21 4B 00 0C   MOVE.L A3, 0xC(A0)    ; set DMA sample data pointer alt
21 4A 00 04   MOVE.L A2, 4(A0)      ; set loop start
60 00 FE 5A   BRA    0xFE5A         ; jump back
```

---

## PCM Sample Data (Large Files)

For Charles Deenen and Reyn Ouwehand songs, the macros set up hardware DMA to play PCM
audio. The PCM data is embedded after the replayer code and song sequence data.

**`flimbos quest.mon`** (101,480 bytes):
- PCM data starts around file offset 0x08000
- Offset 0x08000 contains smooth sine-like waveform data (PCM confirmed)
- The bulk of the file (≈85KB) is PCM sample audio
- PCM is 8-bit signed, big-endian, mono (Amiga standard)

Sample region at 0x08000:
```
offset 0x08000: 23, 24, 19, 9, -4, -16, -32, -21 ...  (smooth = typical PCM)
offset 0x14000: -31, -11, 11, 31, 45, 45, 32, 13 ...   (smooth = typical PCM)
```

The macro code (at 0x0294 etc.) sets up the Amiga DMA registers pointing into this PCM region.
The exact offset of each PCM sample is stored as an Amiga memory address inside the macro code.

---

## Song Data

Song sequence/pattern data is stored in a packed format between the code and sample sections.
Observed at offset 0x1C00 in `gyroscope.mon` (7,788 bytes):

```
0b30 08f1 0c30 0830 0830 0830 08f1 0b30 08f1 0c30 ...
```

Values like `0x30` (C), `0x31` (C#), etc. appear to be note codes. `0xF1` = possible effect
command. `0x08`, `0x0B`, `0x0C` are likely octave/instrument byte prefixes.

---

## UADE Player Shim

`Reference Code/uade-3.05/players/ManiacsOfNoise` (1,292 bytes):

```
Contains: "MON player for UADE by shd (based on replayer by Frederick Hahn and
           Maniacs of Noise/Charles Deenen)"
```

This is a HUNK-format loader that:
1. Loads the `.mon` file into Amiga memory at a fixed base address
2. Calls the `init()` function at offset 0x0000 (via the JSR table)
3. Calls `play()` on each CIA timer interrupt
4. Calls `stop()` when playback ends

The replayer in each `.mon` file handles everything else (DMA, macro execution, sequencing).

---

## Why Deferred

A native WASM implementation requires reimplementing:

1. **The 68k macro execution engine** — instrument macros are arbitrary 68k code; they write
   directly to Amiga hardware registers, so they'd need to be disassembled per-song and
   translated to equivalent synthesis operations. Different songs may use completely
   different macro patterns.

2. **The Paula DMA model** — macros set up DMA to play PCM at a specific period (frequency),
   with loop points stored as Amiga memory addresses inside the macro code.

3. **Variable file structure** — each `.mon` file has its own compiled replayer; there's no
   fixed binary layout. Even the waveform table position varies by song.

UADE already handles this correctly by running the real 68k code. The correct DEViLBOX strategy
is to keep UADE for synthesis and instead focus on **metadata extraction**.

---

## What IS Extractable Statically

### ✅ Credits text
At offset 0x000C, immediately after the 3-JSR table. Read until null byte or until the first
non-printable byte that's not a space/slash/newline. Use as the "artist" metadata.

### ✅ Song title
Sometimes in the credits string: `"Music by Maniacs of Noise/Charles Deenen 14-05-90 for Interplay Productions"`

### ✅ Number of instruments (approximate)
Count the LEA + MOVE.L pairs in the init code. Each pair adds one waveform pointer.

### ✅ File sub-type (macro-synth vs PCM-sampler)
- File size < 20KB → macro-synth (Jeroen Tel style)
- File size > 20KB → PCM-sampler (Charles Deenen / Reyn Ouwehand style)

### ❌ Instrument names
Not stored anywhere in the file. The macro system has no named instruments.

### ❌ Per-instrument parameters
Embedded in arbitrary 68k code; not extractable without a 68k disassembler.

---

## Parser Implementation Recommendation

```typescript
// ManiacsOfNoiseParser.ts - DETECTION ONLY (no native synthesis)
export function parseManiacsOfNoiseFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const data = new Uint8Array(buffer);

  // Verify: starts with 3 JSR (d16,PC) instructions
  if (data[0] !== 0x4E || data[1] !== 0xFA) throw new Error('Not a MON file');
  if (data[4] !== 0x4E || data[5] !== 0xFA) throw new Error('Not a MON file');
  if (data[8] !== 0x4E || data[9] !== 0xFA) throw new Error('Not a MON file');

  // Extract credits text at offset 0x000C
  let credits = '';
  for (let i = 0x0C; i < Math.min(buffer.byteLength, 0x0C + 80); i++) {
    const c = data[i];
    if (c === 0 || (c < 0x20 && c !== 0x0A && c !== 0x0D)) break;
    if (c >= 0x20 && c < 0x7F) credits += String.fromCharCode(c);
  }
  credits = credits.trim();

  // Return one UADESynth instrument with credits as name
  return {
    instruments: [{ name: credits || 'Maniacs Of Noise', synthType: 'UADESynth', config: {} }],
    patterns: [],
    // ... other TrackerSong fields
  };
}
```

---

## Alternative Approach: MON-as-Sampler

For the PCM-based files (> 20KB), it may eventually be possible to:
1. Parse the init code to extract the waveform macro table
2. Decode each macro to find which PCM offset it references
3. Extract PCM samples as raw audio data
4. Use the Amiga period values from the macros as the base pitch
5. Play via the existing WASM Sampler engine

This would require a 68k disassembler pass on the macro code to find Amiga DMA register
write instructions (`MOVE.L Ax, $DFF0xx`). Complex but possible in the future.

---

## Reference Files

| File | Composer | Size | Type |
|------|----------|------|------|
| `gyroscope.mon` | Jeroen Tel | 7,788 B | Macro-synth |
| `conspiracy - cracktro.mon` | Jeroen Tel | 7,884 B | Macro-synth |
| `unreal flying.mon` | Reyn Ouwehand | 10,520 B | Macro-synth or small-PCM |
| `flimbos quest.mon` | Reyn Ouwehand | 101,480 B | PCM-sampler |
| `chinese chess (ingame).mon` | Charles Deenen | 39,856 B | PCM-sampler |
| `chinese chess (title).mon` | Charles Deenen | 201,278 B | PCM-sampler |
| `dragonwars-title.mon` | Charles Deenen | 212,040 B | PCM-sampler |

---

## Next Steps

1. Implement `ManiacsOfNoiseParser.ts` for DETECTION ONLY (credits extraction, UADE synthesis)
2. Future: consider a macro-disassembler for PCM offset extraction in the PCM sub-type files
3. Macro-synth sub-type (Jeroen Tel) would need a full 68k macro interpreter — very low priority
