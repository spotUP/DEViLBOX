---
name: sound-design
description: "Analyze and design synth sounds using spectral analysis and parameter sweeps"
---

# /sound-design — Synth Sound Design Assistant

Analyze instrument spectra, sweep parameters, and iteratively design sounds.

## Usage

```
/sound-design <instrument id or description>
```

Examples:
- `/sound-design 0` — Analyze instrument 0
- `/sound-design tb303 acid` — Design an acid TB-303 sound
- `/sound-design sweep cutoff on instrument 1` — Sweep cutoff frequency

## Workflow

### Step 1: Check Current Sound
```
get_synth_config(id: <instrumentId>)
```
Shows all synth sub-configs (tb303, envelope, filter, oscillator, etc.).

### Step 2: Analyze Current Spectrum
```
analyze_instrument_spectrum(instrumentId: <id>, note: "C-3", durationMs: 1000)
```
Returns:
- **fundamental**: Detected frequency (Hz)
- **harmonicsDb**: Harmonic levels relative to fundamental (2x through 8x)
- **spectralCentroid**: Brightness indicator (Hz) — higher = brighter
- **brightness**: Energy ratio above 2kHz (0-1)
- **envelope**: Attack time (ms), sustain level
- **fftSummary**: 32-bin frequency snapshot

### Step 3: Sweep a Parameter
```
sweep_parameter(
  instrumentId: <id>,
  parameter: "cutoff",     // Parameter to sweep
  from: 0,                 // Start value
  to: 1,                   // End value
  steps: 10,               // Number of measurement points
  note: "C-3"              // Note to test with
)
```
Returns spectral centroid, brightness, and RMS at each step. Use to find sweet spots.

Common parameters to sweep:
- **TB-303**: `cutoff`, `resonance`, `envMod`, `decay`, `filterInputDrive`, `accent`
- **Synth**: `frequency`, `detune`, `filterFrequency`, `filterQ`
- **Any**: Use `get_synth_config` to see available parameters

### Step 4: Adjust Parameters
```
update_synth_config(id: <id>, configKey: "tb303", updates: {cutoff: 0.7, resonance: 0.85})
```
Or for real-time tweaking:
```
set_synth_param(id: <id>, param: "cutoff", value: 0.7)
```

### Step 5: Re-analyze
Repeat step 2 to compare before/after. Show the difference in centroid, brightness, harmonics.

### Step 6: Preview
```
trigger_note(id: <id>, note: "C-3", velocity: 100, duration: 1.0)
```

## TB-303 Acid Sound Recipe

For the classic acid squelch:
```
update_synth_config(id: 0, configKey: "tb303", updates: {
  cutoff: 0.3,
  resonance: 0.85,
  envMod: 0.7,
  decay: 0.4,
  accent: 0.8,
  filterSelect: 0,
  waveform: 0,
  filterInputDrive: 0.5
})
```
Then analyze to verify: high resonance peak, bright spectral centroid on accented notes.

## Important Notes

- TB-303 `filterSelect` must be 0 (DiodeLadder) or 5 (MissThang). Any other value kills resonance.
- All TB-303 parameters are 0-1 normalized. The WASM converts internally.
- Use `get_loaded_synths` to verify the synth instance is active before analyzing.
