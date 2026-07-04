---
date: 2026-04-05
topic: context-menu-fixes-bake-chord-furnace-audio
tags: [context-menu, bake-chord, furnace, wam, amsynth]
status: final
---

# Session Handoff — 2026-04-05

## Tasks Completed

### Context Menu Fixes
- **Column hit-test**: GL renderer centers content within channels; hit-test used hardcoded 8px offset. Fixed to compute same centering offset.
- **Multi-note-column rendering**: GL renderer didn't render note2/note3/note4. Added NOTE_COL_GROUP_W loop + cursor noteColumnIndex support.
- **Native menu leak**: Added capture-phase native contextmenu listener on container.
- **DevTools coordinate offset**: Chrome DevTools docked to side offsets contextmenu clientX. Fixed by using cursor position (set by left-click) instead of unreliable event coordinates.

### Bake Chord Feature
- Right-click note → "Bake Chord (1 channel)" → renders each chord note through SynthBaker, mixes/normalizes into single WAV sample, creates new Sampler instrument.
- Smart duration from instrument envelope (attack+decay+0.3s sustain+release, clamped 0.5-4s).
- Named from source + chord: e.g., "FMSynth C4Maj" (22 char max).
- WASM synths blocked with clear message (can't run in OfflineAudioContext).
- Serialized rendering (no parallel Promise.all — context corruption).

### Sampler/Tone.js Fixes
- **baseNote dash strip**: Tracker 'C-4' → Tone.js 'C4' in ToneEngine Sampler creation and InstrumentList preview.
- **Blob URL rejection**: Don't reject blob URLs when audioBuffer exists alongside (session-valid).
- **WAV encoding**: Baked samples encoded as proper 16-bit WAV via WavEncoder (raw PCM can't be decoded).

### WAM Synth Fix
- WAMSynth101/OBXd/etc. used specific synthTypes not in isWASMSynth shared list. Added `isWAM = startsWith('WAM')` check. Prevents per-channel instance creation (duplicate WASM downloads, missed notes).

### Amsynth UI
- Removed container-fitting CSS downscale that caused blurry bitmap rendering. Now renders at native skin size.

### Furnace Audio
- **TextEncoder crash**: Replaced with manual UTF-8 encode (AudioWorkletGlobalScope doesn't have TextEncoder).
- **Heap growth investigation**: Speculative interleaved tick/render changes were REVERTED — caused volume boosting and new crashes. Only TextEncoder fix retained.
- **Furnace distortion**: Pre-existing regression from another session, not from this work. Needs separate investigation.

## Key Learnings
- Chrome DevTools docked to side offsets contextmenu event clientX (browser bug)
- Tone.js Sampler note names must NOT have dashes (C4 not C-4)
- WASM synths can't run in OfflineAudioContext — need live recording approach for baking
- NEVER make speculative changes to audio worklets — evidence first, always
