---
date: 2026-03-21
topic: furnace-lockstep-audit-findings
tags: [furnace, lock-step, debugging, sequencer]
status: draft
---

# Furnace Lock-Step Audit Findings

## Improved Comparator Tool
- `tools/furnace-audit/compare-cmds.ts` now uses set-based matching (not index-based)
- Filters out VOLUME/PITCH/INSTRUMENT setup commands that reference consolidates into NOTE_ON
- Fixed `--song` mode cmdlog path (was writing to /dev/null.cmdlog.txt)

## SM8521 — Root Cause Found

**Song:** `demos/misc/sawmen_break_sm8521.fur`

**Symptom:** envCorr = -0.28 (negative correlation), 6x duration mismatch

**Root cause: Speed/row timing is 6x too fast**
- Reference: tick spacing = 144 (row every 144 ticks)
- DEViLBOX: tick spacing = 24 (row every 24 ticks)
- Both report speed=6, hz=800, but the actual row processing rate differs

**Details:**
- At tick 24, DVB fires NOTE_ON(55, 31) on ch 0 and ch 2
- Reference has NO commands at tick 24 — next command at tick 144
- This means DVB processes 6 rows where reference processes 1
- The 6x ratio explains the duration mismatch (63s vs 10.6s in earlier renders)

**Likely cause:** Virtual tempo (vTempoN=150, vTempoD=150) or row advance logic
- The song uses virtualTempoN=150 / virtualTempoD=150 which should be 1:1
- But the actual row rate is 6x different
- Need to check if the WASM sequencer's `ticks` counter is correctly using the speed value
- The `nextRow()` function advances when `ticks` reaches 0 — check if ticks is initialized to speed (6) correctly

**Instrument mismatch:** At tick 144, REF has INSTRUMENT(4, 0) but DVB has INSTRUMENT(3, 0)
- This follows from the timing bug — by tick 144, DVB has processed many more rows

## SNES — Architecture Issue

**Song:** `demos/snes/64kb.fur`

**Symptom:** envCorr = 0.45, diverges at 0.01s

**Root cause:** Tick-render interleaving architecture difference
- Upstream Furnace: Variable-chunk rendering between tick boundaries (playback.cpp:3079-3237)
- DEViLBOX WASM: Fixed 128-sample chunks with tick accumulation
- SNES echo buffer is state-dependent — timing differences cause echo divergence
- This is a structural issue requiring architecture changes

## ESFM — Timed Out

**Song:** `demos/esfm/AAAA.fur`
- Render timed out (>5 min) during lock-step comparison
- Need to try a shorter ESFM demo

## Next Steps

1. **Fix SM8521 speed bug** — investigate why row advance is 6x too fast
   - Check `g_seq.ticks` initialization in `furnace_seq_play()`
   - Check `nextRow()` tick decrement logic
   - Compare with upstream playback.cpp tick handling

2. **Test more chips with lock-step** — run on Genesis, NES, Arcade to find similar bugs

3. **Try shorter ESFM demo** or increase timeout in compare-cmds.ts

4. **Pattern data verification** — add a debug mode that dumps parsed pattern cells
   for a specific channel/order to verify correct loading
