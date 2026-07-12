---
date: 2026-07-12
topic: uade-dynamic-tracing
tags: [uade, wasm, tracing, byte-exact, opaque-formats, phase3]
status: draft
---

# UADE Dynamic Tracing — Implementation Plan

Research: `thoughts/shared/research/2026-07-12_uade-dynamic-tracing.md`.

Goal: instrument the emulated 68k player to record which module-file bytes it
reads as note/sequence data, aggregate them into a contiguous region, and feed
that region into the EXISTING fixed-layout carrier recipe — turning the ~22
opaque 256-cell stubs byte-exact without hand-reading eagleplayer ASM.

Guiding constraint: reuse the Paula-log infrastructure verbatim as the model. A
trace is just a second ring buffer that logs read addresses inside the module
region instead of Paula register writes.

## Phase A — WASM trace instrumentation (C + rebuild)

### A1. Trace ring buffer + module bounds (`uade-wasm/src/entry.c`)
Mirror the Paula log block (`entry.c:62-96`). Add:
```c
static uint32_t g_module_base = 0, g_module_size = 0;
static int g_module_trace_enabled = 0;
static uint32_t g_mod_reads[4096];   /* file offsets, dedup via bitmap below */
static uint8_t  g_mod_seen[1<<20];   /* 1 MB coverage bitmap, module <=1MB */
static uint32_t g_mod_read_count = 0;
void uade_wasm_log_module_read(uint32_t fileOff);  /* set bit, bump count */
```
Coverage bitmap (one bit per file offset) is better than a raw ring buffer: a
render does millions of reads; we only care about the SET of offsets touched.
`get_module_reads` drains the bitmap as run-length ranges.

Exports (add to `build.sh:182` EXPORTED_FUNCTIONS):
- `_uade_wasm_enable_module_trace` (set enabled, capture base/size from chip RAM
  `0x1100`/`0x1104`, clear bitmap)
- `_uade_wasm_get_module_ranges` (write `[start,end)` pairs of contiguous set
  bits into a caller buffer, return count)
- `_uade_wasm_get_module_bounds` (return base<<0 / size for the reverse map)

### A2. Read hook (`third-party/uade-3.05/src/memory.c`)
In `chipmem_bget` (227), `chipmem_wget` (215), `chipmem_lget` (203), after the
existing `uade_wasm_check_wp_read`/addr-track, add (guarded `#ifdef UADE_WASM`):
```c
if (g_module_trace_enabled && addr >= g_module_base
    && addr < g_module_base + g_module_size) {
    uade_wasm_log_module_read(addr - g_module_base);        /* +1,+3 for w/l */
}
```
For word/long, mark the 2/4 covered bytes.

### A3. Base/size capture on load
`uade_wasm_enable_module_trace` reads `SCORE_MODULE_ADDR`(0x1100) /
`SCORE_MODULE_LEN`(0x1104) via `uade_get_long` to fill `g_module_base/size`.
Call AFTER the module is loaded (frontend enables trace post-load, pre-render).

### A4. Rebuild + smoke
`cd uade-wasm && ./build.sh` → `public/uade/UADE.js` + `.wasm`. Verify no export
errors; run one existing render test to confirm no regression.

**Automated verify A:** `cd uade-wasm && ./build.sh` exits 0; existing
`maxtraxPlayback.render.test.ts` still passes.

## Phase B — JS trace-capture harness (tools, no app wiring yet)

### B1. `tools/uade-audit/traceModuleReads.ts`
New helper beside `uadeRenderCore.ts`. Given a file:
1. init WASM, `uade_wasm_load(data)`.
2. `uade_wasm_enable_module_trace(1)`.
3. render N seconds (full song if `get_total_frames` known) via the existing
   render loop.
4. `uade_wasm_get_module_ranges()` → array of `{start,end}` file-offset ranges.
5. Subtract Paula-sourced sample reads: drain `get_paula_log`, map each
   `sourceAddr` back to a file offset (sourceAddr − base), exclude those ranges.
6. Return `{ ranges, moduleSize, coverageBytes }`.

### B2. Oracle validation (the trust gate)
`traceModuleReads.oracle.test.ts`: run on **digitalSonixChrome** and
**paulRobotham** (already byte-exact via hand-located region). Assert the traced
ranges CONTAIN the known region (seqTableOff=114.. for DSC; pattern-pointer
region for PR). If the tracer rediscovers hand-located regions, it is trusted.

**Automated verify B:** oracle test passes — traced ranges cover the known
note-data region for both oracle formats.

## Phase C — Apply to one true opaque stub (prove the win)

Pick the simplest contiguous opaque stub (candidate: **markCooksey** or
**fredGray** — single score stream, no external samples). For it:
1. Run `traceModuleReads` → get contiguous region.
2. Point its parser's `UADEPatternLayout` at `[start,end)`, `bytesPerCell:1`,
   single channel, `numPatterns=1`, `rowsPerPattern=len`.
3. Add 1-byte `period` carrier codec (new `<Format>Encoder.ts`, register in
   barrel) — identical recipe to earAche/infogrames.
4. Regenerate ratchet (single-format diff), add regression test to test:ci glob,
   verify fail-on-revert.

**Automated verify C:** ratchet shows the format 0.08→1.0; new regression test in
test:ci passes and fails on carrier revert; `npm run type-check` clean.

## Phase D — Non-contiguous / split-sample formats (deferred)

For jesperOlsen (external player + in-file IFF samples) and sonicArrangerSas
(structured note-data + in-file samples): the trace ranges will be
non-contiguous (note bytes interleaved with sample bytes). Options:
1. If ranges are few, add a `tracedOffsets?: (p,r,c)=>number` field to
   `UADEPatternLayout` mapping linear cell index → the i-th traced byte offset;
   `getCellFileOffset` falls back to it. Harness already calls `getCellFileOffset`
   so a custom fn Just Works.
2. Store the traced range list alongside the layout so re-runs don't re-render.
Defer until Phase C proves the contiguous path.

## Risks / open checks
- **Coverage**: short render may miss unplayed patterns → undercount region.
  Mitigation: render full song (`get_total_frames`), or loop 2× and union.
- **Non-note reads**: player may read header/config bytes inside the module
  region that are NOT note data (still legit to carry — they're song data, not
  samples). Only sample PCM must be excluded (Paula subtraction handles that).
- **Rebuild in CI**: the `.wasm` is committed under `public/uade/`. Confirm the
  build output is checked in and CI does NOT rebuild (it uses the committed
  artifact). If CI rebuilds, ensure emcc is available there — likely NOT, so
  commit the rebuilt `.wasm`/`.js`.
- **Single-format ratchet discipline** preserved: Phase C touches exactly one
  format's ratchet entry.

## Success criteria
- Tracer rediscovers hand-located regions on 2 oracle formats (Phase B).
- At least one opaque stub goes 0.08→1.0 byte-exact via traced region (Phase C).
- No regression in existing render/roundtrip tests; type-check clean.
