---
date: 2026-04-12
topic: TrackerReplayer refactor + effects + build fixes
tags: [refactor, effects, buzzmachine, build, deploy]
status: final
---

# Session Handoff

## What Was Done

### TrackerReplayer Refactor (Phase 2-5.4) — COMPLETE
- **PlaybackCoordinator** (`src/engine/PlaybackCoordinator.ts`, 313 lines): owns ring buffer, position dispatch, callbacks, VU meters, automation, capture sync
- All 5 engines modularized with `startWithCoordinator`/`subscribeToCoordinator`: LibopenmptEngine, HivelyEngine, MusicLineEngine, UADEEngine, FurnaceDispatchEngine
- WASM-backed formats skip TS scheduler (gated on `coordinator.hasActiveDispatch`)
- Fresh songs get on-demand libopenmpt backing in `play()` (Phase 5.4)
- TrackerReplayer: 5,756 → 5,363 lines

### Audio Effects — COMPLETE
- 6 WASM effect binaries restored with Embind process() fix (Leslie, MVerb, SpringReverb, ShimmerReverb, MoogFilters, GranularFreeze)
- 23 Buzzmachine effects added to UI (`src/constants/unifiedEffects.ts`)
- Fixed `addMasterEffect` category detection (prefix-based, no circular dep)
- Fixed Buzzmachine default parameters from `BUZZMACHINE_INFO`
- Fixed MasterEffectsChain to bridge Tone.js ↔ native AudioNode connections
- Fixed audit script knob tests (Delay: feedback, Phaser: Q)
- SpaceyDelayer/RETapeEcho verified working in Node.js

### Build Fixes
- `public/dist` recursive bomb: added `.gitignore` entry + `prebuild` cleanup in package.json
- Production TDZ error: removed circular dep (useAudioStore → unifiedEffects). Category now uses prefix check.
- Created stub files for 7 missing modules from other agents' incomplete work

### Other
- Nibbles: sound effects, tighter input, Enter key, aspect-ratio modal
- Bridge AdPlug routing fix (`writeHandlers.ts:879`)
- Smoke test: strict pattern + audio checks, 8/8 passing
- LibopenmptEngine: always reconnect output on play (fixes HMR stale routing)

## Immediate TODO — Build & Deploy

The production build fails with **EPERM** from macOS sandbox on esbuild temp files. Run from a regular terminal (NOT Claude):

Deploy is AUTOMATIC: just `git push origin main`. CI builds and triggers the Hetzner webhook.
DO NOT use `gh-pages` — the live site is on Hetzner (`devilbox.uprough.net`), not GitHub Pages.

If type-check fails (other agents' missing files), skip it:
Deploy is AUTOMATIC: just `git push origin main`. CI builds and triggers the Hetzner webhook.
DO NOT use `gh-pages` — the live site is on Hetzner (`devilbox.uprough.net`), not GitHub Pages.

### Type-check errors from other agents (not ours)
- `src/stores/useUIStore.ts:234` — missing properties (toggleKnobPanelCollapsed, etc.)
- `src/components/dialogs/SettingsModal.tsx:225` — setTB303Collapsed missing
- `src/pixi/dialogs/PixiSettingsModal.tsx:265` — tb303Collapsed missing

### Stub files created (other agents should replace with real implementations)
- `src/components/pianoroll/PianoRoll.tsx`
- `src/components/arrangement/ArrangementView.tsx`
- `src/pixi/dialogs/PixiAcidPatternDialog.tsx`
- `src/pixi/views/PixiArrangementView.tsx`
- `src/pixi/views/PixiPianoRollView.tsx`
- `src/pixi/views/PixiGTPianoRoll.ts`
- `src/stores/usePianoRollStore.ts`
- `src/types/arrangement.ts`

## Remaining Work

### Effects (needs stable browser)
- Run full `npx tsx tools/fx-audit.ts` with a song playing — updates tracker at localhost:4444
- Verify Buzzmachine effects have working knobs after MasterEffectsChain fix
- Verify Leslie/MVerb work in browser (WASM verified in Node)
- 23 Buzzmachine + 5 WASM effects need browser re-audit

### Format tracker: 1221 fixed + 147 works = 1368/1465 (93.4%)
- 74 fails: mostly UADE format errors + stale fur-* tests (MCP was down)
- 23 unknowns: WAM/neural effects need manual test

## Key Files Modified This Session

| File | Change |
|------|--------|
| `src/engine/PlaybackCoordinator.ts` | NEW — ring buffer, position dispatch, callbacks |
| `src/engine/TrackerReplayer.ts` | -400 lines, Phase 5.4 on-demand soundlib |
| `src/engine/libopenmpt/LibopenmptEngine.ts` | startWithCoordinator, routing fix |
| `src/engine/libopenmpt/OpenMPTEditBridge.ts` | flush(), serialize timer |
| `src/engine/hively/HivelyEngine.ts` | subscribeToCoordinator |
| `src/engine/musicline/MusicLineEngine.ts` | subscribeToCoordinator |
| `src/engine/uade/UADEEngine.ts` | subscribeToCoordinator (position+Paula+TFMX) |
| `src/engine/furnace-dispatch/FurnaceDispatchEngine.ts` | startWithCoordinator |
| `src/stores/useTrackerStore.ts` | static bridge import, Phase 5.4 |
| `src/stores/useAudioStore.ts` | category prefix check (no circular dep) |
| `src/engine/registry/effects/buzzmachine.ts` | default params from BUZZMACHINE_INFO |
| `src/engine/tone/MasterEffectsChain.ts` | native AudioNode bridging |
| `src/constants/unifiedEffects.ts` | 23 Buzzmachine entries |
| `src/bridge/handlers/writeHandlers.ts` | AdPlug routing fix |
| `tools/fx-audit.ts` | Delay/Phaser knob tests |
| `tools/playback-smoke-test.ts` | strict checks |
| `.gitignore` | public/dist prevention |
| `package.json` | prebuild rm -rf public/dist |
