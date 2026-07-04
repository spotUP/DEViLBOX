---
date: 2026-04-12
topic: buzz-effects-param-fix-and-effect-presets
tags: [buzzmachine, effects, presets, wasm, handoff]
status: final
---

# Handoff: Buzz Effects Params + Effect Presets System

## Tasks Completed

### Effect Presets System (DONE - working)
- `EffectPreset` type added to `src/types/instrument/effects.ts`
- `presets` field on `EffectDescriptor` + `getPresets()` on `EffectRegistry`
- `src/lib/effectPresetStorage.ts` — localStorage CRUD for user presets
- `src/components/effects/editors/EffectPresetSelector.tsx` — dropdown UI (factory + user)
- Injected into `VisualEffectEditorWrapper` header in `editors/index.tsx`
- `onUpdateParameters` batch callback wired to all 3 modal call sites (Master, Channel, Instrument)
- Factory presets: 30 Tone.js + 76 WASM + 24 Buzzmachine + Neural schema presets
- Old `effectPresets.ts` and `EffectPresetDropdown.tsx` deleted
- Audit fixes: NoiseGate range values, 6 duplicate presets

### TapeDelay Effect (DONE - working)
- `public/tapedelay/TapeDelay.worklet.js` — AudioWorklet with interpolated delay, feedback, wow/flutter, saturation, tone filter
- `src/engine/effects/TapeDelayEffect.ts` — Tone.js node wrapper
- Registered in `wasm.ts` with 5 factory presets
- Added to `unifiedEffects.ts`, `ENCLOSURE_COLORS`, `EffectParameterEngine`
- Ported from cyrusasfa/TapeDelay (MIT)

### Aelapse Springs Overlay Position (DONE)
- `src/components/effects/hardware/AelapseHardwareUI.tsx` — left=555/720, top=62/400

### Vite EMFILE Fix
- `vite.config.ts` — `ignored: ['**/*']` disables all file watching (HMR was already off)
- `dev.sh` — added `ulimit -n 65536` at top
- User may need `sudo launchctl limit maxfiles 65536 200000` on macOS

### Buzzmachine Parameter Metadata (DONE but params don't work yet)
- All 21 effect machines in `BUZZMACHINE_INFO` now have full parameter arrays with `byteOffset` and `isTrack` fields
- `BuzzmachineParameter` interface extended with `byteOffset: number` and `isTrack?: boolean`
- Engine sends `paramLayout` array to worklet at init
- C++ `buzz_set_parameter()` implemented in `BuzzmachineWrapper.cpp` — walks CMachineInfo to compute byte offset and write correct byte/word
- All 35 WASM modules rebuilt with new C++ wrapper

## Buzzmachine Issues (UNRESOLVED - needs dedicated session)

### Bug 1: BuzzmachineSynth kills audio when added as master effect
**Symptom:** Audio amplitude drops to 0.0000 the instant a BuzzDistortion is added to the master chain. Never recovers.

**Root cause:** `ChannelRoutedEffects.ts:121` crashes with `effectNodes[...].connect is not a function`. BuzzmachineSynth implements `DevilboxSynth` (with `input`/`output` GainNodes) but does NOT extend `ToneAudioNode` and does NOT have a `.connect()` method. When the effect has `selectedChannels` set, `ChannelRoutedEffects.rebuild()` tries to call `.connect()` on the BuzzmachineSynth node, crashes, and the isolated audio goes nowhere.

**Evidence:**
```
[MasterEffectsChain] ⚡ Chain connected: BuzzDistortion | nodes: BuzzmachineSynth
[TrackerAudioCapture] Capturing... 163840 samples, max amplitude: 0.5410  ← audio present
[TrackerAudioCapture] Capturing... 245760 samples, max amplitude: 0.0000  ← audio GONE
[MixerStore] Failed to rebuild WASM per-channel effects: TypeError: effectNodes[(effectNodes.length - 1)].connect is not a function
```

**Fix options:**
1. Add `.connect()` method to BuzzmachineSynth that delegates to `this.output.connect()`
2. Exclude Buzz effects from per-channel routing in ChannelRoutedEffects
3. Make BuzzmachineSynth extend ToneAudioNode like other WASM effects do

### Bug 2: Knobs don't audibly change the sound
**Symptom:** `EffectParameterEngine` sends params correctly (confirmed via debug logs), worklet's `_buzz_set_parameter` is called, but no audible change.

**What we tried:**
1. Direct gvals memory writes via `setValue` — values written correctly (readback confirmed), but machine doesn't respond
2. `_buzz_set_parameter` C++ implementation — walks CMachineInfo param table, computes byte offset, writes byte/word. Not yet verified to work because Bug 1 kills audio before we can test.

**Investigation notes:**
- `HEAPU8` is `undefined` on the Emscripten module (unusual). `setValue`/`getValue` work but may use a different memory view than WASM reads.
- The machine's constructor sets `GlobalVals = &gval;` (pointing to its own struct member). `buzz_get_global_vals` returns this pointer. Writes via `setValue` show correct readback, but Tick() doesn't seem to pick up changes.
- Need to verify: does `_buzz_set_parameter` (C++ side) actually modify the right memory? Add a C++ debug print to confirm the write lands.

### Bug 3: Some effects kill audio, others pass through unchanged
**Effects that kill audio:** OomekExciter, OomekMasterizer, DedaCodeStereoGain, FSMChorus2
**Effects that pass through:** GeonikCompressor, FSMChorus, WhiteNoiseWhiteChorus, ArguruDistortion

This may be pre-existing — these effects may have always been broken. The ones that "kill audio" might have broken Work() implementations or Init() failures. Needs individual testing with Bug 1 fixed first.

## Critical References

| File | Purpose |
|------|---------|
| `src/engine/buzzmachines/BuzzmachineWrapper.cpp:311` | `buzz_set_parameter` — C++ param writer |
| `public/Buzzmachine.worklet.js:1193` | `setParameter` — now calls `_buzz_set_parameter` |
| `src/engine/buzzmachines/BuzzmachineEngine.ts:85-760` | `BUZZMACHINE_INFO` — all param metadata with byteOffsets |
| `src/engine/buzzmachines/BuzzmachineSynth.ts:129` | `setParameter` — posts to worklet |
| `src/engine/tone/EffectParameterEngine.ts:1182-1213` | Buzz case handler — routes params |
| `src/engine/tone/ChannelRoutedEffects.ts:121` | CRASH SITE — `.connect()` call |
| `scripts/build-buzzmachines.sh` | Rebuild all 35 WASM modules |
| `third-party/buzzmachines-master/common/MachineInterface.h:412` | `GlobalVals` pointer definition |
| `third-party/buzzmachines-master/Arguru/Distortion/Distortion.cpp:163` | Reference Tick() implementation |

## Recent Changes (git log)

```
98b7167 fix: implement buzz_set_parameter in C++ + use it from worklet
265427a fix: Buzzmachine param byte offsets — use real struct layout from C++ sources
e02b3fd feat: populate parameter metadata for all 21 Buzzmachine effects
a0d29b7 fix: add TapeDelay to AVAILABLE_EFFECTS
aa3508f feat: TapeDelay effect — RE-201/Echoplex tape delay (AudioWorklet)
ac9ca26 fix: wire onUpdateParameters to all EffectParameterEditor call sites
7b53ff4 fix: preset selector falls back to per-param updates when batch unavailable
b6d5242 fix: audit fixes — NoiseGate range values, duplicate presets, springs position
8c08857 feat: factory presets for all 58 WASM effects
7503a19 feat: factory presets for Tone.js effects
99f1ae6 feat: factory presets for 23 Buzzmachine effects
181f0e7 feat: factory presets for Neural/GuitarML effects
4700b18 feat: EffectPresetSelector component + inject into editor wrapper
b531d25 feat: per-effect user preset localStorage storage
9602c3e feat: add EffectPreset type and presets field to EffectDescriptor
```

## Next Steps (ordered)

1. **Fix Bug 1 first** — BuzzmachineSynth needs `.connect()` or ChannelRoutedEffects needs to handle DevilboxSynth interface. This is blocking all Buzz effect testing.
2. **Verify buzz_set_parameter** — With audio flowing, test if C++ param writes actually affect the sound. Add a C++ `printf` in `buzz_set_parameter` to confirm the write.
3. **Test each effect individually** — Once params work, go through all 21 effects and categorize which ones actually process audio correctly.
4. **Remove debug logging** — `EffectParameterEngine.ts:1209` has a console.log for Buzz params. Remove after debugging.
5. **Consider reverting byteOffset complexity** — If `_buzz_set_parameter` C++ approach works, the JS-side `paramLayout`/`byteOffset` infrastructure is no longer needed. The C++ side handles byte/word sizing and offset calculation natively.
