---
date: 2026-04-03
topic: pixi-instrument-editor-all-params
tags: [pixi, instruments, editor, params, parity]
status: draft
---

# Handoff: Instrument Editor — ALL Parameters in Simple UI

## Critical User Requirement

**EVERY synth's simple/visual UI MUST expose ALL parameters as knobs/controls — not just a subset.**

This was stated repeatedly. The simple UI is NOT a simplified view — it is a full parameter editor using knobs instead of a hardware rendering. The patch browser (for DX7) or preset buttons are complementary, not replacements.

## What Was Done (Session 2026-04-03)

### Completed
- 22 new Pixi layout descriptors (MdaEPiano, MdaJX10, MdaDX10, AMSynth, Raffo, CalfMono, SetBfree, SynthV1, Monique, VL1, TalNoizeMaker, Aeolus, FluidSynth, Sfizz, ZynAddSubFX, PinkTrombone, DECtalk, SAM, TR909, C64SID, V2Speech, Open303)
- TR808 registered (layout existed but wasn't in index)
- 8 new Pixi components (DX7PatchBrowser, TestKeyboard, PresetDropdown, DynamicParamPanel, HardwareUI, FilterCurve, ADSRVisualizer)
- Store dispatch fixes (volume, pan, lfo, pinkTrombone, dectalk wiring)
- Routing fixes (HivelySynth, SunVoxSynth, KlysSynth, Sc68Synth, etc.)
- DOM layout mode added (SynthTypeDispatcher 'layout' editor mode + DOMSynthPanel)
- DX7 Hardware/Simple toggle fixed (was in customHeaderControls which never rendered)
- DOM WAM subtype routing fix

### NOT Done — Requires Next Session
- **DX7 full parameter layout** — 155 VCED params need JS-level set/get via worklet messages. Currently only volume/bank/program are exposed. Needs:
  1. Add `setVcedParam(offset, value)` and `getVcedParam(offset)` to DX7Synth.ts
  2. Add worklet message handlers for individual VCED byte changes
  3. Build comprehensive layout with 6 operator tabs + global tab (155 knobs total)
  4. Wire layout keys to VCED byte offsets via the new API

- **Other synths missing parameters** — Verify EVERY layout descriptor covers ALL params from the engine config, not just "important" ones. Audit needed for:
  - CalfMono (52 params in engine, check layout has all)
  - SynthV1 (100 params — layout only shows Page 1, not Page 2)
  - Monique (100 params — layout only shows subset)
  - TalNoizeMaker (80 params — check all are in layout)
  - All other layouts need audit against actual engine config

- **Buzzmachine/MAME/VSTBridge/WAM** — PixiDynamicParamPanel discovers params at runtime but needs verification that it actually works end-to-end (engine not always ready when panel mounts)

## Key Files

| File | Purpose |
|------|---------|
| `src/pixi/views/instruments/layouts/index.ts` | Layout registry (136 entries) |
| `src/pixi/views/instruments/layouts/*.ts` | Individual layout descriptors |
| `src/pixi/views/instruments/PixiSynthPanel.tsx` | Pixi layout renderer |
| `src/components/instruments/controls/DOMSynthPanel.tsx` | DOM layout renderer |
| `src/pixi/views/instruments/PixiDynamicParamPanel.tsx` | Runtime param discovery |
| `src/pixi/views/instruments/PixiDX7PatchBrowser.tsx` | DX7 patch browser |
| `src/pixi/views/instruments/PixiHardwareUI.tsx` | WASM framebuffer embedding |
| `src/pixi/dialogs/PixiEditInstrumentModal.tsx` | Pixi modal routing |
| `src/components/instruments/editors/SynthTypeDispatcher.tsx` | DOM routing (3400+ lines) |
| `src/components/instruments/editors/UnifiedInstrumentEditor.tsx` | DOM entry point |
| `src/stores/useInstrumentStore.ts` | Store dispatch (volume/pan/lfo fixes) |

## DX7 Parameter Architecture

- 155-byte VCED format: 21 bytes/operator × 6 + 29 global bytes
- Dexed WASM UI has `_dexed_ui_set_param(paramId, value)` / `_dexed_ui_get_param(paramId)` (156 params)
- DX7Synth.ts only exposes volume/bank/program — NO per-VCED-byte access from JS
- Voice editing currently only works through the Dexed hardware UI
- Need to bridge: JS → worklet → WASM `_dexed_ui_set_param()` for individual params
- See `thoughts/shared/plans/2026-04-03-pixi-instrument-editor-parity.md` for full param table

## Next Steps (Priority Order)

1. Add per-parameter set/get to DX7Synth for all 155 VCED params
2. Build comprehensive DX7 layout (6 operator tabs × 21 params + global tab)
3. Audit ALL layout descriptors against engine configs for missing params
4. Expand any layouts that have param gaps
5. Test PixiDynamicParamPanel end-to-end for Buzz/MAME/VSTBridge/WAM
