# Tumult Effect — Design Document
**Date:** 2026-02-19
**Status:** Approved

## Overview

Port the [Tumult](https://github.com/Mrugalla/Tumult) HISE noise/ambience generator to DEViLBOX as a
first-class AudioWorklet effect plugin using the EffectDescriptor/EffectRegistry SDK.

Tumult is a **noise adder**, not a signal processor. The dry audio path passes through completely
unmodified. The effect generates or plays back noise, shapes it with a 5-band SVF parametric EQ and
an arctan waveshaper/clipper, optionally gates it via Duck or Follow (envelope follower on the dry
signal), and mixes it with the dry signal.

---

## Source of Truth

All DSP is ported 1:1 from the compiled Faust C++ and SNEX sources in:

```
Reference Code/Tumult-master/DspNetworks/ThirdParty/src/
  noise.cpp       — 5 noise modes (Faust-compiled)
  svf_hp.cpp      — High-pass SVF filter (Faust-compiled)
  svf_lp.cpp      — Low-pass SVF filter (Faust-compiled)
  svf_peak.cpp    — Bell/peak SVF filter (Faust-compiled)
  svf_ls.cpp      — Low shelf SVF filter (Faust-compiled)
  svf_hs.cpp      — High shelf SVF filter (Faust-compiled)

Reference Code/Tumult-master/DspNetworks/CodeLibrary/snex_shaper/
  hardSoftClipper.h   — Arctan waveshaper (SNEX)

Reference Code/Tumult-master/Scripts/ScriptProcessors/tumult/
  Interface.js    — All UI parameters, defaults, sample lists
```

**Rule: no approximations, no guesses. Every algorithm must trace back to one of the above files.**

---

## Architecture

### Files to Create

| File | Role |
|------|------|
| `public/tumult/Tumult.worklet.js` | All DSP: noise gen, envelope follower, 5-band SVF EQ, arctan clipper, gain/mix |
| `public/tumult/samples/` | All 95 WAV files copied verbatim from reference repo |
| `src/engine/effects/TumultEffect.ts` | Tone.js ToneAudioNode wrapper: sample loading, worklet lifecycle |
| `src/engine/registry/effects/native.ts` | EffectDescriptor registration (add to existing file) |
| `src/types/instrument.ts` | Add `'Tumult'` to `AudioEffectType` union |
| `src/constants/unifiedEffects.ts` | Add Tumult entry for effect browser |
| `src/components/effects/VisualEffectEditors.tsx` | `TumultEditor` React component |

Reference implementation pattern: `VinylNoiseEffect.ts` / `VinylNoise.worklet.js`.

### Signal Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Tumult.worklet.js                               │
│                                                                          │
│  inputs[0] (track audio) ──► envelope follower ─► duck/follow gate ─┐   │
│                           └──────────────────────────────────────────┼──►│ dry out
│                                                                       │   │
│  noise generator ─────────────────────────────────────────────┐      │   │
│  OR sample (decoded AudioBuffer, sent as inputs[1])           │      │   │
│                                                               ▼      │   │
│                                              gate ─► noiseGain ─► clipper ─► 5-band EQ ─► mix ─► output
└─────────────────────────────────────────────────────────────────────────┘
```

Worklet receives `inputs[0]` (track audio) for the envelope follower sidechain.
Decoded sample AudioBuffer data is transferred to the worklet via `postMessage` with `Transferable`.

---

## DSP — Noise Generator (1:1 from noise.cpp)

All 5 modes share a single Linear Congruential Generator (ANSI C `rand()`):

```js
iRec0 = (Math.imul(1103515245, iRec0) + 12345) | 0;
white = 4.656613e-10 * iRec0;
```

### Mode 0 — White
Output: `white`

### Mode 1 — Pink (no.pink_noise × 10)
```js
// 3rd-order IIR from noise.cpp line 635
fRec1[0] = 0.5221894*fRec1[3] + white + 2.494956*fRec1[1] - 2.0172658*fRec1[2];
out = 10 * (0.049922034*fRec1[0] + 0.0506127*fRec1[2]
          - 0.095993534*fRec1[1] - 0.004408786*fRec1[3]);
// shift: fRec1[3]=fRec1[2]; fRec1[2]=fRec1[1]; fRec1[1]=fRec1[0];
```

### Mode 2 — Brown (no.colored_noise(12, −1.6))
DC-blocked white noise passes through 12 cascaded first-order IIR stages (fRec2–fRec13).
The DC blocker (fRec14): `fRec14[0] = 0.995*fRec14[1] + white - white_prev`
Each stage follows: `fRecN[0] = -(1/D) * (coeff_a * fRecN[1] - coeff_b * (coeff_c * fRecN-1[0] + coeff_d * fRecN-1[1]))`
All 168 `fConst` values are ported exactly from `instanceConstants()` (lines 322–491 of noise.cpp).
Output: `clamp(fConst108 * fRec2[0], -1, 1)` where `fConst108 = 49.96747 * (fConst104 / fConst99)`.

### Mode 3 — Velvet (no.colored_noise(12, 0.5))
Identical 12-stage structure as Mode 2 but with different frequency constants (fRec15–fRec26).
Output: `clamp(fConst168 * fRec15[0], -1, 1)` where `fConst168 = 0.013842662 * (fConst104 / fConst163)`.

### Mode 4 — Crushed (no.lfnoiseN(0, SR/100))
NLF2 quadrature oscillator at `SR/100` Hz drives a sample-and-hold:
```js
// Angular freq = 2π/100 rad/sample → SR/100 Hz
fRec28[0] = 0.06279052*fRec29[1] + 0.9980267*fRec28[1];
fRec29[0] = (1 - iVec0_prev) + 0.9980267*fRec29[1] - 0.06279052*fRec28[1];
trigger = (fRec28_prev <= 0) && (fRec28[0] > 0);  // rising zero-crossing
fRec27[0] = trigger ? white : fRec27[1];           // sample and hold
out = fRec27[0];
```

---

## DSP — SVF Filters (1:1 from svf_*.cpp)

All five EQ bands use the Oleg Nesterov TPT state variable filter topology (Faust `fi.svf.*`).

### Core SVF State (per band, per channel)
```js
// s1, s2 = filter state (two integrators)
g  = Math.tan(Math.PI * freq / sampleRate);
k  = 1 / Q;
v1 = (x - s1*k - s2) / (1 + g*k + g*g);  // HP output
v2 = s1 + g*v1;                            // BP intermediate
lp = s2 + g*v2;                            // LP output
// Update state:
s1 = 2*v1 - s1_prev;  // wait: s1 = 2*(s1 + g*v1) - s1... no
```

Exact port from svf_lp.cpp (lines 130-143):
```js
g   = Math.tan(fConst3 * smoothedFreq);    // fConst3 = π/SR
den = g * (g + 1/smoothedQ) + 1;
t   = s1 + g * (x - s2);
v1  = t / den;
s1  = 2*v1 - s1;
t2  = s2 + g*t/den;
s2  = 2*t2 - s2;
lp  = t2;    // LP output
hp  = x - t2 - t/den/smoothedQ;  // HP output (from svf_hp.cpp)
```

Parameters are smoothed with a one-pole IIR: `fConst2 = exp(-2π × 10 / SR)` (10 Hz cutoff).

### Bell Filter (svf_peak.cpp)
Proportional-Q bell using amplitude gain `A = 10^(gainDb/40)`:
```js
A     = Math.pow(10, gainDb / 40);
g     = Math.tan(Math.PI * freq / SR);
k     = 1 / (Q * A);
// Standard SVF solve for v1, v2, LP...
bp    = v1 * g;  // bandpass
out   = x + bp * (A*A - 1) * Q * A;
```
(Exact coefficients from svf_peak.cpp instanceConstants)

### Low Shelf (svf_ls.cpp)
`A = 10^(gainDb/40)`, `g_eff = tan(π·freq/SR) / sqrt(A)`
Output = `A² * lp + A * bp * (1 - 1/A²)/Q_eff + hp`

### High Shelf (svf_hs.cpp)
`A = 10^(gainDb/40)`, `g_eff = tan(π·freq/SR) * sqrt(A)`
Output = `A * (A*hp + bp*(1-A)/Q_eff + lp*(1-A²))`

Frequency and Q parameters are smoothed using the same 10 Hz one-pole IIR in all filter types.

---

## DSP — Clipper (1:1 from hardSoftClipper.h)

```js
function clipSample(x, amount) {
  // amount: 0.05–1.0. At 1.0 = soft arctan; at 0.05 = near-hard clip.
  return Math.sign(x) * Math.pow(Math.atan(Math.pow(Math.abs(x), 1 / amount)), amount);
}
```

Applied to the noise signal before the EQ. Default `amount` = 0.497.

---

## DSP — Envelope Follower / Gate

The Duck and Follow modes use a simple AR envelope follower on `inputs[0]` (track audio).

```js
// Per-sample RMS envelope follower
level = Math.max(Math.abs(inputSample), level * release + (1 - release) * Math.abs(inputSample));
// Threshold comparison → gate signal 0..1
gate  = level > threshold ? 1 : 0;
// AR smoothing on gate signal
smoothedGate = gate > smoothedGate
  ? smoothedGate + (gate - smoothedGate) * attackCoeff
  : smoothedGate + (gate - smoothedGate) * releaseCoeff;
```

Attack/release coefficients: `coeff = 1 - exp(-1 / (ms * SR / 1000))`.

**Duck**: noise amplitude = `(1 - smoothedGate * followAmount)` — noise fades when signal is loud.
**Follow**: noise amplitude = `smoothedGate * followAmount` — noise plays when signal is present.
**Raw**: noise amplitude = 1 (gate bypassed).

---

## Parameters (Complete)

All values stored as-is (no 0–1 normalization). The worklet receives them directly.

| ID | Type | Range | Default | Notes |
|----|------|-------|---------|-------|
| `noiseGain` | float | -35 – +35 dB | -10.6 | Master noise volume (dB → linear in worklet) |
| `mix` | float | 0 – 1 | 1.0 | Dry/wet blend |
| `noiseMode` | int | 0 – 4 | 0 | 0=white 1=pink 2=brown 3=velvet 4=crushed |
| `sourceMode` | int | 0 – 3 | 0 | 0=off 1=generated 2=sampled 3=custom |
| `switchBranch` | int | 0 – 2 | 1 | 0=duck 1=follow 2=raw |
| `duckThreshold` | float | -100 – 0 dB | -17.2 | Duck gate threshold |
| `duckAttack` | float | 0 – 500 ms | 0.0 | Duck gate attack |
| `duckRelease` | float | 0 – 500 ms | 21.5 | Duck gate release |
| `followThreshold` | float | -100 – 0 dB | -10.7 | Follow gate threshold |
| `followAttack` | float | 0 – 500 ms | 0.0 | Follow gate attack |
| `followRelease` | float | 0 – 500 ms | 76.9 | Follow gate release |
| `followAmount` | float | 0 – 1 | 0.104 | Gate modulation depth |
| `clipAmount` | float | 0.05 – 1.0 | 0.497 | Clipper softness (1=soft, 0.05=hard) |
| `hpEnable` | int | 0 / 1 | 0 | HP band bypass |
| `hpFreq` | float | 20 – 20000 Hz | 888.5 | HP cutoff |
| `hpQ` | float | 0.7 – 10 | 0.7 | HP Q |
| `peak1Enable` | int | 0 / 1 | 1 | Band 2 bypass |
| `peak1Type` | int | 0 / 1 | 0 | 0=bell 1=low shelf |
| `peak1Freq` | float | 20 – 20000 Hz | 20.0 | Band 2 frequency |
| `peak1Gain` | float | -24 – +24 dB | -0.19 | Band 2 gain |
| `peak1Q` | float | 0.7 – 10 | 0.7 | Band 2 Q |
| `peak2Enable` | int | 0 / 1 | 1 | Band 3 bypass |
| `peak2Freq` | float | 20 – 20000 Hz | 600.0 | Band 3 frequency |
| `peak2Gain` | float | -24 – +24 dB | 1.0 | Band 3 gain |
| `peak2Q` | float | 0.7 – 10 | 1.0 | Band 3 Q (0–1 UI → 0.7–10 internal) |
| `peak3Enable` | int | 0 / 1 | 0 | Band 4 bypass |
| `peak3Type` | int | 0 / 1 | 1 | 0=bell 1=high shelf |
| `peak3Freq` | float | 20 – 20000 Hz | 2500.0 | Band 4 frequency |
| `peak3Gain` | float | -24 – +24 dB | 1.0 | Band 4 gain |
| `peak3Q` | float | 0.7 – 10 | 1.0 | Band 4 Q |
| `lpEnable` | int | 0 / 1 | 0 | LP band bypass |
| `lpFreq` | float | 20 – 20000 Hz | 8500.0 | LP cutoff |
| `lpQ` | float | 0.7 – 10 | 0.7 | LP Q |
| `sampleIndex` | int | 0 – 94 | 0 | Index into sample list (sourceMode=2) |
| `playerStart` | float | 0 – 1 | 0.0 | Custom loop start (sourceMode=3) |
| `playerEnd` | float | 0 – 1 | 1.0 | Custom loop end (sourceMode=3) |
| `playerFade` | float | 0 – 1 | 0.01 | Custom loop crossfade |
| `playerGain` | float | -30 – +30 dB | 0.0 | Custom sample gain |

---

## Sample List (95 files)

**Generated (no files):** white, pink, brown, velvet, crushed

**Sampled (95 WAV files):**

| Category | Files | Count |
|----------|-------|-------|
| hum | hum_01–05.wav | 5 |
| machine | machine_01–11.wav | 11 |
| static | static_01–06.wav | 6 |
| vinyl | vinyl_01–05.wav | 5 |
| world | world_01–18.wav | 18 |
| noiseplethora_a | np_a_01–17.wav | 17 |
| noiseplethora_b | np_b_01–10.wav | 10 |
| noiseplethora_c | np_c_01–23.wav | 23 |

All files served from `public/tumult/samples/` and loaded/decoded in `TumultEffect.ts` on first use.

---

## UI Design (TumultEditor)

Three-section layout following existing DEViLBOX effect editor patterns.

### Section 1 — Source

- **Source tabs**: Off / Generated / Sampled / Custom (maps to `sourceMode` 0–3)
- **When Generated**: Noise type selector row (White / Pink / Brown / Velvet / Crushed)
- **When Sampled**: Category + sample picker (grouped dropdown or scrollable list)
- **When Custom**: File drop zone + `playerStart`, `playerEnd`, `playerFade`, `playerGain` knobs

### Section 2 — Master Controls

- `noiseGain` knob (dB display, -35 to +35)
- `mix` knob
- Combined Duck/Follow/Raw selector:
  - Switch3Way: Duck | Raw | Follow (maps to `switchBranch`)
  - When Duck: `duckThreshold`, `duckAttack`, `duckRelease` knobs (shown)
  - When Follow: `followThreshold`, `followAttack`, `followRelease`, `followAmount` knobs (shown)
  - When Raw: no extra knobs
- `clipAmount` knob (0.05–1.0, labeled "Clip")

### Section 3 — 5-Band EQ

Five bands laid out horizontally:

| Band | Label | Enable | Type Switch | Controls |
|------|-------|--------|-------------|----------|
| 1 | HP | toggle | — | Freq, Q |
| 2 | Low | toggle | Bell / Low Shelf | Freq, Gain, Q |
| 3 | Mid | toggle | — | Freq, Gain, Q |
| 4 | High | toggle | Bell / High Shelf | Freq, Gain, Q |
| 5 | LP | toggle | — | Freq, Q |

No spectrum analyzer in v1 (scope creep, deferred).

---

## Integration Checklist

1. Add `'Tumult'` to `AudioEffectType` in `src/types/instrument.ts`
2. Add entry to `src/constants/unifiedEffects.ts` (category: `'native'`, group: `'Noise & Texture'`)
3. Create `src/engine/effects/TumultEffect.ts` (ToneAudioNode wrapper)
4. Create `public/tumult/Tumult.worklet.js` (all DSP)
5. Copy 95 WAV files to `public/tumult/samples/`
6. Add EffectDescriptor to `src/engine/registry/effects/native.ts` (or new `tumult.ts`)
7. Add `TumultEditor` component to `src/components/effects/VisualEffectEditors.tsx`
8. Wire into effect chain browser if needed (`EffectChain.tsx`)

---

## Non-Goals (v1)

- Spectrum analyzer (FFT display behind EQ)
- Live gate waveform display (HISE display ring buffer equivalent)
- Custom sample import UI (sourceMode=3 params exist but UI is not built)
- Streaming / host-sync settings panel
