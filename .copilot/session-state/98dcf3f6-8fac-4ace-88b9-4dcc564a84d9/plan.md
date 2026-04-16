# Automation Lanes — Format/Synth Awareness & Parameter Audit

## Problem

The automation system has 3 gaps:

1. **Not format-aware** — The parameter picker shows synth-specific params (e.g. tb303.cutoff) even when a WASM replay engine owns playback and can't accept those parameter changes. Need to filter to only compatible params.

2. **80+ synth types have no dedicated NKS parameter maps** — They fall back to GENERIC (only volume + pan). Major synths like DX7, OPL3, Geonkick, OpenWurli are missing proper automation support.

3. **No mixer-level or global automation targets** — Channel volume, pan, send levels, BPM, and swing should be automatable regardless of synth type. These are the most universally useful targets.

## Current Architecture

```
useChannelAutomationParams(channelIndex)
  → looks up channel's instrumentId → instrument's synthType
  → getNKSParametersForSynth(synthType) → NKSParameter[]
  → filters isAutomatable === true
  → displayed in AutomationParameterPicker dropdown
```

Playback: `AutomationPlayer.processPatternRow()` → `applyParameter()` → routes to instrument's `set()` method or Tone.js fallback.

The system already works for DEViLBOX native synths (TB303, Wavetable, etc). The issue is WASM-replayed formats.

## Approach

### Phase 1: Mixer/Global Automation Targets (universal — works for ALL formats)

Add automation targets that operate on the ToneEngine mixer layer, not the synth:
- **Channel Volume** — `mixer.volume` — ToneEngine channelGains
- **Channel Pan** — `mixer.pan` — ToneEngine channelPanners
- **Channel Mute** — `mixer.mute` — 0/1 toggle
- **Master Volume** — `global.masterVolume` — ToneEngine master gain
- **BPM** — `global.bpm` — Transport BPM (tempo curves)

These work regardless of format because they operate above the synth layer.

Add a `MIXER_NKS_PARAMETERS` array and inject it into every channel's parameter list alongside synth-specific params.

### Phase 2: Format-Aware Parameter Filtering

Add format-awareness to `useChannelAutomationParams`:
- If the channel's instrument uses a WASM replay engine (checked via format store's editorMode), filter OUT synth-internal params that can't be controlled.
- For WASM formats, only show: mixer params + any format-specific params the engine CAN handle.
- For DEViLBOX native synths, show ALL synth params + mixer params.

Key: check `useFormatStore.getState().editorMode` — if not 'classic', check if the instrument is a WASM synth with no `.set()` method.

### Phase 3: Missing NKS Parameter Maps (high-impact synths)

Add dedicated NKS maps for the most-used synths currently falling back to GENERIC:

| Synth | Priority | Params |
|-------|----------|--------|
| DX7 | HIGH | algorithm, feedback, op1-6 levels/rates/detune (36+) |
| OPL3 | HIGH | algorithm, feedback, op1-4 levels/attack/decay/sustain/release |
| Geonkick | HIGH | osc/noise/filter params for percussion synthesis |
| OpenWurli | MED | brightness, damping, sustain, tremolo |
| HivelySynth | MED | N/A — WASM replayer, use mixer params only |
| GTUltraSynth | MED | N/A — WASM replayer, use mixer params only |
| KlysSynth | MED | N/A — WASM replayer, use mixer params only |
| FurnaceSID3 | LOW | Same as FurnaceC64 + extended channels |

### Phase 4: AutomationPlayer Routing for Mixer Targets

Extend `AutomationPlayer.applyParameter()` to handle `mixer.*` and `global.*` targets:
- `mixer.volume` → `ToneEngine.setChannelVolume(channelIndex, value)`
- `mixer.pan` → `ToneEngine.setChannelPan(channelIndex, value)`
- `mixer.mute` → `ToneEngine.setChannelMute(channelIndex, value > 0.5)`
- `global.masterVolume` → Master gain node
- `global.bpm` → Transport.bpm.value

### Phase 5: Audit Verification

- Type-check clean
- Verify: classic format shows synth params + mixer params
- Verify: WASM format shows only mixer params (no synth-internal)
- Verify: DX7/OPL3/Geonkick show full dedicated parameter lists
