# Vinyl Noise Effect — Design Document
_2026-02-19_

## Summary

Port the viator-rust vinyl noise plugin DSP to a pure TypeScript AudioWorklet effect, binary-compatible with the original C++ output. No WASM, no Emscripten. ~5KB total.

**Source:** `Reference Code/viator-rust-main/viator-rust/Source/PluginProcessor.cpp`
**License:** MIT (Landon Viator, 2023)

---

## DSP Architecture (matches viator-rust 1:1)

### Signal Chain

```
Input signal
  │
  ├──[inputVolumeGain]──────────────────────────────────┐
  │                                                      │
  └──[synthesizeRandomCrackle]────────────────┐         │
       white noise                            │         │
         → hissLowpass (LR4 1000Hz)           │         │
         → hissSpeedFilter (LR4 60Hz)         │       noise
           → ×10, square, ×20                │        ↓
           → Ramper envelope (75ms fade-in)  │     [add or copy to buffer]
         → noiseLowpass (LR4 7000Hz) ×0.01  │         │
         → hissHighpass (LR4 100Hz)          │    [distortMidRange]
         → LFO modulate + mix               ─┘      bandpass (SVF 600Hz)
                                                       → atan() saturation
                                                       → mix wet/dry
                                                          │
                                                   [outputVolumeGain]
                                                          │
                                                        Output
```

### Filters

All LR filters are **4th-order Linkwitz-Riley** = two cascaded 2nd-order Butterworth biquads.

| Filter | Type | Cutoff |
|---|---|---|
| `_hissLowpassModule` | LR4 lowpass | 1000 Hz |
| `_hissSpeedFilterModule` | LR4 lowpass | 60 Hz (set in synthesize) |
| `_hissHighpassModule` | LR4 highpass | 100 Hz |
| `_noiseLowpassModule` | LR4 lowpass | 7000 Hz |
| `_bpFilterModule` | SVF bandpass | 600 Hz |

**Butterworth 2nd-order biquad coefficients (lowpass):**
```
wc = tan(π * fc / fs)
k  = 1 / (1 + √2·wc + wc²)
b0 = wc²·k,  b1 = 2·wc²·k,  b2 = wc²·k
a1 = 2·(wc² - 1)·k,  a2 = (1 - √2·wc + wc²)·k
```
For highpass, negate the b-coefficients: `b0 = k, b1 = -2k, b2 = k`.
LR4 = two cascaded instances of the same biquad.

**StateVariableTPTFilter (SVF) — exact TPT form:**
```
g  = tan(π·fc/fs)
R  = 1/(2·Q)   where Q from resonance param
a1 = 1/(1 + 2R·g + g²)
a2 = 2R + g  (not a coefficient, a scratch value)

Per sample (state: s1, s2):
  hp = (x - a2·s1 - s2) · a1
  bp = g·hp + s1
  s1 = 2·g·hp + s1  (update)
  lp = g·bp + s2
  s2 = 2·g·bp + s2  (update)
  output = bp
```
Resonance → Q mapping (from `updateParameters()`):
```
resonance = jmap(driveDB, 0, 30, 0.05, 0.95)  →  Q = 1/(2·resonance)
```

### Ramper (exact port from PluginProcessor.h)
```js
class Ramper {
  setTarget(currentValue, newTarget, numSteps) {
    this.stepDelta = (newTarget - currentValue) / numSteps;
    this.targetValue = newTarget;
  }
  ramp(ref) {           // ref = Float32Array(1)
    ref[0] += this.stepDelta;
    return Math.abs(this.targetValue - ref[0]) > 0.001;  // true = still ramping
  }
}
```

### synthesizeRandomCrackle (exact port)
```
hissGain = dBToGain(hissVolume + 5.0)
dustGain = dBToGain(dustVolume - 6.0)
hissSpeedFilter.setCutoff(60.0)  // always 60Hz

per sample:
  noise = (random() * 2 - 1) * 0.1
  filteredNoise = hissLowpass.process(noise)
  noiseSpeed = hissSpeedFilter.process(filteredNoise) * 10
  noiseSpeed = noiseSpeed * noiseSpeed * 20
  signal = noiseSpeed

  if rampedValue >= 1.0:
    ramper.setTarget(0.96, 1.0, sampleRate * 0.003)
    rampedValue = 0.0
  else:
    signal *= rampedValue

  ramper.ramp(rampedRef)   // advance ramp one step
  rampedValue = rampedRef[0]

  if rampedValue < 1.0:
    hiss = noiseLowpass.process(noise) * 0.01
    dust = hissHighpass.process(signal)
    lfoOut = sin(lfoPhase)   // lfoPhase += 2π·lfoFreq/sr per sample
    lfoFreq = random() * vinylLFO  // matches: _vinylLFO.setFrequency(_noise.nextFloat() * lfo)
    if lfoFreq > 0:
      output = hiss * hissGain * lfoOut + dust * dustGain
    else:
      output = hiss * hissGain + dust * dustGain
```

### distortMidRange (exact port)
```
drive   = dBToGain(driveDB)           // driveDB = age * 30
mix     = driveDB / 30
comp_dB = mix * -6                    // jmap(driveDB, 0,30, 0,-6)

per sample:
  mid  = bpFilter.process(x)
  rest = x - mid
  distMid  = (2/π) * atan(mid * drive)
  compMid  = distMid * dBToGain(comp_dB)
  output   = (1 - mix) * rest + compMid * mix
```

---

## Parameters

| Param | UI Range | Internal | Viator mapping |
|---|---|---|---|
| `hiss` | 0–100 | 0–1 | hissVolume = (v * 60) - 30 dB |
| `dust` | 0–100 | 0–1 | dustVolume = (v * 60) - 30 dB |
| `age` | 0–100 | 0–1 | driveDB = v * 30 |
| `speed` | 0–100 | 0–1 | vinylLFO = v * 10 Hz |
| `wet` | 0–100 | 0–1 | dry/wet mix |

Defaults: hiss=50, dust=50, age=50, speed=20, wet=100 (100% wet, adds noise on top)

---

## Architecture

### Source mode

Like viator-rust, `sourceMode=true` (default) **adds** noise to input signal.
`sourceMode=false` **replaces** output with noise only (generator mode).
Exposed in DEViLBOX as a toggle: "Add to signal" vs "Generate only".

### Files

| File | Action |
|---|---|
| `public/vinylnoise/VinylNoise.worklet.js` | New — AudioWorkletProcessor with full DSP |
| `src/engine/effects/VinylNoiseEffect.ts` | New — Tone.js wrapper (like MVerbEffect) |
| `src/types/instrument.ts` | Add `'VinylNoise'` to `AudioEffectType` |
| `src/engine/InstrumentFactory.ts` | Add `getDefaultEffectParameters` + `createEffect` case |
| `src/engine/ToneEngine.ts` | Import + add `updateEffectNode` case |
| `src/components/effects/VisualEffectEditors.tsx` | Add `VinylNoiseEditor`, color, icon, registry entry |
| `src/components/instruments/shared/EffectChain.tsx` | Add `'VinylNoise'` to `AVAILABLE_EFFECTS` |
| `src/constants/unifiedEffects.ts` | Add VinylNoise entry to effect library |

### VinylNoiseEffect.ts (wrapper pattern)

Follows `MVerbEffect.ts` exactly:
- Loads worklet from `public/vinylnoise/VinylNoise.worklet.js`
- Registers worklet only once per AudioContext (static set)
- Creates `AudioWorkletNode('vinyl-noise-processor')`
- Exposes setters: `setHiss()`, `setDust()`, `setAge()`, `setSpeed()`, `set wet`
- Dry/wet: same pattern as MVerbEffect (Tone.Gain dryGain + wetGain)

### VinylNoise.worklet.js

Pure JS AudioWorkletProcessor. No WASM. No external dependencies. All DSP in-process:
- Implements `Ramper`, `BiquadFilter`, `LR4Filter`, `TPTSVFilter` classes
- Implements `synthesizeRandomCrackle()` and `distortMidRange()`
- Handles `parameter` messages: `{ type: 'parameter', param: 'hiss', value: 0.5 }`
- Stereo output (same signal on both channels, matching viator-rust mono output)

---

## UI

**Colors:** Dark brown/amber — `bg: '#1a1008', accent: '#d97706'` (worn vinyl aesthetic)
**Icon:** `Disc` from lucide-react
**Editor knobs:** Hiss · Dust · Age · Speed (+ wet slider from common EffectParameterEditor)
**Toggle:** "Add" / "Generate" for source mode

---

## Testing

1. Load any instrument with audio, add VinylNoise effect
2. Verify hiss (high-freq tape noise) audible at hiss > 0
3. Verify crackle/pops audible at dust > 0
4. Verify age knob adds mid-range warmth/distortion
5. Verify speed modulates crackle rate
6. Verify wet=0 passes audio through cleanly
7. Compare against viator-rust plugin in a DAW on same audio — should be perceptually identical
