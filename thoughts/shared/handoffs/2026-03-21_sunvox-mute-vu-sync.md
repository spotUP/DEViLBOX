---
date: 2026-03-21
topic: sunvox-mute-vu-sync
tags: [sunvox, mute, solo, vu-meters, playback-sync]
status: in-progress
---

# SunVox Mute/Solo, VU Meters, Playback Sync — Handoff

## Problem
After loading .sunvox files, mute/solo buttons don't work, VU meters show nothing,
and the tracker replayer runs independently from the SunVox internal sequencer.

## Key Finding: Mute Handler Never Reached
Debug logs added to `_applySunVoxMutes` (useTrackerStore.ts:89) and
`forwardWasmChannelGain` (useMixerStore.ts:209) NEVER appear in console
when clicking mute/solo in the DOM channel headers.

The call chain should be:
```
ChannelManager.tsx:365 → toggleChannelMute(index)
  → useTrackerStore:1261 toggleChannelMute action
    → forwardWasmMuteStates(pattern.channels) at line 1278
      → _applySunVoxMutes(channels, anySolo) at line 139
```

**The mute routing code EXISTS and is correct.** The issue is that the mute
click handler never fires, OR the function returns early before reaching the
SunVox code path. Need to add a log at the very start of `toggleChannelMute`
to verify the handler fires at all.

## Possible causes
1. The DOM "mute/solo icons" the user is clicking might be in a DIFFERENT component
   than `ChannelManager.tsx` — maybe a different tracker view renders them
2. The component might not be rendered in the current UI mode
3. React event propagation issue (stopPropagation somewhere)

## All Mute/Solo Plumbing (already wired)
- `useTrackerStore.toggleChannelMute` → `forwardWasmMuteStates` → `_applySunVoxMutes`
- `useMixerStore.setChannelMute` → `forwardWasmChannelGain` → `forwardSunVoxModuleMute`
- `SunVoxEngine.muteModule(handle, moduleId)` / `unmuteModule(handle, moduleId)`
- Worklet `muteModule`/`unmuteModule` handlers (Volume ctl or NOTECMD_CLEAN_MODULE)
- `hasSunVoxSongInstruments()` helper
- `getSharedSunVoxHandle()` export

## Also broken: Audio on some songs
`a nos amachi.sunvox` — completely silent (max amplitude 0.0000 for 45 seconds).
Same symptoms as `windy.sunvox` had before. But `caravan.sunvox` plays fine.
This suggests some songs have issues with the SunVox WASM rendering — maybe
related to sample rate (44100 vs 48000 — the latest log shows 44100).

## VU Meters
Need `sv_get_module_scope2(slot, mod_num, channel, buf, samples)` — returns
per-module waveform data. Add a worklet message and poll from the tracker UI.

## Playback Sync
Need `sv_get_current_line(slot)` — returns global timeline position.
The tracker replayer should sync its display to this instead of running its own clock.

## Files to check next session
- `src/components/tracker/ChannelManager.tsx:362-365` — DOM mute button
- `src/stores/useTrackerStore.ts:1261` — toggleChannelMute handler
- `src/stores/useTrackerStore.ts:46-95` — _applySunVoxMutes
- `src/stores/useMixerStore.ts:147-188` — forwardSunVoxModuleMute
- `public/sunvox/SunVox.worklet.js:354-389` — worklet mute handlers
- SunVox docs: https://warmplace.ru/soft/sunvox/sunvox_lib.php
