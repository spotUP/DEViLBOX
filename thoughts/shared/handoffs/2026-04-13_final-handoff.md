---
date: 2026-04-13
topic: final-session-handoff
tags: [smoke-test, uade, audio-leak, editability, formats]
status: final
---

# Final Session Handoff — 2026-04-13

## Session Summary

Two major workstreams: editability expansion and smoke test infrastructure.

## Editability (DONE)
- 65 formats added to EDITABLE_FORMAT_LABELS (81% → 92%)
- 7 formats promoted from prefix-only to full registry entries with native parsers
- 3 demoscene synths registered in SynthRegistry (WaveSabre, Oidos, Tunefish)
- Chip RAM pattern reader frozen array fix

## Audio Leak Fix (DONE)
- Root cause: `stopNativeEngines()` only stopped engines matching current song
- Fixed: stop ALL engines, mute output gains immediately, force-stop UADE/libopenmpt
- Leak detector (`tools/stop-test.ts`) confirmed no audible leaks

## Smoke Test Infrastructure (DONE)
- `tools/quick-smoke.ts` — 11-check comprehensive format test
- `public/data/test-songs/` — 173 format directories with test files
- Companion file auto-discovery (.sng/.ins, .dum/.ins, mdat/smpl, jpn/smp)
- Reports to localhost:4444 format tracker
- Incremental runs (skip scores ≥90)
- 8 WIP formats documented and skipped

## UADE WASM Stability (ONGOING — needs architectural fix)

### The Problem
Rapid format switching in the smoke test triggers UADE WASM reinit after each failed load.
Each reinit creates a new Emscripten instance (~2.5MB). After 20-30 consecutive failures,
the AudioWorklet thread OOMs and crashes the browser tab.

### What We Tried
1. **Full reinit every time** — works for audio but OOMs after ~30 failures
2. **Soft reset (_uade_wasm_stop())** — doesn't fix protocol state machine, cascade silence
3. **Throttled reinit (1-in-5 after 20)** — cascade silence during throttled loads
4. **Free heap before reinit** — marginal improvement, GC doesn't run fast enough in worklet

### What Needs to Happen
The fundamental issue: Emscripten WASM instances can't be truly "freed" from within the same
thread. The old Memory object stays alive until GC runs, which the AudioWorklet thread doesn't
prioritize. Options:

1. **Recreate the worklet node** — disconnect old AudioWorkletNode, create new one. This fully
   disposes the old WASM thread and starts fresh. Requires reconnecting audio routing.
2. **Pool approach** — pre-allocate 2 WASM instances, ping-pong between them. One loads while
   the other plays, no reinit needed.
3. **Accept the limit** — in real usage (not rapid smoke testing), users load 1-2 songs per minute,
   not 20 per minute. The reinit approach works fine for normal use. Only the smoke test triggers OOM.

Recommendation: option 3 for now (gig in 4 days), option 1 for post-gig.

### Formats That Crash UADE (browser killers)
- `soundfactory` (oriental.psf) — UADE eagleplayer crash even with correct psf.* prefix
- `hippel-7v` (lethalxcess-intro.hip7) — moved to TFMX player library
- `sonic-arranger` — intermittent crash

## Best Smoke Test Results (from run with 94 audio OK)
- 94/138 tested = **68% audio pass rate**
- 89 have pattern data
- 33 streamed formats identified
- 21 genuinely silent (UADE unsupported or bad test files)

## WIP Formats (skipped, plan at thoughts/shared/plans/2026-04-13-wip-formats-plan.md)
1. DefleMask — needs Furnace routing
2. Organya — WASM engine wiring issue
3. PxTone — WASM engine wiring issue
4. Sawteeth — .st extension conflict
5. V2M — sequencer incomplete
6. SunVox — song playback incomplete
7. Hippel 7V — moved to TFMX player

## Commits This Session (~25 total)
Key ones:
- `bcb5208` — 65 formats editable
- `d73054e` — UADE crash recovery (malloc abort → reinit)
- `079370d` — Stop ALL engines on stop
- `290d66d` + `7a84989` + `3db9676` — Gain mute on stop
- `16db802` — Force-stop UADE/libopenmpt
- `0f18342` — SoundFactory UADE prefix hint
- `61f28f9` — SidMon .sid disambiguation + companion discovery
- `3cb4080` — Comprehensive smoke test
- Multiple UADE worklet iterations (soft reset, throttle, heap free)
