---
date: 2026-04-18
topic: drumpad-silent-after-default-fx
tags: [drumpad, audio, fx-chain, sound-system, bug]
status: draft
---

# Drumpads silent after applying default Sound System FX chain

## Task

User asked for the "awesome Jamaican sound system echo" (tape saturation + RE-201
Space Echo + spring tank) to be restored as the default FX chain for every drumpad.
After wiring it up, loading a sample onto a pad produces **silence** — the sample
never reaches the master output. Reverting the auto-include on `createEmptyPad`
and applying the chain only in `loadSampleToPad` did NOT fix it.

**Nothing we tried made a new sample play through the chain.** The issue is
somewhere in how `DrumPadEngine.ensurePadEffectsChain` / `createEffectChain`
builds the effect chain for sample-based pads (the synth path through
`ToneEngine.buildInstrumentEffectChain` does build successfully — see console
log below).

## Critical References

### Files touched this session
- `src/types/drumpad.ts:212` — `createDefaultPadFX()` — the new 4-effect chain
  (EQ3 → TapeSaturation → SpaceEcho → SpringReverb). Values are tuned for
  ~6s audible echo tail (`intensity 0.78` at `rate 375ms`).
- `src/types/drumpad.ts:149` — `createEmptyPad()` — **reverted** to not include
  effects by default (auto-include caused first-trigger race).
- `src/stores/useDrumPadStore.ts:loadSampleToPad` — applies `createDefaultPadFX()`
  only when loading a sample into a pad with no existing effects.
- `src/stores/useDrumPadStore.ts:115` — `DRUMPAD_SCHEMA_VERSION` bumped 20 → 21
  to discard stale IndexedDB data from the previous auto-include attempt.

### Audio routing references (where the silence happens)
- `src/engine/drumpad/DrumPadEngine.ts:83` — `ensurePadEffectsChain(pad)`.
  Async-builds the chain: `inputGain → effect[0] → ... → effect[N] → outputGain → outputBus`.
  `outputGain.connect(outputBus)` at line 102 (fires BEFORE the async
  `createEffectChain` resolves). `this.padEffects.set(pad.id, chain)` at line 127.
- `src/engine/drumpad/DrumPadEngine.ts:303-322` — `triggerPad` chooses between
  `effectsChain.inputGain` and `outputBus`. Lazily builds chain on first trigger
  if pad has effects but no chain yet — means first trigger is always dry.
- `src/engine/factories/EffectFactory.ts:187` — `createEffectChain(effects)`.
- `src/engine/factories/EffectFactory.ts:195` — `createEffect(config)`. Uses
  `EffectRegistry.ensure(config.type)` then wraps with `applyGainCompensation`
  (lines 203–229). **Suspicious**: `applyGainCompensation` overrides `output`
  via `Object.defineProperty` after wiring. This may fool the subsequent
  `Tone.connect(last, outputGain)` in DrumPadEngine.
- `src/engine/registry/effects/tonejs.ts:247` — SpaceEcho registration.
- `src/engine/registry/effects/wasm.ts:79` — SpringReverb (dynamic import).

### Non-drumpad path that DOES work with the same 4 effects
- `src/engine/tone/InstrumentEffectsChain.ts` — synth-pad effect builder.
  Console at page load shows successful build:
  ```
  [ToneEngine] buildInstrumentEffectChain called for key: -1017970689 effects: 4 isNative: false
  [ToneEngine] buildInstrumentEffectChain: creating 4 effect nodes
  [ToneEngine] buildInstrumentEffectChain: created 4 effect nodes
  [ToneEngine] buildInstrumentEffectChain: connecting Tone.js instrument to first effect
  [ToneEngine] buildInstrumentEffectChain: connecting last effect to output
  [ToneEngine] buildInstrumentEffectChain: connecting output to destination (native: false )
  [ToneEngine] buildInstrumentEffectChain: chain built and stored for key -1017970689
  ```
  → Diff the wiring with `DrumPadEngine.ensurePadEffectsChain`. The two builders
  handle the `applyGainCompensation` wrapper differently. That's probably where
  the silence originates.

## Recent Changes (this session)

1. **Reggae Soundsystem preset + default pad FX tail** restored to long 6s echo
   (`intensity 0.78`, `echoVolume 0.55–0.60`).
2. **Sound System default FX chain** (`createDefaultPadFX`) rewritten to include
   TapeSaturation and Spring Reverb between EQ and Space Echo.
3. Tried `effects: createDefaultPadFX()` inside `createEmptyPad` — caused silence
   or dry-only output. Reverted.
4. Moved the auto-apply to `loadSampleToPad` (only when the pad has no existing
   effects) — still silent.
5. Bumped `DRUMPAD_SCHEMA_VERSION` 20 → 21.

## Learnings & Gotchas

- **Schema bump wipes pad data.** `DRUMPAD_SCHEMA_VERSION = 21`. First load after
  the bump clears 8-program state from IndexedDB. Confirmed in console:
  `[DrumPadStore] Loaded 8 programs from IndexedDB` after reload.
- **`applyGainCompensation` uses `Object.defineProperty(wrapper, 'output', ...)`** —
  this rewrites the `output` property AFTER `wrapper.connect(effectNode)` already
  connected. If `Tone.connect(wrapper, next)` uses the new `output` rather than
  an internal `_output`, it may end up disconnected from the signal flow.
  Worth a focused test.
- **First-trigger race**: `triggerPad` routes to `outputBus` when chain isn't
  built yet AND kicks off the async build. Subsequent triggers route through
  the chain. If the chain has any silence-producing bug, first trigger is dry
  (audible) and subsequent triggers are silent — this matches the user's
  reported behavior partly, but they report the FIRST hit is silent too.
- **SpaceEcho `bpmSync: 1`** — numeric 1 is used throughout `sampleFxPresets.ts`
  and `djOneShotPresets.ts`, so that's correct. Not the cause.

## Artifacts

No plan/research doc for this one — it was iterative fix-and-test.

Uncommitted work on these files:
- `src/types/drumpad.ts`
- `src/stores/useDrumPadStore.ts`
- `src/constants/sampleFxPresets.ts`
- `src/components/drumpad/PadButton.tsx`, `PadEditor.tsx`, `PadGrid.tsx`
  (unrelated context-menu and effects-UI fixes from earlier in the session)
- `src/engine/dj/DeckEngine.ts`, `src/engine/keyboard/commands/djScratch.ts`
  (unrelated scratch-preset fixes — Crab silent, Orbit pitched-down)
- `src/components/tracker/FT2Toolbar/FT2Toolbar.tsx`, `src/components/ui/Modal.tsx`,
  `src/components/dj/DJPlaylistModal.tsx`, `src/constants/synthPresets/dubSiren.ts`
  (various earlier fixes)

## Next Steps (ordered)

1. **Reproduce directly.** `npm run dev`, open the Drum Pads view, load any sample
   onto pad 1. Expected: audible kick with tape echo. Actual: silence.
2. **Add a diagnostic log at `DrumPadEngine.ensurePadEffectsChain`** right after
   the successful `Tone.connect(last, outputGain)` call. Log the actual
   underlying native node chain (walk the nodes via `_output`, `_input`,
   `.context`, etc.) and confirm there's a continuous path from `inputGain` to
   `outputBus`. This is the fastest way to see whether the issue is signal
   flow or something else (e.g., `outputGain` or `outputBus` gain at 0).
3. **Compare with `InstrumentEffectsChain`.** It builds the *same 4 effects*
   without silencing anything. Diff its wiring logic against
   `DrumPadEngine.ensurePadEffectsChain` — start with how each handles the
   `applyGainCompensation` wrapper's re-defined `output` property.
4. **Strip effects one at a time** to isolate: try the chain with only EQ3
   (should be audible and nearly transparent). Add TapeSaturation — still audible?
   Add SpaceEcho — still audible? Add SpringReverb — still audible? The first
   effect that silences the chain is the culprit. SpringReverb is the most
   suspicious because it's a WASM effect with async loading.
5. **Check if `applyGainCompensation`'s `scaledDb * wetValue` ever collapses
   to `-Infinity`.** For `wet = 0`, `dbToGain(compensationDb * 0) = dbToGain(0) = 1`,
   fine. But for huge `GAIN_COMPENSATION_DB[effectType]` negative values with
   `wet = 1`, could produce a very small linear gain — might look silent.
6. **If time-pressed, gate the feature behind a user-triggered "Apply Sound
   System FX" action** and ship the rest of the session's fixes without this
   auto-apply. The 6-second echo restoration for the `Reggae Soundsystem`
   preset (`sampleFxPresets.ts`) still works via the preset dropdown.

## Other Notes

- `CLAUDE.md` says: always fix root cause, never workaround. Don't band-aid this
  with "disable FX on sample load" — find and fix the silencing bug first.
- User's live gig is 2026-04-18 (today). Do not merge this to `main` until the
  silence is resolved.
