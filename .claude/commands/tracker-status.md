---
name: tracker-status
description: "Get full status of the DEViLBOX tracker — what's loaded, playing, audio state"
---

# /tracker-status — Full Tracker Status Report

Get a comprehensive status report of the running DEViLBOX tracker.

## Usage

```
/tracker-status
```

## Steps

1. **Song info**: Call `get_song_info` — returns BPM, speed, channels, patterns, editor mode, playback state.

2. **Audio state**: Call `get_audio_state` — returns AudioContext state, master volume, muted, bus gains, master effects.

3. **Playback state**: Call `get_playback_state` — returns isPlaying, currentRow, currentPattern, position.

4. **Instruments**: Call `get_instruments_list` — returns all instruments with id, name, type, synthType.

5. **Format state**: Call `get_format_state` — returns editor mode, loaded WASM engines, format-specific metadata.

6. **Errors**: Call `get_synth_errors` — returns any synth init failures or WASM crashes.

Run all 6 calls in parallel for speed, then present a summary report:

```
=== DEViLBOX Status ===
Song: <name> | <channels>ch | <patterns> patterns | BPM <bpm> | Speed <speed>
Editor: <mode> mode | Octave <oct> | Step <step>
Playback: <playing/stopped> | Row <row>/<total> | Pattern <pat>
Audio: <running/suspended> | Master vol <vol> | Muted: <yes/no>
Effects: <list of active master effects>
Instruments: <count> loaded (<types summary>)
WASM Engines: <list>
Errors: <count or "none">
```

## If No Browser Connected

If tools return "No browser connected", tell the user:
1. Start the dev server: `npm run dev`
2. Open browser at `http://localhost:5173`
3. Click anywhere to unlock AudioContext
