---
date: 2026-04-04
topic: dj-scratch-dx7-hively-session
tags: [dj, scratch, dx7, hively, audio, ui, gig-prep]
status: final
---

# Session Handoff — 2026-04-03/04

## DJ Scratch — DONE
All scratch bugs fixed and verified:
- Flanging: backward rate sign bug (4 setRate calls)
- Position reset: use backwardStartElapsedMs, not broken framesBack
- Async race: _switchToForward fully synchronous via silenceAndStop()
- Backward displacement tracking for accurate resume position
- Gain overlap root cause: instant _setDeckGain(0) on backward entry
- Raw native AudioParam bypasses Tone.Signal entirely
- Brick-wall limiter (-1dBFS) on each deck channel output
- Speed drift: hardReset forces playbackRate to restMultiplier
- useDeckStateSync: no longer marks deck stopped during scratch/AutoDJ

## DJ Features — DONE
- Scratch sensitivity slider (50-200%) in Settings > Input
- View mutual exclusion: tracker stops on DJ entry, DJ stops on non-VJ exit
- Auto DJ error feedback with status bar messages
- Pattern display mounted in Pixi vinyl/3D deck views
- Crate panel eventMode for immediate interaction
- DOM playlist JS hover (onPointerEnter/Leave, not CSS :hover — mobile device)
- PixiList hover from parent pointermove + hitArea rectangles
- Hover-revealed action buttons (1/2/X) on playlist rows

## DX7 — PARTIALLY DONE
- VCED operator order fixed: config[0]=OP1 → VCED slot 5
- Patch banks work: selectVoiceInBank loads bank before selecting voice
- Bridge dx7LoadSysex handles everything (internal RAM + cartridge + PC 0)
- Removed all redundant loadVoices calls from TypeScript
- VCED presets use 32-voice bulk dump + delayed selectVoice(0) for EGS reload
- DX7 WASM/worklet/bridge force-added to git (were gitignored, nearly lost)

### DX7 Known Issues
- VCED presets may not sound accurate (custom patches, not ROM copies)
- Patch bank voices may not perfectly match labels
- Single-voice sysex (format 0) abandoned — unknown VDX7 firmware support
- The CMakeLists.txt for the DX7 WASM build is in a gitignored submodule dir
  and was lost. The build cache at project root still works (`emmake make`)
  but can't reconfigure. Need to recreate CMakeLists or restore submodule.

## HivelyTracker — IN PROGRESS
- Created 15 factory presets in `src/constants/hivelyPresets.ts`
- Registered in `src/constants/factoryPresets/index.ts`
- Fixed: engine output now connects to ALL HivelySynth instances (was first-only)

### Hively Known Issues — CRITICAL
- **WASM crash**: `memory access out of bounds` in `hively_player_render`
  when multiple HivelySynth instruments exist (4+ players overflow pool)
- The `MAX_PLAYERS` constant in `HivelyWrapper.c` limits concurrent players
- Each instrument slot creates a separate player via `hively_create_player()`
- Need to either: increase MAX_PLAYERS, or share a single player across
  instrument slots (like the engine already does for song playback)
- File: `hively-wasm/common/HivelyWrapper.c` — check `MAX_PLAYERS` define

### Hively Next Steps
1. Find and increase `MAX_PLAYERS` in HivelyWrapper.c (or check pool management)
2. Rebuild Hively WASM: `cd hively-wasm/build && emcmake cmake .. && emmake make`
3. Test presets with a single HivelySynth instrument (avoid the crash)
4. Verify preset sounds match their descriptions

## Key Files Changed
| File | What |
|------|------|
| `src/engine/dj/DeckEngine.ts` | All scratch fixes, limiter, gain automation |
| `src/engine/dj/DeckScratchBuffer.ts` | wireIntoChain signature |
| `src/engine/dj/DJAutoDJ.ts` | Error feedback from enable() |
| `src/engine/dj/DJActions.ts` | enableAutoDJ returns string|null |
| `src/stores/useUIStore.ts` | View switch mutual exclusion |
| `src/hooks/dj/useDeckStateSync.ts` | Scratch/AutoDJ-aware false-stop |
| `src/engine/dx7/DX7Synth.ts` | Simplified voice loading, VCED bulk dump |
| `src/engine/dx7/dx7sysex.ts` | Operator order reversal |
| `src/engine/dx7/dx7presets.ts` | Custom VCED presets (unchanged) |
| `public/dx7/DX7.worklet.js` | Clean loadSysex (no cartridge hack) |
| `juce-wasm/dx7/dx7_bridge.cpp` | Cartridge sync in dx7LoadSysex |
| `src/engine/hively/HivelySynth.ts` | All instances connect to engine |
| `src/constants/hivelyPresets.ts` | 15 new factory presets |
| `src/constants/factoryPresets/index.ts` | Added HIVELY_PRESETS |
| `src/components/dj/DJPlaylistPanel.tsx` | JS hover, action buttons |
| `src/pixi/components/PixiList.tsx` | Hover, hitArea, actions |
| `src/pixi/views/dj/PixiDJDeck.tsx` | Pattern display, scratch sensitivity |
| `src/components/instruments/controls/DX7Controls.tsx` | selectVoiceInBank loads bank |

## Gig Prep (April 18)
- Scratch system solid
- DJ view working
- Soak test still needed (2+ hour sustained load)
- DX7 presets partially working
- HivelyTracker needs WASM pool fix before usable
