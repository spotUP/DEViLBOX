---
date: 2026-07-04
topic: cinter-songlevel-locktest
tags: [cinter, lock-step, 68k, paula, testing]
status: draft
---

# Cinter .cinter4 song-level lock-test (task C)

Goal: tick-accurate validation of `.cinter4` **song playback** (the sequencer +
Paula register programming in `CinterPlay1`/`CinterPlay2`), not just per-instrument
synthesis. Synthesis is already covered by the mod-synth-parity lock-test (tasks
A/B). This validates the *sequencer* — which note / sample / period / volume each
Paula channel is programmed with, per 50 Hz tick.

## Why an independent reference is needed

DEViLBOX plays `.cinter4` through `cinter4-wasm/src/cinter4/cinter4.c`, which is a
transpile of the Amiga `Cinter4.S`. Diffing it against itself proves nothing. The
only independent reference is the **genuine `Cinter4.S` executed on a real 68k
core**, with its Paula register writes captured.

## Foundation already in place (this commit)

- `tools/cinter-audit/build-cinter-reference.sh` assembles the real `Cinter4.S`
  (from the local reference checkout) into a 750-byte 68k blob + symbol map with
  `vasmm68k_mot -m68020`. Entry offsets: `CinterInit@0x0000`, `CinterPlay1@0x01D8`,
  `CinterPlay2@0x022C`. Calling convention (from cinter4_wrapper.c):
  `a2`=music data, `a4`=instrument space, `a6`=working memory.
- Synthesis lock-test harness `tools/cinter-audit/mod-synth-parity.mts` (v3/v4 aware).

## Constraints discovered

- **Do NOT run `DemoStartup.S` / `Cinter4Test.S` wholesale** — DemoStartup is full
  Amiga bootstrap (VBR via `movec`, copper, DMA, vblank waits). Instead load only
  the `Cinter4.bin` player blob and drive ticks host-side, exactly like
  cinter4_wrapper.c does for the transpiled version.
- **Apple Silicon cannot build 32-bit native** (`-m32` unavailable). `cinter4.c`
  casts pointers to `uint32_t`, so it only runs correctly in 32-bit WASM. The
  DEViLBOX-side trace must therefore come from the WASM build, not a native gcc
  harness.
- `movec vbr` requires `-m68020` when assembling.

## Build plan

### 1. Reference side — Musashi 68k + Paula-register trap
- Vendor Musashi (public-domain C 68k core, ~5 files) under `tools/cinter-audit/musashi/`.
- Memory map: RAM for the `Cinter4.bin` blob (at a base addr), music data, a large
  instrument space, working memory. Map the Paula register block `$DFF0A0..$DFF0DF`
  (AUD0..3 LC/LEN/PER/VOL) + `$DFF096` (DMACON) to a write-trap that records
  `(tick, ch, reg, value)`.
- Host driver: set `a2/a4/a6` (via Musashi register + memory writes), `CinterInit`,
  then per tick call `CinterPlay1` then `CinterPlay2` (set PC to the entry offset,
  push a return address, run until RTS). Snapshot the trapped register writes per
  tick. NB the real player writes Paula regs directly; the transpiled one calls
  `paula_set_*` — both reduce to the same register semantics.

### 2. DEViLBOX side — per-tick Paula trace from the WASM
- Add to `paula_soft.c`: `reg_period`/`reg_vol` fields + a `paula_snapshot(ch, …)`
  reader (period, vol 0-64, sample offset from instrument base, len bytes, dma).
- Add wrapper exports `player_tick()` (one CinterPlay1+2, no audio render) and
  `player_paula_snapshot(...)`; add to `EXPORTED_FUNCTIONS`. Rebuild WASM (emcc) —
  **note this regenerates the shipped `public/cinter4/*.wasm`; verify the app still
  plays after.** New exports are additive/harmless.
- Node harness (extend `cinter4-wasm/test-node.cjs`): load `.cinter4`, loop
  `player_tick()` + snapshot, emit the same `(tick, ch, period, vol, sampleoff, len,
  dma)` records.

### 3. Comparator
- `tools/cinter-audit/songlevel-parity.mts`: align the two trace streams tick-by-tick
  and diff per channel. Period should match exactly; sample offset maps
  reference-abs-addr → instrument index (both know their instrument table); volume
  exact; DMA-on/off transitions aligned. Report first divergent tick per channel.

## Alternative (lighter) reference — the paired `.mod`

If Musashi integration is deferred: parse the paired Cinter `.mod` patterns
(note→period, sample, volume per row, expanded by speed to per-tick) and diff the
DEViLBOX per-tick Paula trace against that. Validates the sequencer against the
original `.mod` without a 68k core — weaker (doesn't exercise the exact Cinter tick
engine) but no emulator needed. Good first cut before Musashi.

## Success criteria

- For each fixture `.cinter4`, every tick's 4-channel (period, sample, volume, dma)
  matches the reference within the run (or documented, understood divergences).
- Wired as a CI check over the fixture songs.
