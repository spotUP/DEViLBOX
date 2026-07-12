---
date: 2026-07-12
topic: uade-opaque-tracer-wall
tags: [uade, tracing, opaque-formats, byte-exact, phase3]
status: final
---

# UADE opaque-format tracer: bucketing + the automatic-decode wall

## What was built (committed, 45b7568eb)

Dynamic module-read tracer for the UADE WASM 68k emulator. `chipmem_{b,w,l}get`
(memory.c, under `UADE_WASM`) call `uade_wasm_log_module_read`, marking a
per-byte coverage bitmap of the loaded module region. entry.c exports
`enable_module_trace` / `get_module_bounds` / `get_module_ranges`. Harness:
`tools/uade-audit/traceModuleReads.ts`. Oracle (in test:ci):
`traceModuleReads.oracle.test.ts` — the tracer independently rediscovers
digitalSonixChrome's hand-located sequence region and its sample boundary.

## Goal

The 22 opaque "256-cell stub" formats ship a FAKE pattern layout
(`patternDataFileOffset: 0`, generic `decodeMODCell` over file-header bytes).
Their ratchet matchPct is low and a byte-carrier there is FORBIDDEN — it would
reproduce header bytes, gaming the metric with zero editability gain. The hope:
use the tracer to locate the REAL on-disk score region so a carrier becomes
legitimate.

## Bucketing (all 22, 12s headless render, sample-boundary = first read run >=256B)

UNTRACEABLE (8) — the current base mechanism (chip 0x100/0x104) can't reach them:
- Load fails headless (`_uade_wasm_load` ret=-1): jasonPage, jasonBrooke,
  jesperOlsen, soundPlayer.
- Loads but ~0 module reads (player runs from a relocated/decrunched chip region
  whose base != the score-struct module base): coreDesign, fredGray,
  jankoMrsicFlogel, desire.

TRACEABLE, dense contiguous read region (14): glueMon (93%), sunTronic (48%),
customMade (38%), maniacsOfNoise (29%), steveBarrett (25%), markII (24%),
quartet (22%), plus sparser markCooksey/scumm/sonicArrangerSas/seanConnolly/
ashleyHogg/specialFX/mikeDavies (2-11%).

## Why tracing does NOT yield an editable codec (two measurements)

1. **Read-frequency conflates envelope/waveform tables with the note stream.**
   glueMon's 93%-dense region [30,164) decodes as synth tables, not notes:
   bytes 30-46 are an ascending ramp (20,30,40,...,150), 48-64 descending — an
   ADSR/volume envelope re-read EVERY tick. The order list only starts ~offset
   160. The region is read-hot because it is per-tick synth state, not because
   it is a linear note sequence.

2. **No monotonic score cursor (temporal windowing refutes it).** Hypothesis:
   the sequence/pattern pointer advances through the file with song time while
   envelope tables stay fixed, so read-offset-vs-time isolates the note stream.
   Windowed trace (8 x 2s windows, clear+drain each) shows the score-region span
   is STABLE every window: markCooksey re-reads [1596,10494) in all 8 windows,
   maniacsOfNoise [1674,4580), sunTronic [1150,~3500). The replayer holds the
   whole pattern+envelope+sequence working set hot and indexes into it by
   pattern number each tick; a 2s window (~100 ticks) already touches
   everything. Finer per-tick granularity would show a moving subset, but
   pattern replay follows song-order, not file-order, so it is non-monotonic —
   no clean cursor to extract.

## Conclusion

The tracer is real, proven infrastructure: it confirms UADE playability, locates
the read working set, and separates sample DMA from control data. But it CANNOT
mechanically decompose that working set into an editable note grid — that
requires per-replayer reverse engineering (which offsets are sequence vs pattern
vs envelope vs instrument), i.e. reading each eagleplayer's ASM as was done for
digitalSonixChrome and the command-stream formats (docs/FORMAT_COMMAND_STREAM_GRID.md).

Slapping a byte-carrier over a traced region without decoding its semantics is
byte-exact but produces a non-editable grid — the same forbidden metric-gaming,
relocated. Not shipped.

## Remaining paths (all per-format, none mechanical)

- **14 traceable formats**: reverse each replayer's data layout using the tracer
  as a guide (region bounds + access topology), decode to a real tick grid, then
  the standard carrier recipe applies. ~1 format per focused session; some are
  compiled command streams (Rob Hubbard class).
- **8 untraceable formats**: even the tracer can't help until (a) UADE headless
  load is fixed for the 4 load-failures, and (b) the tracer follows the
  relocated/decrunched base for the 4 zero-read cases (hook the relocation, or
  snapshot chip RAM post-decrunch and diff against the file). Larger effort.

This is a strategic decision point: the mechanical/automatic avenues for the
opaque bucket are exhausted. Finishing them is genuine RE, one format at a time,
and 8 need tracer/loader work first.
