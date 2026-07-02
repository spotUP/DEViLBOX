# Cinter4 WASM player — handoff

Status: **audio works**. The transpiled Cinter4 replayer now produces sound
through the WASM/Paula path. Verified headless (no browser) — see harness below.

## What was broken and fixed (in `src/cinter4/cinter4.c`)

Two 68k-flag transpilation bugs caused total silence:

1. **`ROL.W #7` width bug** (CinterPlay2 volume/note decode, 2 sites).
   The transpiler emitted `ROL32(W(d0),7)` on a 16-bit value, so the 7
   wrap-around bits (the volume payload) were truncated away and the
   subsequent `AND.W #63,D2` always yielded 0 → channel volume stuck at 0.
   Fixed with a dedicated `ROL16(v,n)` macro (defined near the rotation
   helpers). Result: `vol 0.000 → 0.469`.

2. **`ADD.W D2,D2` extend-flag omission** (CinterPlay1 DMA-mask loop, 4 sites).
   The 68k `ADD` updates X alongside C, but the transpiler left `flag_x`
   untouched, so the four `ADDX.W D0,D0` accumulations read a stale
   `flag_x = 0`. `c_dma` stayed 0 → Paula DMA never enabled → silence.
   Fixed by setting `flag_c = flag_x = (W(d2) >> 15) & 1;` before each add.

Both are general transpiler gaps (ROL/ROXL width, ADD/SUB → X) worth checking
in other transpiled replayers.

## Diagnostic notes (not bugs)

- `PeriodTable` and `c_dma` read back **byte-swapped** in any native/JS view:
  `cinter4.c` stores words big-endian (`WRITE16`), so e.g. `c_dma=0x0200`
  actually means `0x0002` (channel 1). The Amiga periods that look "impossible"
  (22531, 10243…) are `856, 808, 762…` byte-swapped — a correct chromatic scale.
- Synthesis is correct: the sine table is a clean sine (peak 16384 at quarter),
  and instrument PCM is full-scale. The old "s_inst[0..7]=0" was just reading
  before the first instrument's PCM (it lives ~42 KB into the instrument space).

## Headless test harness

`test-node.cjs` runs the actual WASM under Node (32-bit address space, no
browser) and reports synthesis + per-channel DMA activity + render RMS:

    node test-node.cjs        # from cinter4-wasm/

Expected: `player_load -> 1`, channels active, `rms ≈ 0.023` (test song uses
one voice at a time). It requires `EXPORTED_RUNTIME_METHODS` to include
`HEAPU8`/`HEAPF32`/`UTF8ToString` (already set in `CMakeLists.txt`) and the
`player_get_debug` export (a diagnostic that dumps sine-table samples, the
first non-zero PCM offset, and the DMA mask).

## Build

    cd cinter4-wasm/build && emmake make -j4
    # outputs to ../public/cinter4/Cinter4.{js,wasm}

## DEViLBOX-side (separate, deferred)

The DEViLBOX integration is in `../src/` (engine, parser, routing) and is being
worked on separately. Notably: the parser currently emits an **empty placeholder
pattern** — decoding the Cinter4 per-tick event stream into editable tracker rows
is a deferred follow-up and does not affect the player itself.
