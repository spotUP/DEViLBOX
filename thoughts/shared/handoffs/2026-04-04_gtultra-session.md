---
date: 2026-04-04
topic: gtultra-dual-sid-sound-designer
tags: [gtultra, sid, sound-designer, automation]
status: final
---

# Session Handoff: GTUltra Dual SID + Sound Designer

## Tasks Completed
- **Build system**: `scripts/build-all-wasm.sh` (86 modules) + `BUILDING.md`
- **Multispeed fix**: `gt_play()` now sets framerate from multiplier (was stuck at 50Hz)
- **Dual SID**: `gt_load_sng()` syncs gt_sid_count from maxSIDChannels, worklet includes channelCount in songLoaded response, onSongLoaded sets sidCount before refreshing orders
- **Instrument editor layout**: 3-column grid for GTUltraControls, 4-column waveforms/tables in DAW sidebar
- **Order matrix**: React.memo + songPos-only subscription to prevent per-row re-renders
- **Instrument switching**: GTUltraControls reads live data from GT store instrumentData
- **Project metadata**: onSongInfo sets useProjectStore metadata for project tab
- **Sound Designer**: New tab with preset bar, ADSR, wave sequence editor, pulse/filter draw canvases, arp grid, settings
- **GTTableCodec**: Encode/decode for all 4 table types with 15 passing tests
- **SID Monitor**: Live 15Hz polling, horizontal 4-column layout
- **Synth category**: Registered GTUltraSynth in amigaSynths.ts

## Known Issues
- Order matrix shows 6 channels but data for channels 3-5 may be delayed (async timing)
- CMakeLists output directory fix for gtultra didn't take effect (manual cp still needed)

## Next: Automation Lanes (needs plan)
- Format-agnostic ring buffer for register captures
- GTUltra (ASID bridge), UADE (Paula log), SunVox (module scope) ready now
- Furnace, Hively, C64 SID need bridge work
- Shared AutomationLaneView component synced to playback position

## Key Files Modified
- `gtultra-wasm/src/GTUltraBridge.cpp` — multispeed + dual SID
- `public/gtultra/GTUltra.worklet.js` — channelCount in songLoaded
- `src/engine/gtultra/useGTUltraEngineInit.ts` — sidCount + orders + metadata
- `src/components/gtultra/GTSoundDesigner.tsx` — new visual editor
- `src/lib/gtultra/GTTableCodec.ts` — new codec
- `src/components/instruments/controls/GTUltraControls.tsx` — all tabs
- `src/components/gtultra/GTOrderMatrix.tsx` — memo + songPos
- `src/lib/file/UnifiedFileLoader.ts` — removed racing refresh calls
