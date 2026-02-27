# AY / YM (ZX Spectrum AY-emul)

**Status:** FULLY_NATIVE — Z80 CPU emulation + FurnaceAY chip synthesis
**Parser:** `src/lib/import/formats/AYParser.ts`
**Extensions:** `*.emul`, `*.ay`, `*.ym`, UADE eagleplayer
**UADE name:** ZXAYEMULPlayer, AYPlayer
**Reference files:** `Reference Music/AY Emul/` (1202 files)
**Reference:** ZXAYEMUL file format specification

---

## Overview

AY-emul (ZXAYEMUL) is a format for ZX Spectrum and Amstrad CPC music based on the
**AY-3-8910 / YM2149** Programmable Sound Generator (PSG) chip. Files store Z80
machine code from the original game or demo, plus the memory layout needed to run it.

DEViLBOX uses a **full Z80 CPU emulator** to execute the init and interrupt routines,
intercepts AY chip register writes via OUT port hooks, and reconstructs 3-channel
tracker patterns from the resulting register frame snapshots. Synthesis is then
performed by the `FurnaceAY` chip engine.

Two chip variants:
- **AY** (type 0) — AY-3-8910 (ZX Spectrum 128, CPC)
- **YM** (type 1) — YM2149F (Atari ST variant; same register set)

---

## File Layout

### ZXAYEMUL Header (variable length)

```
Offset  Size  Description
------  ----  -----------
0x00    8     Magic: "ZXAYEMUL"
0x08    1     Type: 0 = AY, 1 = YM
0x09    1     FileVersion (usually 0)
0x0A    1     PlayerVersion
0x0B    1     SpecialPlayerOffset
0x0C    2     AuthorOffset (i16BE, relative to offset 0x0C, points to author string)
              (Actually: offset 14 is 0x0E)
0x0E    2     AuthorOffset (i16BE, relative to this field; 0 = no author)
0x10    2     MiscOffset (i16BE, relative to this field; 0 = empty)
0x12    1     NumSongs - 1 (so numSongs = buf[0x12] + 1)
0x13    1     FirstSong (0-based default song index)
0x14    4     SongStructOffset (i32BE, relative to this field, points to song array)
0x18    ...   Variable data: strings, song descriptors, Z80 memory blocks
```

**String encoding:** Pointers are signed big-endian integers relative to their
own file position. A value of 0 = absent. Strings are null-terminated ASCII.

### Song Descriptor Array

Located at `0x14 + SongStructOffset`. Each song entry is **4 bytes**:

```
[0-1]  i16BE  → relative to this field → song name string
[2-3]  i16BE  → relative to this field → song data block
```

### Song Data Block

Located via each descriptor's data pointer:

```
[0-1]  u16BE  unused (flags/channel count)
[2-3]  u16BE  initAddr   — Z80 address of init routine
[4-5]  u16BE  intrAddr   — Z80 address of interrupt (play) routine
[6-7]  u16BE  stackAddr  — initial Z80 stack pointer
[8-9]  u16BE  additional register (usually 0)
[10+]  Memory block descriptors:
         u16BE targetAddr  — Z80 load address
         u16BE dataLen     — data length (0 = 65536 bytes)
         raw bytes         — Z80 machine code / data
       Terminated by two consecutive 0x0000 words
```

---

## AY Chip Register Map (16 registers)

The Z80 code writes to the AY chip via `OUT` instructions. DEViLBOX intercepts
these writes during the interrupt routine execution:

```
R0-R1   Tone period A (12-bit: R1 bits[3:0] = high, R0 = low)
R2-R3   Tone period B
R4-R5   Tone period C
R6      Noise period (5-bit)
R7      Mixer control (bits 0-2 = tone A/B/C enable, 3-5 = noise A/B/C)
R8      Volume A (bits[3:0]; bit4 = envelope mode)
R9      Volume B
R10     Volume C
R11-R12 Envelope period (16-bit)
R13     Envelope shape (4-bit)
R14-R15 I/O ports (not used for audio)
```

**Tone period to frequency:** `freq = AY_CLOCK / (16 × period)`
where `AY_CLOCK = 1,773,400` Hz (ZX Spectrum PAL AY clock).

**Period to MIDI note:** `note = round(12 × log2(freq / 440) + 69)`
Valid range: 1–96 (20 Hz to 20 kHz).

---

## Parsing Algorithm

The parser executes the following for each subsong:

1. **Load Z80 memory:** Map all memory blocks into the emulated Z80 address space.
2. **Run init routine:** Execute Z80 at `initAddr` until HALT or timeout.
3. **Run interrupt frames:** Execute Z80 at `intrAddr` for N frames (typically 300),
   capturing AY register state after each frame.
4. **Reconstruct patterns:** Compare consecutive frames; emit TrackerCell events
   (note-on, note-off, volume change) for each AY channel (A, B, C) when the
   register state changes.

**Pattern deduplication:** Identical consecutive 16-row blocks are merged into
the same pattern. Each subsong becomes a separate song in the output.

---

## Synthesis

Output uses **3 channels** (AY A, AY B, AY C) with `FurnaceAY` synthesis:
- Chip type: 6 (AY-3-8910)
- ops: 2

Volume levels: AY hardware volumes 0–15 are linearly mapped to XM volumes 0–64.

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/AYParser.ts`
- **Z80 CPU:** `src/lib/import/cpu/CpuZ80.ts`
- **FurnaceAY synth:** `FurnaceAY` chip type in the Furnace WASM engine

---

## Implementation Notes

**Current status:** FULLY_NATIVE — Z80 emulation at parse time; FurnaceAY synthesis.

The Z80 emulation runs at parse time (not playback time), producing a static
TrackerSong from the AY register snapshots. This means the pattern data reflects
what the Z80 code would have played, captured as note/volume events.

**AY Amadeus** files (`.amad`) in `Reference Music/AY Amadeus/` use a different
format (not ZXAYEMUL) and are handled by a separate parser path.

**Interrupt timing:** Each interrupt frame corresponds to one 50 Hz Spectrum frame
(~20ms). The parser samples 300 frames (~6 seconds) by default, sufficient to
capture most AY songs before they loop.
