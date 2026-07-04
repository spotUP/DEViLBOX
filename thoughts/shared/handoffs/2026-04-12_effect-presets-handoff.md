---
date: 2026-04-12
topic: Per-effect parameter presets — ready for next session
tags: [effects, presets, ui]
status: draft
---

# Effect Presets — Next Session Task

## What needs doing

Add per-effect parameter presets to all 109 effects. Both factory presets AND user-saveable.

## Approach

1. **EffectPreset type** in `src/types/instrument/effects.ts`:
   - `{ name: string; params: Record<string, number | string> }`
   - Factory presets come from effect descriptors in the registry
   - User presets saved to localStorage keyed by effect type

2. **Registry-driven factory presets** — add `presets: EffectPreset[]` to `EffectDescriptor`:
   - `src/engine/registry/EffectDescriptor.ts` — add field
   - Each registration file adds presets for its effects:
     - `src/engine/registry/effects/tonejs.ts` — 30 Tone.js effects
     - `src/engine/registry/effects/wasm.ts` — 60+ WASM effects
     - `src/engine/registry/effects/buzzmachine.ts` — 23 Buzz effects
   - Neural presets come from `guitarMLRegistry.ts` (already has characteristics)

3. **Shared UI component** — `EffectPresetDropdown.tsx`:
   - Reads factory presets from registry + user presets from localStorage
   - "Save" button to store current params as user preset
   - Delete user presets
   - Dropdown integrated into each editor's header section

4. **Wire into editors** — each editor gets `<EffectPresetDropdown>` in its header.
   Uses `onUpdateParameters` to apply all params at once.

## Batch order

- Batch 1: Infrastructure (type, descriptor field, dropdown component, localStorage)
- Batch 2: Tone.js effect presets (30 effects, 3-5 presets each)
- Batch 3: WASM effect presets (60+ effects)
- Batch 4: Buzzmachine presets (23 effects — can auto-generate from BUZZMACHINE_INFO defaults)
- Batch 5: Neural presets (from guitarMLRegistry characteristics)

## Files I already created (DELETE and redo properly)
- `src/constants/effectPresets.ts` — hardcoded presets, wrong approach
- `src/components/effects/editors/EffectPresetDropdown.tsx` — too simple, no save/load
