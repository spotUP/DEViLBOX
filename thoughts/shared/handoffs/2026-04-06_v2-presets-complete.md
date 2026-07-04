---
date: 2026-04-06
topic: v2-presets-and-preset-dropdown
tags: [v2, presets, ui, synths]
status: final
---

# Handoff: V2 Presets & Preset Dropdown (April 6)

## What Was Done

### V2 Real Patch Extraction
- Extracted 26 real patches from Farbrausch V2M demo files (pzero_new.v2m, v2_zeitmaschine_new.v2m)
- Replaced hand-crafted presets that had wrong filter cutoffs and no modulation routing

### V2Config Full Parameter Support
Extended V2Config to expose ALL V2 synth parameters (previously many were hardcoded/dropped):
- **voice section**: panning, transpose (was +24st on some patches!), maxPoly (1-16), boost, reverb/delay sends, aux sends, keySync, fxRoute
- **envelope sustainTime + amplify**: both amp and mod envelopes now pass through real values
- **osc1 ringMod**: was always forced false
- **modMatrix**: full source→amount→dest routing array (critical for filter sweeps, pitch bends)

### V2 Knob Retrigger
V2 WASM reads patches only at noteOn. Added active note tracking — after loadPatch, active notes are retriggered so knob changes are audible immediately.

### V2 Mod Matrix UI
Full mod matrix editor in the MOD tab: source dropdown, amount input, destination dropdown, add/remove. All 89 V2 parameters available as destinations.

### V2 Voice Controls UI
Voice section in the ENV tab: Pan, Transpose, Polyphony, Boost, Reverb, Delay, KeySync dropdown, FX Route dropdown. Envelope sustainTime and amplify knobs added.

### WASM Debug Prints Removed
Removed 3 debug printf calls from synth_core.cpp ([V2 copy], [V2 core], [V2 render]). Rebuilt WASM.

### Preset Naming Audit
Names based on actual sound characteristics, not just oscillator modes:
- Filter type awareness: high-pass + noise + short decay = Hihat (not "Pulse Stab")
- Pitch sweep detection: sine + eg2→transpose = Kick
- Proper drum classification: Kick, Snare, Hihat, Cymbal, Rim Shot

### Per-Preset Volume Normalization
Loudness analysis per preset (osc volumes × filter brightness × amp amplify × boost). Volumes range from -3dB (quiet dark patches) to -14dB (loud multi-osc patches).

### Showcase Default Presets
Curated SHOWCASE_PRESETS map in factoryPresets/index.ts — each synth type defaults to its most impressive sound: Synth→Supersaw Lead, MonoSynth→Acid Lead, FMSynth→FM Electric Piano, etc.

### Preset Dropdown Shows Current Name
- Button shows active preset name instead of "Presets (N)"
- Selected preset highlighted with accent color + left border
- Auto-scrolls to selected on open
- Both DOM and Pixi/GL versions updated
- All 15+ usage sites updated

## Key Files
| File | Changes |
|------|---------|
| `src/constants/v2Presets.ts` | 26 real patches with all params |
| `src/types/instrument/tonejs.ts` | V2Config: voice, sustainTime, amplify, modMatrix |
| `src/types/v2Instrument.ts` | V2ConfigInput, v2ConfigToInstrument, MOD_SOURCES |
| `src/types/instrument/defaults.ts` | DEFAULT_V2 with voice section |
| `src/engine/v2/V2Synth.ts` | _activeNotes retrigger on config change |
| `src/components/instruments/controls/V2Controls.tsx` | Voice controls, mod matrix editor |
| `src/components/instruments/presets/PresetDropdown.tsx` | Current name display, scroll-to-selected |
| `src/pixi/views/instruments/PixiPresetDropdown.tsx` | Same for GL |
| `src/constants/factoryPresets/index.ts` | SHOWCASE_PRESETS map |
| `v2-synth-wasm/src/synth_core.cpp` | Removed debug printf |
| `public/v2/V2Synth.{js,wasm}` | Rebuilt without debug prints |

## Known Issues
- Some V2 presets still quieter than others despite per-preset volumes — may need manual listening pass
- Linter/agent keeps reverting V2 file changes — watch for reverted type definitions and preset data
- V2 MCP audio path doesn't work (WASM init doesn't trigger through update_synth_config)

## Commits
- `10aa571ed` — feat: V2 synth — real Farbrausch presets with full parameter support
- `ac9163c6f` — feat: preset dropdown shows current name, per-preset V2 volumes, showcase defaults
