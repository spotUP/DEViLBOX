---
date: 2026-07-12
topic: uade-dynamic-tracing
tags: [uade, wasm, tracing, byte-exact, opaque-formats, phase3]
status: draft
---

# UADE Dynamic Tracing — Phase 1 Research

## Why

Phase 3 byte-exact codec sweep is EXHAUSTED for static analysis. 39 ratchet
formats remain lossy; ~22 are **256-cell opaque stubs** — generic MOD codec over
a fake offset-0 grid because the note data is not a clean on-disk pattern stream.
The player (68k eagleplayer) generates the music at runtime from opcode streams,
executable jump-tables, or externally-loaded data mixed with in-file samples. No
static probe can locate the note-data region; a carrier over the fake grid is
forbidden gaming (games the metric, breaks editing).

User directive (verbatim): **"if we need to emulate the player, so be it! we have
uade!"** Go-ahead given for the tracing subsystem.

Core idea: run the module through the emulated 68k player, **trace which file
bytes it reads as note/sequence data**, and use those traced regions as byte-exact
carriers (or structurally separate note-data from in-file samples).

## What EXISTS (reusable — do NOT reinvent)

### 68k memory-read hook (the instrumentation point)
- CPU core: UAE-style 68k (not Cyclone). Byte read = `chipmem_bget()`
  `third-party/uade-3.05/src/memory.c:227-236`. Word/long: `chipmem_wget`
  (215-225), `chipmem_lget` (203-213). **All three already track**
  `g_uade_last_chip_read_addr` (`memory.c:67`) and already call a hook
  (`uade_wasm_check_wp_read()` at `memory.c:233`).
- Watchpoint framework already implemented: `uade-wasm/src/entry.c:937-1057`
  (8 slots, read/write/both, ring buffer `g_wp_hits[256]`, exported
  `uade_wasm_set_watchpoint` / `uade_wasm_get_watchpoint_hits`).
- Paula-write log is the **model to copy** for a trace ring buffer:
  `uade-wasm/src/paula_log.h:22-28` + `entry.c:62-96` (ring buffer + drain
  export). It already captures source address via `g_uade_last_chip_read_addr`.

### Module load base (chip-RAM ↔ file offset mapping)
- Module copied to chip RAM at load: `uade.c:1089-1109`.
  - `modaddr = ((relocaddr + len) & 0x7FFFF000) + 0x2000` (line 1089) — DYNAMIC.
  - `uade_put_long(SCORE_MODULE_ADDR, modaddr)` (1097) — base stored at chip-RAM
    `0x1100` (`SCORE_MODULE_ADDR`, `uade.c:62`).
  - `uade_put_long(SCORE_MODULE_LEN, bytesread)` (1109) — size at `0x1104`.
  - `uade_safe_copy(modaddr, module->data, module->size)` (1103) — the copy.
- **file offset = chipRamAddr − modaddr** for any read in `[modaddr, modaddr+size)`.
  This is the reverse map that turns a traced read address into a file offset.

### Run loop (single-stepped from JS)
- CPU exec: `m68k_run_1()` `newcpu.c:1237-1306`.
- WASM orchestration: `uadecore_wasm.c:159-298`, `m68k_run_1()` called per audio
  frame (line 290), yields on `uadecore_wasm_yield` when audio buffer full.
- Emulation IS single-stepped: one `m68k_run_1()` per frame then back to JS —
  frontend can drain a trace buffer between frames (same as Paula log).

### Existing introspection exports (already JS-callable)
- `uade_wasm_read_memory()` (entry.c:682), `uade_wasm_write_memory()` (696).
- `uade_wasm_get_register` / `get_all_registers` (1144 / 1168).
- `uade_wasm_get_paula_log()` (845) — drain Paula writes (chan, reg, val,
  sourceAddr, tick).
- `uade_wasm_get_tick_snapshots()` (916), `get_tick_count()` (868).

### Headless render (where a trace gets captured)
- `renderFileToSamples(data, filename, {sampleRate, seconds})` —
  `tools/uade-audit/uadeRenderCore.ts:1-200`. Fresh WASM instance per file. The
  render loop (175-195) is where trace-drain would be wired.
- Oracle-render regression precedent: `maxtraxPlayback.render.test.ts` renders
  headless + asserts sustained non-silence. Same harness style for a trace test.

### Layout / offset model (the gap)
- `UADEPatternLayout` `UADEPatternEncoder.ts:21-64`: `patternDataFileOffset`,
  `bytesPerCell`, `rowsPerPattern`, `numChannels`, `numPatterns`, `encodeCell`,
  optional `decodeCell`, optional `getCellFileOffset`.
- `getCellFileOffset(layout,p,r,c)` (72-86) returns a **FILE offset**; default
  linear row-major; custom override allowed (InStereo1 track indirection).
- Harness `roundTripFixed` (`encoderRoundtrip.harness.test.ts:114-137`) measures
  `encodeCell(decodeCell(orig))===orig` over `raw.subarray(off,off+bytesPerCell)`
  at `getCellFileOffset`, on **FILE bytes**. Ratchet locks matchPct + method.
- **Gap:** offset model is fully static/deterministic. No representation for a
  runtime-discovered, possibly non-contiguous set of file offsets.

## The gap a tracing subsystem must fill

1. **Trace capture**: in `chipmem_bget/wget/lget`, when tracing enabled and
   `addr ∈ [g_module_base, g_module_base+g_module_size)`, record
   `(addr − g_module_base)` (file offset) into a ring buffer. Export a
   `uade_wasm_set_module_trace(enable)` + `uade_wasm_get_module_reads(...)` drain
   (mirror Paula log). Auto-populate module base/size from `0x1100`/`0x1104` at
   reset.
2. **Reverse map** chip-RAM addr → file offset (subtract base). Trivial once base
   is known.
3. **Aggregate** the read-offset set over a representative render window into a
   contiguous-region set (start/end runs). This IS the note-data region the
   player consumes — exactly what a carrier needs.
4. **Represent** it: for a contiguous traced region, the EXISTING fixed-layout
   carrier recipe already works (point `patternDataFileOffset`/`bytesPerCell`/
   dims at the region, 1-byte `period` carrier). Only genuinely non-contiguous
   formats need a new `tracedOffsets?: (p,r,c)=>number` field on the layout.
5. **Sample exclusion**: reads inside a traced region that also overlaps declared
   sample PCM must be excluded — sample reads are DMA/Paula-driven (Paula log
   already captures those source addrs), so subtract Paula-sourced read ranges
   from the note-data trace to isolate the true sequence bytes.

## Decision points for the plan (Phase 2)

- **Build cost**: instrumentation lives in C (memory.c + entry.c), requires a
  WASM rebuild. Confirm the uade-wasm build command + that a rebuild is in scope.
- **Contiguous vs non-contiguous**: hypothesis — most opaque stubs read ONE
  contiguous score/opcode region (like the located-region fixes already shipped:
  digitalSonixChrome, paulRobotham). If so, trace just CONFIRMS the region and no
  layout-model change is needed — the win is finding the region automatically
  instead of hand-reading ASM. Validate on 1-2 formats before generalizing.
- **Sample overlap**: jesperOlsen / sonicArrangerSas have in-file IFF samples
  interleaved — the Paula-source subtraction step is load-bearing there.
- **Determinism**: a trace over N seconds may not touch every note byte (unplayed
  patterns). Need a full-song render or a coverage check; short renders undercount.

## Candidate first targets (validate the approach)
- **digitalSonixChrome / paulRobotham** — ALREADY byte-exact via hand-located
  region. Use as trace ORACLE: the trace should rediscover the same region. If it
  does, the tracer is trustworthy.
- Then a true opaque stub with a contiguous stream (candidates: maniacsOfNoise,
  markCooksey, fredGray) — trace, confirm contiguous, apply carrier.
- Defer split-sample formats (jesperOlsen, sonicArrangerSas) to a later step —
  they need the Paula-subtraction refinement.

## Backlog (opaque, Task #5)
maniacsOfNoise, steveBarrett, sunTronic, scumm, jasonPage, markCooksey, fredGray,
jankoMrsicFlogel, seanConnolly, markII, mikeDavies, jasonBrooke, customMade,
ashleyHogg, specialFX, coreDesign, desire, soundPlayer, quartet, glueMon,
jesperOlsen, sonicArrangerSas.

## References
- `third-party/uade-3.05/src/memory.c:203-261` — read/write hooks
- `third-party/uade-3.05/src/uade.c:62-63,1089-1109` — module load base
- `uade-wasm/src/entry.c:62-96,682-1057` — Paula log model, introspection exports
- `uade-wasm/src/uadecore_wasm.c:159-298` — run loop
- `src/engine/uade/UADEPatternEncoder.ts:21-86` — layout + offset model
- `src/engine/uade/__tests__/encoderRoundtrip.harness.test.ts:114-137` — metric
- `tools/uade-audit/uadeRenderCore.ts:1-200` — headless render
- Prior located-region fixes: `project_uade_stub_bucket_progress` memory
