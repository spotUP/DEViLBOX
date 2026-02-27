---
date: 2026-02-27
topic: hively-instrument-mode
tags: [wasm, hively, amiga, c]
status: final
---

# HivelyTracker Instrument Mode Fix — Design

## Goal

Make HivelyTracker instrument editing produce audio in DEViLBOX. Currently silent because the WASM binary predates the standalone player C functions in `HivelyWrapper.c`, and the render function has a 50Hz pacing bug.

## Architecture

The fix is entirely in `hively-wasm/common/HivelyWrapper.c`. No TypeScript changes needed — `HivelySynth.ts`, `HivelyEngine.ts`, and `Hively.worklet.js` are already correct.

**The two problems:**

1. **WASM not recompiled** — The 6 standalone player functions (`hively_create_player`, `hively_destroy_player`, `hively_player_set_instrument`, `hively_player_note_on`, `hively_player_note_off`, `hively_player_render`) are written in `HivelyWrapper.c` and listed in `CMakeLists.txt`, but the binary in `public/hively/` predates them. Recompile fixes this.

2. **50Hz pacing bug** — `hively_player_render` calls `hvl_process_frame()` on every invocation (worklet block = ~128 samples at 44100Hz = ~344 calls/sec), but `hvl_process_frame` should fire at 50Hz (once per 882 samples). This makes ADSR envelopes run ~7× too fast — notes die almost instantly.

## Fix

Add `static uint32 g_playerSamplesLeft[MAX_PLAYERS]` counter array alongside the existing player arrays. Changes:

**In `hively_player_note_on`:** Reset the counter to 0 so the first `hvl_process_frame` fires immediately on the next render call (correct attack onset).

**In `hively_player_render`:** Replace the current "process frame every call" loop with a proper 50Hz-gated loop:
- If `g_playerSamplesLeft[handle] == 0`: call `hvl_process_frame` + `hvl_set_audio`, reset counter to `sampleRate/50`
- Render `min(remaining, g_playerSamplesLeft[handle])` samples
- Decrement counter by samples rendered

**Then recompile:** `cd hively-wasm/build && emmake make`

## Files

| File | Change |
|------|--------|
| `hively-wasm/common/HivelyWrapper.c` | Add `g_playerSamplesLeft[]`, fix render loop, reset in note_on |
| `public/hively/Hively.js` + `Hively.wasm` | Output — updated by build |

## Success Criteria

- Automated: `npx tsc --noEmit` — zero errors
- Manual: Load any `.hvl` file → open an instrument → click a key in the keyboard → sustained note audible with correct HivelyTracker timbre
- Manual: Envelope knobs affect note length/shape perceptibly
- Manual: Song playback still works (regression check)
