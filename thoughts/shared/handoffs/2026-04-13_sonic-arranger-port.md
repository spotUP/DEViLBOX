---
date: 2026-04-13
topic: sonic-arranger-c-port-handoff
tags: [port, sonic-arranger, wasm, debug]
status: final
---

# Sonic Arranger C Port — Handoff

## Status: BUILDS BUT SILENT — needs line-by-line C# verification

## What Was Done

1. **UADE soft reset fix** (committed, pushed, tested — WORKS):
   - `uade_wasm_full_reset()` in C, worklet uses soft reset for non-corruption cases
   - Eliminates OOM from rapid format switching

2. **Sonic Arranger C port** (committed, WIP):
   - 1:1 C translation of NostalgicPlayer `SonicArrangerWorker.cs` (~2590 lines)
   - Source: `/Users/spot/Code/Reference Code/NostalgicPlayer-full/Source/Agents/Players/SonicArranger/`
   - Full C# sources saved: `thoughts/shared/research/2026-04-13_sonic-arranger-csharp-sources.md`
   - C port: `sonic-arranger-wasm/src/sonic_arranger.{h,c}` (2306 lines)
   - WASM: `public/sonic-arranger/SonicArranger.{js,wasm}` (11KB + 22KB)
   - Worklet: `public/sonic-arranger/SonicArranger.worklet.js` (new whole-song replayer pattern)
   - Engine: `src/engine/sonic-arranger/SonicArrangerEngine.ts` (rewritten, BdEngine pattern)
   - Routing: `NativeEngineRouting.ts` entry + `withFallback.ts` UADE bypass

3. **7 other WASM engines investigated** — all crash or silent, reverted to UADE

## Bug: Silence

The WASM loads, the worklet initializes, play() is called, but sa_render produces no audio.

### Likely Causes (investigate in order)
1. **File loading**: Big-endian reads may have byte order bugs. The C# uses `moduleStream.Read_B_UINT16()` etc. which reads big-endian. The C port uses manual byte swapping — verify every read function.
2. **Section parsing**: The file format has magic markers (STBL, OVTB, NTBL, INST, SD8B, SYWT, SYAR, SYAF). If any section read is off by even 1 byte, all subsequent sections are corrupted.
3. **Instrument field offsets**: The instrument struct is read as a sequence of big-endian uint16 values with specific gaps (8 bytes at offset+22, 16 bytes at offset+46). These gaps are crucial.
4. **Play tick not advancing**: The `play_tick()` function may not be called by `sa_render()` at the right rate.
5. **Channel mixing**: The Amiga 4-channel mixer may not be reading samples correctly.

### Debug Strategy
1. Add printf diagnostics to `sa_create()` — print subsong count, position count, instrument count after loading
2. Add printf to `play_tick()` — print speed counter, row position, song position
3. Add printf to channel mixing — print period, volume, sample pointer for each active channel
4. Compare against the C# reference running on a test file

### Critical Files
- C source: `sonic-arranger-wasm/src/sonic_arranger.c`
- C# reference: `/Users/spot/Code/Reference Code/NostalgicPlayer-full/Source/Agents/Players/SonicArranger/SonicArrangerWorker.cs`
- Test file: `/Users/spot/Code/DEViLBOX/public/data/songs/test-songs/sonic-arranger/mega end.sa`
- Plan: `thoughts/shared/plans/2026-04-13-sonic-arranger-c-port.md`

## User Rules (MUST FOLLOW)
- **1:1 line-by-line** — every C# line must map to C exactly
- **Binary compatible to the last byte** — identical output
- **NOTHING skipped or simplified** — every field, edge case, boundary check
- **Do NOT "improve" or optimize** — translate exactly as written

## Remaining Formats (not started)
- SoundMon — NostalgicPlayer C# at `Players/SoundMon/`
- Digital Mugician — NostalgicPlayer C# at `Players/DigitalMugician/`
- David Whittaker — NostalgicPlayer C# at `Players/DavidWhittaker/`
- Rob Hubbard — NO NostalgicPlayer source (UADE only)
- Core Design — NO NostalgicPlayer source (UADE only)
- Startrekker AM — NO NostalgicPlayer source (UADE only)
