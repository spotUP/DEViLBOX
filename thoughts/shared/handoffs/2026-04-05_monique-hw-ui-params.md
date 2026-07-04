---
date: 2026-04-05
topic: monique-hw-ui-params
tags: [monique, hardware-ui, params, synth, wasm]
status: draft
---

# Handoff: Monique Hardware UI Parameter Bridge

## Status: Partially Working

The C++ bridge detects knob changes and the JS side receives them. But the audio dies because ToneEngine recreates the synth on every param change.

## What Works
- MoniqueUIBridge.cpp polls 120 synth_data fields matching audio WASM MoniqueParams enum
- Tolerance filter (0.001) prevents smoother micro-change flooding
- JS batches changes per rAF frame
- instrumentId resolved from useInstrumentStore fallback

## What's Broken
- Each knob twist triggers `Zynthian synth created: Monique` (full WASM rebuild)
- Root cause: param callback sends to worklet correctly, BUT something also triggers
  config store update → ToneEngine.getInstrument() → createInstrument() → full rebuild
- The synth recreation kills the audio because the old worklet is destroyed

## Root Cause Analysis
The param changes reach the audio worklet directly via postMessage (correct path).
But ALSO somehow trigger the React config store to update, which causes the instrument
to be recreated. Need to investigate:
1. Does the `_moniqueUIParamCallback` somehow trigger `onParamChange` or `handleChange`?
2. Does the MoniqueHardwareUI component re-render trigger a store update?
3. Is ToneEngine's `getInstrument` checking config identity (by reference) and seeing a
   "new" config each time?

## Fix Options
1. **Prevent store propagation** — hardware UI knobs should ONLY send to worklet, never
   update the React instrument config. The config is for presets/save, not live control.
2. **Make ToneEngine cache-smart** — `getInstrument()` should check if synthType changed,
   not recreate on every config change.
3. **Separate live params from config** — live param changes go direct to worklet,
   config changes (preset load, etc.) go through the store.

## Key Files
- `juce-wasm/monique-ui/MoniqueUIBridge.cpp` — C++ param polling
- `src/components/instruments/hardware/MoniqueHardwareUI.tsx` — JS callback + batching
- `src/engine/ToneEngine.ts:2219` — where synth gets recreated
- `src/engine/ToneEngine.ts:2384` — `getInstrument()` creates if not cached
