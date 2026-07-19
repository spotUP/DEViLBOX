---
date: 2026-04-04
topic: pretracker-replayer-decompile
tags: [pretracker, ghidra, decompile, wasm, replayer]
status: in-progress
---

# PreTracker Replayer Decompilation Research

## Binary Source
- `third-party/uade-3.05/amigasrc/players/pretracker/pretracker.bin` (19,300 bytes)
- 68000 big-endian machine code, no symbols
- (c) Pink/aBYSs, from PreTracker 1.5 distribution
- LGPL licensed

## Jump Table (at offset 0x00, BE32 offsets)
| Offset | Target | Function | Status |
|--------|--------|----------|--------|
| +0x00 | 0x0060 | songInit dispatch | Decompiled (stub) |
| +0x04 | 0x007E | playerInit dispatch | Decompiled (stub) |
| +0x08 | 0x009C | playerTick dispatch | Decompiled (stub) |
| +0x0C | 0x00AC | startSong dispatch | Decompiled (stub) |
| +0x10 | 0x00BE | stop dispatch | Decompiled (stub) |
| +0x14 | 0x00E0 | stopChannels dispatch | Decompiled (stub) |
| +0x18 | 0x00F0 | setVolume dispatch | Decompiled (stub) |
| +0x1C | 0x23D0 | prt_songInit (real) | Decompiled ✓ |
| +0x20 | 0x2866 | prt_playerInit (real) | Decompiled ✓ |
| +0x24 | 0x03C8 | prt_playerTick (real) | **FAILED** — too large for Ghidra |
| +0x28 | 0x219E | prt_startSong (real) | Decompiled ✓ |
| +0x2C | 0x0308 | prt_stop (real) | Decompiled ✓ |
| +0x30 | 0x0102 | prt_initChannel (real) | Decompiled ✓ |
| +0x34 | 0x03BC | prt_setVolume (real) | Decompiled ✓ |

## Function Analysis

### Decompiled Successfully (20 functions, 2317 lines)
- **prt_songInit** (0x23D0, ~450 lines): Parses PRT binary header. Checks magic "PRT" + version. Copies instrument/sample table, sets up pattern pointers, creates wavetable lookup tables. Fills period-to-note tables. Returns chipmem size needed.
- **prt_playerInit** (0x2866, ~1300 lines): The BIG initialization function. Generates per-note waveforms for all 12 semitones (synth instruments). Precomputes wavetables into chipmem. Also sets up initial Paula registers. This is where PreTracker's unique wavetable synthesis happens.
- **prt_startSong** (0x219E, ~250 lines): Starts a subsong. Resets channel state, loads initial instrument, sets Paula registers for all 4 channels.
- **prt_stop** (0x0308, ~20 lines): Clears DMA enable bits, zeros volumes.
- **prt_initChannel** (0x0102, ~180 lines): Resets per-channel state (4 channels repeated). Writes initial Paula sample/period/volume for each channel.
- **prt_setVolume** (0x03BC, 5 lines): Sets master volume byte.
- **prt_setupSong** (0x1F36, ~120 lines): Loads song position data into channel state.
- **prt_applyFilter** (0x21AE, ~100 lines): Post-processing filter on rendered waveforms.
- **prt_memcpy/memset** (0x2344/0x2798): Standard memory operations.
- **prt_mulu32/divu32/divs32/mods32/modu32**: 32-bit math helpers (68k doesn't have native 32-bit multiply/divide).

### DECOMPILE FAILED
- **prt_playerTick** (0x03C8-0x1F36): 2063 assembly lines, ~7000 bytes. The entire sequencer + effect processor + channel updater. This is the critical function that advances playback each tick (50Hz).

## Architecture Understanding

PreTracker is NOT a traditional sample-based tracker. It's a **wavetable synthesizer**:

1. **prt_songInit** parses the module and extracts instrument definitions
2. **prt_playerInit** PRE-RENDERS entire waveforms for each instrument into chipmem (up to 256KB). Each instrument has up to 12 semitone variants. The rendering involves oscillator mixing, filtering, and effects — all computed at init time, not per-tick.
3. **prt_playerTick** reads pattern data, selects pre-rendered waveforms, and programs Paula DMA registers to play them. Effects like vibrato, portamento modify the playback parameters.

### Paula Register Usage
The decompiled code writes directly to Amiga custom chip addresses:
- `0xDFF096` = DMACON (DMA control)
- `0xDFF09A` = INTENA (interrupt enable)  
- `0xDFF0A0-AF` = Channel 0 (AUDxLCH, AUDxLEN, AUDxPER, AUDxVOL)
- `0xDFF0B0-BF` = Channel 1
- `0xDFF0C0-CF` = Channel 2
- `0xDFF0D0-DF` = Channel 3
- `0xDFF004` = VPOSR (vertical beam position — used for timing)
- `0xBFE001` = CIAA PRA (audio filter control)

### Data Structures
The main player state (`param_1` in most functions) is a large structure (~0xA03+ bytes) containing:
- Per-channel state at offsets 0x00, 0x27E, 0x502, 0x77A (stride ~0x27E per channel)
- Song position data, pattern pointers, instrument tables
- Pre-rendered waveform data in separate chipmem buffer

The instrument definition structure (pointed to by the module's instrument table) is 0x2A (42) bytes per instrument, containing oscillator parameters, filter settings, envelope data.

## Files Created
- `pretracker-wasm/src/pretracker/pretracker_ghidra_decompiled.c` — 22 functions, 2317 lines
- `pretracker-wasm/src/pretracker/pretracker_disasm.s` — Full 5699-line disassembly
- `pretracker-wasm/src/pretracker/playerTick_disasm.s` — playerTick only, 2063 lines

## Effort Estimate
To create a working standalone C replayer:

1. **Manual decompilation of playerTick** (~2063 asm lines → ~800-1000 C lines). This requires:
   - Understanding the sequencer state machine (position tracking, pattern reading)
   - Effect processing (vibrato, portamento, volume slides, arpeggio)
   - Paula register write mapping to paula_soft.h API calls
   - Testing against UADE reference output

2. **Data structure definition** — Create proper C structs for the player state and channel data, replacing Ghidra's raw offset arithmetic.

3. **Paula integration** — Map all `_DAT_00dffXXX` writes to `paula_set_*()` calls.

4. **Module loading** — The songInit function needs to parse the binary and populate state.

5. **WASM harness** — Wire everything into the existing pretracker_wrapper.c pattern.

This is roughly 2-3 focused sessions of work. The playerTick manual decompilation is the largest task.

## Ghidra Results
- 300s timeout: FAILED
- 600s timeout with normalize simplification: FAILED  
- Function body: 5516 bytes, too complex for Ghidra's decompiler
- Must be manually translated from 68k disassembly

## playerTick Structure (from disassembly analysis)
- Entry: 0x3C8, allocates 40 bytes stack frame, saves d2-d7/a2-a3/a5-fp
- a3 = player state pointer (param), a0 = working copy
- Checks `a3[0xA02]` — if set, jumps to 0x1566 (channel processing loop)
- Main body (0x3DE-0x904): single-channel tick processing
  - Position tracking: a0[0x2C] (position counter), a0[0x32] (speed), a0[0x14] (???)
  - Volume: a0[0x1A] (current vol), a0[0x2A] (vol delta), clamps to 0-64
  - Delay: a0[0x6C] (delay counter), a0[0x1E] (note data)
  - State machine: a0[0x42] holds current state (0=idle, 1=envelope, 3=sustain)
  - Envelope: a0[0x5C] (position), a0[0x46] (phase counter)
  - Period table at PC+0x43C0 (DAT_000043c0)
  - Pattern data: a0[0x3E] → instrument pointer, a0[0x3A] → pattern pointer
- Channel loop at 0x1566: iterates 4 channels
  - Processes ch0 at a3+0x000, ch1 at a3+0x27E, ch2 at a3+0x502, ch3 at a3+0x77A
  - Each iteration writes Paula registers for that channel
  - Paula channel mapping: ch0→DFF0A0, ch1→DFF0B0, ch2→DFF0C0, ch3→DFF0D0
- Two RTS points: 0x904 (early exit), 0x1B2C (normal exit)

## Files Created
- `pretracker-wasm/src/pretracker/pretracker_ghidra_decompiled.c` — 22 functions, 2317 lines
- `pretracker-wasm/src/pretracker/pretracker_disasm.s` — Full 5699-line disassembly
- `pretracker-wasm/src/pretracker/playerTick_disasm.s` — playerTick only, 2063 lines
- `pretracker-wasm/src/pretracker/prt_replayer.h` — C API header for the new replayer

## Next Steps
1. Manually translate playerTick from 68k disassembly to C, using the other decompiled functions as reference for data structure layout
2. Define proper C structs for player/channel/instrument state
3. Create paula register write shim (DFF0xx → paula_soft calls)
4. Wire into WASM harness (pretracker_wrapper.c pattern)
5. Build with emcmake/emmake
6. Test against UADE reference audio

## Current Working State
- UADE path works for .prt playback (patterns + audio)
- Native TS parser extracts real pattern data from PRT binary
- PreTracker WASM engine skeleton exists but replayer produces silence
- All changes compile cleanly (npm run type-check passes)
