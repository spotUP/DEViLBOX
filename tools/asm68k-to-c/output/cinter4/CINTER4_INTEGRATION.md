# Cinter4 Transpile — Integration Notes

## What's Here

```
cinter4/
  cinter4.c          — transpiled C (1300 lines)
  cinter4.h          — public API header
  cinter4_wrapper.c  — host shim (Paula soft renderer, 50 Hz tick)
  paula_soft.h/.c    — software Paula DMA emulator
  CMakeLists.txt     — native build
```

## Provenance

Source: `player/Cinter4.S` from github.com/askeksa/Cinter (master branch).
Transpiled by: `tools/asm68k-to-c` in the DEViLBOX repo.

Bugs found and fixed during transpilation (all fixes are in the transpiler, not the C output):
1. `REPT/ENDR` blocks not expanded → `expandRept()` added to preprocessor
2. `LONGMUL` macro not expanded → `collectMacros()`/`expandMacros()` added
3. `*+N` PC-relative branch targets emitted as `goto 22` (invalid C) → `resolveStarOffsets()` added
4. `SWAP.W` emitted as W(dn) rotate (wrong — 16-bit shift by 16 = 0) → fixed in `instr-map.ts`
5. `CINTER_DEGREES/2*2-2(a0)` displacement arithmetic not evaluated → `expandEquDisplacements()` added
6. RS size expressions `4*3`, `32*2`, `36+1` not evaluated → lexer now evaluates inline arithmetic
7. Working memory constants `c_Sinus`, `c_Instruments` etc. were wrong (off by 3–8×)

Behavioral comparison against UADE/hardware: **not yet done**. UADE doesn't support .cinter4 format.
Structural confidence is high (all branches, loops, and arithmetic are correct). Behavioral
validation should be done by comparing synthesized PCM against Cinter's own Rust/Lua tools
or a vAmiga capture of the same song.

## Calling Convention

The transpiled functions use global 68k register variables (`a2`, `a4`, `a6`, etc.).
Set them before each call:

```c
// Init — do once per song load
a2 = (uint32_t)(uintptr_t)music_data;      // pointer to .cinter4 binary
a4 = (uint32_t)(uintptr_t)instrument_space; // output buffer for synthesized samples
a6 = (uint32_t)(uintptr_t)working_memory;  // 33180-byte scratch buffer (zero-initialized)
CinterInit();                               // synthesizes all instruments, sets up sequencer

// Playback — call both at 50 Hz (every 882 samples at 44100 Hz, 735 at 36750 Hz, etc.)
a6 = (uint32_t)(uintptr_t)working_memory;
CinterPlay1();  // reads music data, programs Paula for next row
a6 = (uint32_t)(uintptr_t)working_memory;
CinterPlay2();  // updates Paula DMA
// between calls: paula_render() produces the audio
```

## Working Memory Size

`CINTER_WORK_SIZE = c_Sinus + CINTER_DEGREES * 2 = 412 + 16384*2 = 33180 bytes`

Must be zero-initialized before `CinterInit()`.

## Synthesis Boundary (for instrument editor)

`CinterInit` is one monolithic function with internal goto labels:

```
CinterInit:
  CinterMakeSinus:       → builds sine table at c_Sinus(a6) (16384 words)
  CinterMakeInstruments: → synthesizes PCM for all generated instruments into a4
  CinterComputePeriods:  → builds period lookup table at c_PeriodTable(a6)
  CinterParseMusic:      → sets up sequencer state in working memory
CinterInitEnd:
```

**For synthesizing a single instrument without running the full init:**
Call `CinterInit()` with a minimal synthetic `.cinter4` file containing exactly one
generated instrument entry. After the call, the synthesized PCM is at the START of the
instrument space buffer (a4). Extract it using:
```c
uint16_t sample_length_in_words = *(uint16_t*)music_data;  // first word of .cinter4
int sample_byte_count = sample_length_in_words * 2;
// synthesized PCM is at instrument_space[0 .. sample_byte_count-1]
// it is signed 8-bit (int8_t), Amiga mono format
```

The sine table must be built first (CinterMakeSinus runs before CinterMakeInstruments in the
sequential fall-through). For a standalone single-instrument synth, run CinterInit with a
minimal music file — the overhead of MakeSinus is a one-time 33KB write.

## Instrument Parameter Layout

For **generated** instruments (positive length word), the `.cinter4` binary contains:

```
Instrument count header:
  int16_t  n_raw_instruments;  // negative → |n_raw| raw instruments follow first
  ...raw instrument blocks (length + replength only)...
  int16_t  n_gen_instruments;  // count of generated instruments

For each generated instrument:
  uint16_t length;             // sample length in words (= bytes / 2)
  uint16_t replength;          // loop repeat length in words (0 = no loop)

  // Initial synthesis state (read once at instrument start):
  int16_t  mpitch;             // modulation pitch initial value (signed)
  int16_t  mod;                // modulation strength initial value (signed)
  int16_t  bpitch;             // base pitch initial value (signed)
  int16_t  attack;             // initial amplitude delta (signed; negative = fade in)

  // Per-sample synthesis data (read once per synthesized sample, `length` times):
  int16_t  distortions;        // number of distortion passes × 0x1000
  int16_t  ampdelta;           // amplitude delta step for this sample
  int16_t  mpitchdecay;        // modulation pitch decay multiplier (signed)
  int16_t  moddecay;           // modulation strength decay multiplier (signed)
  int16_t  bpitchdecay;        // base pitch decay multiplier (signed)
```

So the **instrument header** is 6 shorts (12 bytes) and then **per-sample data** is 5 shorts
(10 bytes) × `length` samples.

**The "12 knobs" map as:**
1. `length` — sample length
2. `replength` — loop point
3. `mpitch` — modulation frequency
4. `mod` — modulation depth
5. `bpitch` — base frequency
6. `attack` — amplitude ramp direction/speed
7. `distortions` — wavefold/distortion amount (applied `distortions/0x1000` times per sample)
8. `ampdelta` — amplitude step (constant across the whole instrument if all samples equal)
9. `mpitchdecay` — how fast modulation frequency decays
10. `moddecay` — how fast modulation depth decays
11. `bpitchdecay` — how fast base frequency decays
12. (`replength` already counted above — the per-sample data effectively gives you the decay curve)

In practice, for a simple preset where ALL samples have the same per-sample data (constant
envelope shape), 11 knobs cover the space. When the per-sample data varies per sample, the
instrument is fully programmable but can't be summarized as 12 fixed knobs.

## CinterConvert.py

The authoritative format reference for reading/writing `.cinter4` files is:
`tools/CinterConvert.py` in the Cinter repo (github.com/askeksa/Cinter).
It documents how to go from synth parameters → packed music data.

## Notes for Second Project

- The transpiled C is self-contained (no external dependencies beyond stdlib).
- `cinter4.c` compiles with `-O2 -Wall` without errors (only unused-label/var warnings, suppressed).
- The per-sample synthesis loop is the CPU-hot path: `distortions` × waveform table lookups
  per sample, all in integer arithmetic. Suitable for WASM.
- WASM build: use Emscripten, export `CinterInit`, `CinterPlay1`, `CinterPlay2`, and the
  `a2`/`a4`/a6` global register variables so the JS host can set them.
- For an isolated instrument synth (no sequencer), export only `CinterInit` and provide a
  synthetic 1-instrument `.cinter4` blob.
