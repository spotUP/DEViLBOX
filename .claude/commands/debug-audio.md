---
name: debug-audio
description: "Diagnose why DEViLBOX has no audio output"
---

# /debug-audio — Diagnose Silent Audio

Systematically check why DEViLBOX isn't producing sound.

## Usage

```
/debug-audio
```

## Diagnostic Steps (run in order)

### Step 1: AudioContext State
```
get_audio_state
```
Check:
- `initialized` must be `true`
- `contextState` must be `"running"` (not `"suspended"`)
- If suspended → User needs to **click anywhere in the browser** to unlock

### Step 2: Master Output
```
get_audio_state
```
Check:
- `masterMuted` — if true, call `set_master_mute(muted: false)`
- `masterVolume` — if -60, call `set_master_volume(volume: 0)` (0 dB = unity)

### Step 3: Channel Mutes
```
get_mixer_state
```
Check: Are all channels muted? If so: `unmute_all_channels`

### Step 4: Playback State
```
get_playback_state
```
Check: `isPlaying` must be `true`. If not: `play`

### Step 5: Instruments
```
get_instruments_list
```
Check: Are there instruments loaded? Empty = no sound possible.

### Step 6: Synth Errors
```
get_synth_errors
```
Check: Any WASM crashes, init failures, or missing ROMs?

### Step 7: Format Engine
```
get_format_state
```
Check: Which WASM engine is loaded? Is it the right one for the file format?

### Step 8: Audio Level Measurement
```
get_audio_level(durationMs: 2000)
```
Measures actual audio output. If `rmsAvg` is 0 after all checks pass → the issue is in the synth/engine, not the audio routing.

### Step 9: Real-time Analysis
```
get_audio_analysis
```
Returns FFT spectrum, band energy, beat detection. If data shows energy but no audible output → check master effects or bus routing.

## Common Fixes

| Symptom | Fix |
|---------|-----|
| contextState: "suspended" | Click in browser to unlock AudioContext |
| masterMuted: true | `set_master_mute(muted: false)` |
| masterVolume: -60 | `set_master_volume(volume: 0)` |
| All channels muted | `unmute_all_channels` |
| Not playing | `play` |
| No instruments | Load a file first: `load_file(path: "...")` |
| WASM crash | `get_synth_errors` → report to user |
| filterSelect: 1 (TB303) | Must be 0 or 5. `update_synth_config(id: N, configKey: "tb303", updates: {filterSelect: 0})` |
