# Vinyl Noise Effect — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a VinylNoise audio effect that synthesizes vinyl crackle and hiss in the browser, binary-compatible with the viator-rust JUCE plugin, using a pure JavaScript AudioWorkletProcessor (no WASM, no Emscripten).

**Architecture:** The DSP runs in `public/vinylnoise/VinylNoise.worklet.js` as an AudioWorkletProcessor. A Tone.js wrapper class `VinylNoiseEffect.ts` manages lifecycle, connects dry/wet routing, and forwards parameter messages. Wire-up follows the same pattern as `MVerbEffect.ts` but is simpler — no WASM loading, no fallback, the worklet is always ready immediately.

**Tech Stack:** Web Audio API AudioWorklet, Tone.js ToneAudioNode, TypeScript, React, Tailwind CSS, lucide-react.

**Reference:** `Reference Code/viator-rust-main/viator-rust/Source/PluginProcessor.cpp` + `.h` — read these before implementing the worklet DSP.

---

## Task 1: Create the AudioWorklet DSP file

**Files:**
- Create: `public/vinylnoise/VinylNoise.worklet.js`

This file contains the entire signal synthesis DSP, ported 1:1 from viator-rust. It has zero external dependencies and runs inside the AudioWorklet thread.

**Step 1: Create the worklet file**

```js
// public/vinylnoise/VinylNoise.worklet.js
// Vinyl noise synthesizer — ported from viator-rust (MIT, Landon Viator)
// All DSP classes are binary-compatible with the original C++ plugin.

// ─── Ramper (exact port from PluginProcessor.h) ──────────────────────────────
class Ramper {
  constructor() {
    this.targetValue = 0;
    this.stepDelta = 0;
  }
  /** currentValue, newTarget, numberOfSteps */
  setTarget(currentValue, newTarget, numSteps) {
    this.stepDelta = (newTarget - currentValue) / numSteps;
    this.targetValue = newTarget;
  }
  /** Advances ref[0] by stepDelta. Returns true while still ramping. */
  ramp(ref) {
    ref[0] += this.stepDelta;
    return Math.abs(this.targetValue - ref[0]) > 0.001;
  }
}

// ─── Biquad filter (direct form II transposed) ───────────────────────────────
class Biquad {
  constructor() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0;
    this.a1 = 0; this.a2 = 0;
    this.z1 = 0; this.z2 = 0;
  }
  process(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
  /** 2nd-order Butterworth lowpass */
  setLowpass(fc, sr) {
    const wc = Math.tan(Math.PI * fc / sr);
    const wc2 = wc * wc;
    const k = 1 / (1 + Math.SQRT2 * wc + wc2);
    this.b0 = wc2 * k; this.b1 = 2 * wc2 * k; this.b2 = wc2 * k;
    this.a1 = 2 * (wc2 - 1) * k; this.a2 = (1 - Math.SQRT2 * wc + wc2) * k;
  }
  /** 2nd-order Butterworth highpass */
  setHighpass(fc, sr) {
    const wc = Math.tan(Math.PI * fc / sr);
    const wc2 = wc * wc;
    const k = 1 / (1 + Math.SQRT2 * wc + wc2);
    this.b0 = k; this.b1 = -2 * k; this.b2 = k;
    this.a1 = 2 * (wc2 - 1) * k; this.a2 = (1 - Math.SQRT2 * wc + wc2) * k;
  }
  reset() { this.z1 = 0; this.z2 = 0; }
}

// ─── LR4 filter = two cascaded 2nd-order Butterworths ────────────────────────
// Matches juce::dsp::LinkwitzRileyFilter (4th-order, -24dB/oct)
class LR4Filter {
  constructor() { this.a = new Biquad(); this.b = new Biquad(); }
  setLowpass(fc, sr)  { this.a.setLowpass(fc, sr);  this.b.setLowpass(fc, sr);  }
  setHighpass(fc, sr) { this.a.setHighpass(fc, sr); this.b.setHighpass(fc, sr); }
  process(x) { return this.b.process(this.a.process(x)); }
  reset() { this.a.reset(); this.b.reset(); }
}

// ─── Topology-Preserving Transform State Variable Filter ─────────────────────
// Matches juce::dsp::StateVariableTPTFilter (bandpass mode)
class TPTSVFilter {
  constructor() {
    this.s1 = 0; this.s2 = 0;
    this.g = 0; this.R2 = 0; this.h = 0;
  }
  /** fc = cutoff Hz, Q = quality factor, sr = sample rate */
  setParams(fc, Q, sr) {
    this.g = Math.tan(Math.PI * fc / sr);
    this.R2 = 1 / Q;
    this.h = 1 / (1 + this.R2 * this.g + this.g * this.g);
  }
  processBandpass(x) {
    const { g, R2, h, s1, s2 } = this;
    const hp = (x - (R2 + g) * s1 - s2) * h;
    const bp = g * hp + s1;
    this.s1 = 2 * g * hp + s1;
    const lp = g * bp + s2;
    this.s2 = 2 * g * bp + s2;
    return bp;
  }
  reset() { this.s1 = 0; this.s2 = 0; }
}

// ─── Processor ───────────────────────────────────────────────────────────────
class VinylNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Parameters (0-1 normalized, internal)
    this._hissVolume = 0.5;  // maps to [-30, +30] dB
    this._dustVolume = 0.5;  // maps to [-30, +30] dB
    this._age        = 0.5;  // maps to [0, 30] dB drive
    this._speed      = 0.2;  // maps to [0, 10] Hz LFO freq
    this._sourceMode = true; // true=add to input, false=replace

    // ─── Crackle synthesis state ─────────────────────────────────────────────
    this._hissLowpass     = new LR4Filter();  // 1000 Hz LP for noise before speed filter
    this._hissSpeedFilter = new LR4Filter();  // 60 Hz LP — slow modulation gate
    this._hissHighpass    = new LR4Filter();  // 100 Hz HP — dust output filter
    this._noiseLowpass    = new LR4Filter();  // 7000 Hz LP — hiss output filter
    this._ramper          = new Ramper();
    this._rampRef         = new Float32Array(1); // pass-by-ref substitute
    this._rampedValue     = 0.0;
    this._lfoPhase        = 0.0;

    // ─── Age (mid distortion) state ──────────────────────────────────────────
    this._bpFilter = new TPTSVFilter();       // 600 Hz BP — mid-range selector

    this._initFilters();

    this.port.onmessage = (e) => this._handleMessage(e.data);

    // Signal to host that we are ready immediately
    this.port.postMessage({ type: 'ready' });
  }

  _initFilters() {
    const sr = sampleRate;
    this._hissLowpass.setLowpass(1000, sr);
    this._hissSpeedFilter.setLowpass(60, sr);
    this._hissHighpass.setHighpass(100, sr);
    this._noiseLowpass.setLowpass(7000, sr);
    this._updateBpFilter();
  }

  _updateBpFilter() {
    // Resonance mapped from age: jmap(driveDB, 0,30, 0.05,0.95)
    const driveDB = this._age * 30;
    const reso = 0.05 + (driveDB / 30) * 0.9;  // 0.05..0.95
    const Q = 1 / (2 * reso);
    this._bpFilter.setParams(600, Q, sampleRate);
  }

  _handleMessage(data) {
    switch (data.param) {
      case 'hiss':    this._hissVolume = data.value; break;
      case 'dust':    this._dustVolume = data.value; break;
      case 'age':     this._age = data.value; this._updateBpFilter(); break;
      case 'speed':   this._speed = data.value; break;
      case 'sourceMode': this._sourceMode = !!data.value; break;
    }
  }

  /** dB gain (linear) */
  static _dBToGain(db) { return Math.pow(10, db / 20); }

  /**
   * Exact port of ViatorrustAudioProcessor::synthesizeRandomCrackle()
   * Generates crackle+hiss into outL/outR (same signal both channels).
   */
  _synthesizeCrackle(outL, outR, numSamples) {
    // map 0-1 params to dB, matching viator-rust formula
    const hissDB   = this._hissVolume * 60 - 30; // -30..+30 dB
    const dustDB   = this._dustVolume * 60 - 30;
    const hissGain = VinylNoiseProcessor._dBToGain(hissDB + 5.0);
    const dustGain = VinylNoiseProcessor._dBToGain(dustDB - 6.0);
    const lfoFreqMax = this._speed * 10; // 0..10 Hz

    for (let i = 0; i < numSamples; i++) {
      // LFO (sine, frequency randomly modulated each sample like viator-rust)
      const lfoFreq = Math.random() * lfoFreqMax;
      this._lfoPhase += (2 * Math.PI * lfoFreq) / sampleRate;
      const lfoOut = Math.sin(this._lfoPhase);

      // Raw noise
      const noise = (Math.random() * 2.0 - 1.0) * 0.1;

      // Crackle burst: noise → LP1000 → LP60 → square → ×200
      const filteredNoise = this._hissLowpass.process(noise);
      let noiseSpeed = this._hissSpeedFilter.process(filteredNoise);
      noiseSpeed *= 10.0;
      noiseSpeed  = noiseSpeed * noiseSpeed;
      noiseSpeed *= 20.0;
      let signal = noiseSpeed;

      // Ramper envelope — exact port of Ramper usage in synthesizeRandomCrackle()
      if (this._rampedValue >= 1.0) {
        // Reset: start a new fade-in ramp (from current=0.96 to target=1.0 over 3ms)
        this._ramper.setTarget(0.96, 1.0, Math.round(sampleRate * 0.003));
        this._rampedValue = 0.0;
        this._rampRef[0] = 0.0;
      } else {
        signal *= this._rampedValue;
      }

      // Advance ramp one step (matches the while(!_ramper.ramp(rampedValue)) pattern)
      this._ramper.ramp(this._rampRef);
      this._rampedValue = this._rampRef[0];

      // Hiss + dust mix (only when ramp is in progress, i.e. rampedValue < 1.0)
      if (this._rampedValue < 1.0) {
        const hiss = this._noiseLowpass.process(noise) * 0.01;
        const dust = this._hissHighpass.process(signal);

        let output;
        if (lfoFreq > 0) {
          output = hiss * hissGain * lfoOut + dust * dustGain;
        } else {
          output = hiss * hissGain + dust * dustGain;
        }

        outL[i] = output;
        outR[i] = output;
      } else {
        outL[i] = 0;
        outR[i] = 0;
      }
    }
  }

  /**
   * Exact port of ViatorrustAudioProcessor::distortMidRange()
   * Applies arctan mid-range saturation in-place (the "Age" control).
   */
  _distortMidRange(L, R, numSamples) {
    const driveDB = this._age * 30;
    if (driveDB < 0.001) return;

    const drive   = VinylNoiseProcessor._dBToGain(driveDB);
    const mix     = driveDB / 30;
    const compDB  = -6 * mix;                    // jmap(driveDB, 0,30, 0,-6)
    const compGain = VinylNoiseProcessor._dBToGain(compDB);

    for (let i = 0; i < numSamples; i++) {
      // Process both channels but use same BP filter state (mono mid, like original)
      for (const ch of [L, R]) {
        const x   = ch[i];
        const mid  = this._bpFilter.processBandpass(x);
        const rest = x - mid;
        const distMid  = (2 / Math.PI) * Math.atan(mid * drive);
        const compMid  = distMid * compGain;
        ch[i] = (1 - mix) * rest + compMid * mix;
      }
    }
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const outL = output[0];
    const outR = output[1] || output[0];
    const numSamples = outL ? outL.length : 128;

    // Synthesize crackle+hiss into a temp buffer
    const dustL = new Float32Array(numSamples);
    const dustR = new Float32Array(numSamples);
    this._synthesizeCrackle(dustL, dustR, numSamples);

    // Mix with input signal
    const input = inputs[0];
    const inL = input && input[0] ? input[0] : null;
    const inR = input && input[1] ? input[1] : (inL || null);

    for (let i = 0; i < numSamples; i++) {
      if (this._sourceMode && inL) {
        // Add noise to input (default mode, matches viator-rust sourceTrack=true)
        outL[i] = (inL[i] || 0) + dustL[i];
        outR[i] = ((inR && inR[i]) || 0) + dustR[i];
      } else {
        // Replace output with noise only
        outL[i] = dustL[i];
        outR[i] = dustR[i];
      }
    }

    // Apply age distortion to output
    this._distortMidRange(outL, outR, numSamples);

    return true;
  }
}

registerProcessor('vinyl-noise-processor', VinylNoiseProcessor);
```

**Step 2: Verify the file is syntactically correct**

```bash
node --input-type=module < /dev/null || node -e "require('fs').readFileSync('public/vinylnoise/VinylNoise.worklet.js','utf8')"
# Just check it parses — AudioWorklet globals (sampleRate, AudioWorkletProcessor, registerProcessor)
# are not available in Node, but syntax errors will surface:
node -e "new Function(require('fs').readFileSync('public/vinylnoise/VinylNoise.worklet.js','utf8'))()"
```
Expected: No output (no syntax errors). Any error = fix it before continuing.

**Step 3: Commit**

```bash
git add public/vinylnoise/VinylNoise.worklet.js
git commit -m "feat: add VinylNoise AudioWorklet DSP (viator-rust port)"
```

---

## Task 2: Create the Tone.js effect wrapper

**Files:**
- Create: `src/engine/effects/VinylNoiseEffect.ts`

Follows `MVerbEffect.ts` but simpler — no WASM loading, worklet is ready synchronously. The wrapper handles dry/wet mixing in Tone.js (main thread) while the worklet handles DSP (audio thread).

**Step 1: Create the wrapper**

```typescript
// src/engine/effects/VinylNoiseEffect.ts
/**
 * VinylNoiseEffect — pure JS AudioWorklet vinyl crackle synthesizer.
 * DSP ported from viator-rust (MIT, Landon Viator).
 * No WASM. The worklet is always ready immediately after init.
 */

import * as Tone from 'tone';

function getRawNode(node: Tone.Gain): AudioNode {
  const n = node as unknown as Record<string, AudioNode | undefined>;
  return n._gainNode ?? n._nativeAudioNode ?? n._node ?? (node as unknown as AudioNode);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export interface VinylNoiseOptions {
  hiss?:   number;  // 0-1
  dust?:   number;  // 0-1
  age?:    number;  // 0-1
  speed?:  number;  // 0-1
  wet?:    number;  // 0-1
}

export class VinylNoiseEffect extends Tone.ToneAudioNode {
  readonly name = 'VinylNoise';
  readonly input:  Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;

  private _hiss:  number;
  private _dust:  number;
  private _age:   number;
  private _speed: number;
  private _wet:   number;

  // One registration per AudioContext
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: VinylNoiseOptions = {}) {
    super();

    this._hiss  = options.hiss  ?? 0.5;
    this._dust  = options.dust  ?? 0.5;
    this._age   = options.age   ?? 0.5;
    this._speed = options.speed ?? 0.2;
    this._wet   = options.wet   ?? 1.0;

    this.input  = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    // Dry path (input → dryGain → output)
    this.dryGain = new Tone.Gain(1 - this._wet);
    this.wetGain = new Tone.Gain(this._wet);

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);

    this._initWorklet();
  }

  private async _initWorklet() {
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      await VinylNoiseEffect._ensureRegistered(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'vinyl-noise-processor', {
        numberOfInputs:  1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      // Wire: input → worklet → wetGain → output
      const rawInput = getRawNode(this.input);
      const rawWet   = getRawNode(this.wetGain);
      rawInput.connect(this.workletNode);
      this.workletNode.connect(rawWet);

      // Push current params to worklet
      this._send('hiss',  this._hiss);
      this._send('dust',  this._dust);
      this._send('age',   this._age);
      this._send('speed', this._speed);

    } catch (err) {
      console.warn('[VinylNoise] Worklet init failed:', err);
      // Fallback: just pass input through wetGain
      this.input.connect(this.wetGain);
    }
  }

  private static async _ensureRegistered(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;

    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      await ctx.audioWorklet.addModule(`${base}vinylnoise/VinylNoise.worklet.js`);
      this.loadedContexts.add(ctx);
    })();

    this.initPromises.set(ctx, p);
    return p;
  }

  private _send(param: string, value: number) {
    this.workletNode?.port.postMessage({ param, value });
  }

  // ─── Parameter setters ────────────────────────────────────────────────────

  setHiss(v: number)  { this._hiss  = clamp01(v); this._send('hiss',  this._hiss);  }
  setDust(v: number)  { this._dust  = clamp01(v); this._send('dust',  this._dust);  }
  setAge(v: number)   { this._age   = clamp01(v); this._send('age',   this._age);   }
  setSpeed(v: number) { this._speed = clamp01(v); this._send('speed', this._speed); }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp01(value);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  dispose(): this {
    super.dispose();
    try { this.workletNode?.disconnect(); } catch { /* */ }
    this.workletNode = null;
    this.dryGain.dispose();
    this.wetGain.dispose();
    return this;
  }
}
```

**Step 2: TypeScript check**

```bash
yarn tsc --noEmit 2>&1 | tail -5
```
Expected: `Done in X.XXs` with no errors.

**Step 3: Commit**

```bash
git add src/engine/effects/VinylNoiseEffect.ts
git commit -m "feat: add VinylNoiseEffect Tone.js wrapper"
```

---

## Task 3: Register the effect type

**Files:**
- Modify: `src/types/instrument.ts` — add `'VinylNoise'` to `AudioEffectType`

**Step 1: Find the right place**

In `src/types/instrument.ts`, the `AudioEffectType` union is at line ~2168. Add `'VinylNoise'` after `'SpringReverb'`:

```typescript
  | 'SpringReverb'     // Spring reverb with drip (WASM)
  | 'VinylNoise'       // Vinyl crackle & hiss synthesizer
  // WAM 2.0 effects (external Web Audio Module plugins)
```

**Step 2: TypeScript check**

```bash
yarn tsc --noEmit 2>&1 | tail -5
```
Expected: `Done` with no errors.

**Step 3: Commit**

```bash
git add src/types/instrument.ts
git commit -m "feat: register VinylNoise AudioEffectType"
```

---

## Task 4: Wire up InstrumentFactory

**Files:**
- Modify: `src/engine/InstrumentFactory.ts`

Two changes needed: default parameters + `createEffect` case.

**Step 1: Add import**

At the top of `InstrumentFactory.ts`, after the existing effect imports (around line 41), add:

```typescript
import { VinylNoiseEffect } from './effects/VinylNoiseEffect';
```

**Step 2: Add default parameters**

In `getDefaultEffectParameters()`, after the `'SpringReverb'` case (around line 174), add:

```typescript
    case 'VinylNoise':
      return { hiss: 50, dust: 50, age: 50, speed: 20 };
```

Note: parameters are stored 0-100 in UI space; the wrapper converts to 0-1 internally.

**Step 3: Add createEffect case**

In `createEffect()`, after the `'SpringReverb'` case (around line 1527), add:

```typescript
      case 'VinylNoise': {
        const node = new VinylNoiseEffect({
          hiss:  (Number(p.hiss)  || 50) / 100,
          dust:  (Number(p.dust)  || 50) / 100,
          age:   (Number(p.age)   || 50) / 100,
          speed: (Number(p.speed) || 20) / 100,
          wet: wetValue,
        });
        (node as Tone.ToneAudioNode & { _fxType?: string })._fxType = 'VinylNoise';
        return node;
      }
```

**Step 4: TypeScript check**

```bash
yarn tsc --noEmit 2>&1 | tail -5
```
Expected: `Done` with no errors.

**Step 5: Commit**

```bash
git add src/engine/InstrumentFactory.ts
git commit -m "feat: wire VinylNoise into InstrumentFactory"
```

---

## Task 5: Wire up ToneEngine parameter updates

**Files:**
- Modify: `src/engine/ToneEngine.ts`

**Step 1: Add import**

After the `SpringReverbEffect` import (around line 31), add:

```typescript
import { VinylNoiseEffect } from './effects/VinylNoiseEffect';
```

**Step 2: Add updateEffectNode case**

In `ToneEngine.ts`, find the `case 'TapeSaturation':` block (around line 5217) in the `updateEffectNode` / parameter-update switch. After the `TapeSaturation` case, add:

```typescript
      case 'VinylNoise':
        if (node instanceof VinylNoiseEffect) {
          if ('hiss'  in changed) node.setHiss (Number(changed.hiss)  / 100);
          if ('dust'  in changed) node.setDust (Number(changed.dust)  / 100);
          if ('age'   in changed) node.setAge  (Number(changed.age)   / 100);
          if ('speed' in changed) node.setSpeed(Number(changed.speed) / 100);
        }
        break;
```

**Step 3: TypeScript check**

```bash
yarn tsc --noEmit 2>&1 | tail -5
```
Expected: `Done` with no errors.

**Step 4: Commit**

```bash
git add src/engine/ToneEngine.ts
git commit -m "feat: handle VinylNoise parameter updates in ToneEngine"
```

---

## Task 6: Add the UI editor

**Files:**
- Modify: `src/components/effects/VisualEffectEditors.tsx`

Three additions in one file: the editor component, color theme, icon, and registry entry.

**Step 1: Add the editor component**

Find the `// ============================================================================` comment block for `TapeSaturation` (around line 1888) and add a new block right after `TapeSaturationEditor`:

```tsx
// ============================================================================
// VINYL NOISE
// ============================================================================

export const VinylNoiseEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const hiss  = getParam(effect, 'hiss',  50);
  const dust  = getParam(effect, 'dust',  50);
  const age   = getParam(effect, 'age',   50);
  const speed = getParam(effect, 'speed', 20);

  return (
    <div className="space-y-4">
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader color="#d97706" title="Vinyl Noise" />
        <div className="flex justify-around items-end">
          <Knob
            value={hiss}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('hiss', v)}
            label="Hiss"
            color="#d97706"
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={dust}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('dust', v)}
            label="Dust"
            color="#d97706"
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={age}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('age', v)}
            label="Age"
            color="#b45309"
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={speed}
            min={0}
            max={100}
            onChange={(v) => onUpdateParameter('speed', v)}
            label="Speed"
            color="#92400e"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
      <section className="rounded-xl p-4 border border-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <div className="flex justify-center">
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            color="#d97706"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};
```

**Step 2: Add to editor registry map**

In the `EFFECT_EDITORS` map (around line 2337), after `TapeSaturation: TapeSaturationEditor`, add:

```typescript
  VinylNoise: VinylNoiseEditor,
```

**Step 3: Add color theme**

In the `EFFECT_COLORS` map (around line 2406), after `TapeSaturation: { ... }`, add:

```typescript
  VinylNoise:          { bg: '#1a1008', bgEnd: '#120a04', accent: '#d97706', border: '#2a1a08' },
```

**Step 4: Add icon**

In the `EFFECT_ICONS` map (around line 2474), after `TapeSaturation: <Zap ...>`, add:

```typescript
    VinylNoise: <Disc size={18} className="text-white" />,
```

`Disc` is already imported in this file (used by `RETapeEcho`). Verify it's in the imports at the top; if not, add it to the lucide-react import.

**Step 5: TypeScript check**

```bash
yarn tsc --noEmit 2>&1 | tail -5
```
Expected: `Done` with no errors.

**Step 6: Commit**

```bash
git add src/components/effects/VisualEffectEditors.tsx
git commit -m "feat: add VinylNoise effect UI editor"
```

---

## Task 7: Add to effect picker and unified effects registry

**Files:**
- Modify: `src/components/instruments/shared/EffectChain.tsx`
- Modify: `src/constants/unifiedEffects.ts`

**Step 1: Add to AVAILABLE_EFFECTS in EffectChain.tsx**

In the `AVAILABLE_EFFECTS` array (around line 32), after `'SpringReverb'`, add:

```typescript
  'VinylNoise',
```

**Step 2: Add to unifiedEffects.ts**

In `src/constants/unifiedEffects.ts`, after the `SpringReverb` entry (around line 221), add:

```typescript
  {
    category: 'wasm',
    type: 'VinylNoise',
    label: 'Vinyl Noise',
    group: 'Texture',
    description: 'Vinyl crackle & hiss synthesizer — DSP-generated pops, dust noise, and mid-range warmth (viator-rust port)',
  },
```

Note: use category `'wasm'` so it appears in the WASM section of the effect picker (it is an AudioWorklet effect, even if written in JS).

**Step 3: TypeScript check**

```bash
yarn tsc --noEmit 2>&1 | tail -5
```
Expected: `Done` with no errors.

**Step 4: Commit**

```bash
git add src/components/instruments/shared/EffectChain.tsx src/constants/unifiedEffects.ts
git commit -m "feat: expose VinylNoise in effect picker"
```

---

## Task 8: Smoke test in browser

No automated tests for audio DSP — verify manually:

**Step 1: Start dev server**

```bash
yarn dev
```

**Step 2: Add VinylNoise to an instrument**

1. Open any instrument (e.g., a sample or synth)
2. Open its Effect Chain
3. Add "Vinyl Noise" from the picker
4. Ensure it appears in the chain without errors in browser console

**Step 3: Verify DSP is working**

1. Play the instrument or any pattern
2. With Hiss=50, Dust=50, Age=50: you should hear clear vinyl crackle and hiss
3. Turn Hiss to 0 → crackle only
4. Turn Dust to 0 → hiss only
5. Age to 0 → no mid distortion (cleaner sound)
6. Age to 100 → warm mid-range saturation
7. Speed to 0 → evenly distributed crackle
8. Speed to 100 → crackle rate modulated by fast LFO
9. Mix (wet) to 0 → dry signal only, no vinyl noise
10. Mix to 100 → full vinyl noise added

**Step 4: Check browser console**

Should see `[VinylNoise]` messages only if worklet failed (unlikely). No uncaught errors.

**Step 5: Final commit**

```bash
git add -p  # stage any last-minute fixes
git commit -m "feat: vinyl noise effect complete"
```

---

## Summary of Touch Points

| File | Change |
|---|---|
| `public/vinylnoise/VinylNoise.worklet.js` | **New** — full DSP |
| `src/engine/effects/VinylNoiseEffect.ts` | **New** — Tone.js wrapper |
| `src/types/instrument.ts` | Add `'VinylNoise'` to union |
| `src/engine/InstrumentFactory.ts` | Import + defaults + createEffect case |
| `src/engine/ToneEngine.ts` | Import + updateEffectNode case |
| `src/components/effects/VisualEffectEditors.tsx` | Editor component + registry + colors + icon |
| `src/components/instruments/shared/EffectChain.tsx` | Add to AVAILABLE_EFFECTS |
| `src/constants/unifiedEffects.ts` | Add entry to effect library |
