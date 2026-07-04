---
date: 2026-04-11
topic: TrackerReplayer refactor + audio effects audit
tags: [refactor, playback, effects, buzzmachine, phase5]
status: final
---

# Session Handoff: TrackerReplayer Refactor + Effects Audit

## Tasks Completed

### TrackerReplayer Refactor (Phase 2-5.4)

**Phase 2**: Soundlib as primary edit path
- Static import of OpenMPTEditBridge in useTrackerStore
- Bridge sync happens in same tick as store mutation (no async race)
- Added flush() API to bridge

**Phase 3.1-3.2**: PlaybackCoordinator extraction
- New `src/engine/PlaybackCoordinator.ts` (313 lines)
- DisplayStateRing (256-entry ring buffer), 4 UI callbacks, capture-sync timer
- PlaybackContext with songPositions, bpm, speed, fireHybridNotes, triggerVUMeters, applyAutomation hooks

**Phase 4.1-4.6**: Engine module migration
- 4.1: Consolidated 5 duplicate position-dispatch blocks into dispatchEnginePosition
- 4.2: Moved dispatchEnginePosition + PlaybackContext into coordinator
- 4.3: LibopenmptEngine.startWithCoordinator (bridge serialize, loadTune, routing, position, stereo sep)
- 4.4: Hively + MusicLine subscribeToCoordinator
- 4.5: UADEEngine.subscribeToCoordinator (CIA-tick→row, Paula log, deferred capture, TFMX timing)
- 4.6: FurnaceDispatchEngine.startWithCoordinator (chip lifecycle, samples, INS2, sequencer, position, cmdlog)

**Phase 5.1-5.3**: Scheduler bypass
- 5.1: VU meter triggering → coordinator (triggerVUMetersForRow hook)
- 5.2: Automation player → coordinator (applyAutomationForRow hook)
- 5.3: WASM-backed formats skip startScheduler (gated on coordinator.hasActiveDispatch)

**Phase 5.4**: Fresh songs route through libopenmpt
- On-demand empty XM creation in play() (moved from reset() to avoid race condition)
- Bridge re-activation after loadSong's reset

**Key bug fix**: Phase 5.4 race condition — initFreshSoundlib in reset() clobbered real MOD data from concurrent imports. Fixed by moving to play() path with song.libopenmptFileData null check.

### Audio Effects

**Bridge routing fix**: `writeHandlers.ts:879` was routing ALL formats with nativeParser to `parseAdPlugFile`. Fixed to check `parseFn === 'parseAdPlugFile'` specifically.

**LibopenmptEngine routing fix**: _routed singleton flag prevented reconnection after HMR. Fixed to always disconnect+reconnect when destination is provided.

**6 WASM effect binaries restored**: Leslie, MVerb, SpringReverb, ShimmerReverb, MoogFilters, GranularFreeze — all restored from commit 799f9f8ed with Embind process() fix.

**23 Buzzmachine effects**:
- Added to AVAILABLE_EFFECTS in unifiedEffects.ts (were registered in EffectRegistry but missing from UI)
- Fixed addMasterEffect to look up correct category (was hardcoded 'tonejs')
- Fixed getDefaultParameters to populate from BUZZMACHINE_INFO
- Fixed MasterEffectsChain to bridge Tone.js ↔ native AudioNode connections (BuzzmachineSynth has native GainNodes)
- Fixed require() → static import in useAudioStore (production build TDZ error)

**Audit script improvements**:
- Strict pattern data + audio level checks
- engineDriven flag for SID (no pattern data)
- Fixed Delay knob test (feedback not time)
- Fixed Phaser knob test (Q not frequency)
- Polling wait for pattern data after load

**Audit results** (partial — 31 of 109 tested before browser crash):
- 26 PASS, 3 FAIL (false positives fixed), 1 CRASH (Leslie — WASM works in Node, browser-specific)
- SpaceyDelayer/RETapeEcho: WASM DSP verified in Node (0.21/0.62 output) — audit false negatives (long delay buffer)

### Other

**Nibbles**: Sound effects (5 Tone.js synths), tighter input handling (drain full buffer per tick), Enter key starts game, aspect-ratio modal sizing, removed blue border + black gap.

**Smoke test**: 8/8 formats passing (MOD, IT, S3M, HVL, FC, JAM, SID, TFMX) — expanded by other agents to 40+ tests.

## Files Modified

### Core refactor
- `src/engine/PlaybackCoordinator.ts` — NEW (313 lines)
- `src/engine/TrackerReplayer.ts` — -600 lines net (5756→5363)
- `src/engine/libopenmpt/LibopenmptEngine.ts` — +startWithCoordinator
- `src/engine/libopenmpt/OpenMPTEditBridge.ts` — flush(), serialize timer cancel, header doc
- `src/engine/hively/HivelyEngine.ts` — +subscribeToCoordinator
- `src/engine/musicline/MusicLineEngine.ts` — +subscribeToCoordinator
- `src/engine/uade/UADEEngine.ts` — +subscribeToCoordinator (position, Paula, deferred, TFMX)
- `src/engine/furnace-dispatch/FurnaceDispatchEngine.ts` — +startWithCoordinator
- `src/stores/useTrackerStore.ts` — static OpenMPTEditBridge import, initFreshSoundlib

### Effects
- `src/stores/useAudioStore.ts` — category lookup from AVAILABLE_EFFECTS
- `src/engine/registry/effects/buzzmachine.ts` — default parameters from BUZZMACHINE_INFO
- `src/engine/tone/MasterEffectsChain.ts` — native AudioNode bridging
- `src/constants/unifiedEffects.ts` — 23 Buzzmachine entries
- `src/bridge/handlers/writeHandlers.ts` — AdPlug routing fix
- `tools/fx-audit.ts` — Delay/Phaser knob test params
- `tools/playback-smoke-test.ts` — strict checks

### Nibbles
- `src/components/visualization/NibblesGame.tsx` — SFX, input, Enter key
- `src/components/tracker/FT2Toolbar/FT2Toolbar.tsx` — modal sizing

## Next Steps

1. **Full fx-audit run** — needs stable browser (no HMR from other agents). Run: `npx tsx tools/fx-audit.ts` with a song playing
2. **23 Buzzmachine effects browser test** — verify knobs work after chain bridging fix
3. **Leslie browser test** — WASM works in Node but crashed browser earlier; may work now with restored binary
4. **Production build verify** — check if `Cannot access 'UI' before initialization` is fixed (was likely the require() in useAudioStore)
5. **Format tracker update** — re-audit effects and push results to localhost:4444
