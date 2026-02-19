# Effect Visualizers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add live audio visualizers to all master effects (mini meter on chain card + full visualizer in editor), plus fix three broken effects: Chebyshev extreme distortion, BitCrusher silence, Compressor invisibility.

**Architecture:** ToneEngine creates pre/post AnalyserNode taps (side-branch, non-destructive) for each master effect. A new `useEffectAnalyser` hook reads those analysers via rAF at 30fps. A new `EffectVisualizer.tsx` file holds all canvas-based visualizer components. Each effect editor imports the right visualizer; the chain card gets a tiny RMS meter.

**Tech Stack:** React, Tone.js, Web Audio API (AnalyserNode), TypeScript, existing `useVisualizationAnimation` hook (src/hooks/useVisualizationAnimation.ts)

---

## Part 1: Bug Fixes

---

### Task 1: Fix Chebyshev default order (50 → 2)

**Files:**
- Modify: `src/engine/InstrumentFactory.ts:137` (getDefaultEffectParameters)
- Modify: `src/engine/InstrumentFactory.ts:1036` (createEffect fallback)

**Step 1: Change default in getDefaultEffectParameters**

In `getDefaultEffectParameters`, find:
```typescript
case 'Chebyshev':
  return { order: 50, oversample: 'none' };
```
Change to:
```typescript
case 'Chebyshev':
  return { order: 2, oversample: 'none' };
```

**Step 2: Change fallback in createEffect**

Find the Chebyshev case in `createEffect` (around line 1034):
```typescript
case 'Chebyshev':
  node = new Tone.Chebyshev({
    order: p.order || 50,
```
Change `50` to `2`:
```typescript
order: p.order || 2,
```

**Step 3: Run tests**

```bash
npx vitest run
```
Expected: All 1219 tests pass (no test covers Chebyshev defaults directly).

**Step 4: Commit**

```bash
git add src/engine/InstrumentFactory.ts
git commit -m "fix(chebyshev): change default order from 50 to 2 — order 50 causes extreme distortion"
```

---

### Task 2: Fix BitCrusher async race — re-send bits after worklet ready

**Files:**
- Modify: `src/engine/InstrumentFactory.ts` (BitCrusher case, ~line 1019)

**Context:** The existing code polls `crusherWorklet._worklet` to wait for the AudioWorkletNode. After waiting, it never re-sends the `bits` value to the worklet. The AudioParam may not have propagated. Fix: after waiting, explicitly set `crusher.bits.value` again.

**Step 1: Update BitCrusher case**

Find the `case 'BitCrusher':` block in `createEffect` and replace with:
```typescript
case 'BitCrusher': {
  const bitsValue = Number(p.bits) || 4;
  const crusher = new Tone.BitCrusher(bitsValue);
  crusher.wet.value = wetValue;
  // BitCrusher uses an AudioWorklet that loads async.
  // Wait up to 1s for the worklet node to be created, then re-set bits.
  const crusherWorklet = (crusher as unknown as { _bitCrusherWorklet: { _worklet?: AudioWorkletNode } })._bitCrusherWorklet;
  if (crusherWorklet) {
    for (let attempt = 0; attempt < 50; attempt++) {
      if (crusherWorklet._worklet) break;
      await new Promise(r => setTimeout(r, 20));
    }
    // Re-set bits after worklet is confirmed ready (param may not have been received)
    crusher.bits.value = bitsValue;
  }
  node = crusher;
  break;
}
```

**Step 2: Run tests**
```bash
npx vitest run
```
Expected: All 1219 tests pass.

**Step 3: Commit**
```bash
git add src/engine/InstrumentFactory.ts
git commit -m "fix(bitcrusher): re-send bits value after AudioWorklet is ready"
```

---

### Task 3: Fix Compressor default wet (50% → 100%)

**Context:** `Tone.Compressor` does not have a `wet` property — it always processes 100% of the signal. However showing `wet: 50` in the UI confuses users (they see "half wet" but can't change it to make a difference). Change dynamics effects to default to `wet: 100` so the slider accurately reflects the audio behavior.

**Files:**
- Modify: `src/components/effects/MasterEffectsPanel.tsx` (handleAddEffect function, ~line 258)

**Step 1: Add dynamics type set and conditional wet**

In `handleAddEffect` in MasterEffectsPanel.tsx, change:
```typescript
addMasterEffectConfig({
  category: availableEffect.category,
  type,
  enabled: true,
  wet: 50,
```
To:
```typescript
const DYNAMICS_EFFECTS = new Set(['Compressor', 'SidechainCompressor']);
const defaultWet = DYNAMICS_EFFECTS.has(type) ? 100 : 50;

addMasterEffectConfig({
  category: availableEffect.category,
  type,
  enabled: true,
  wet: defaultWet,
```

**Step 2: TypeScript check**
```bash
npx tsc -b --noEmit
```
Expected: 0 errors.

**Step 3: Run tests**
```bash
npx vitest run
```
Expected: All 1219 tests pass.

**Step 4: Commit**
```bash
git add src/components/effects/MasterEffectsPanel.tsx
git commit -m "fix(compressor): default wet 100 for dynamics effects — wet slider has no audio effect but showing 50 is misleading"
```

---

## Part 2: ToneEngine AnalyserNode Taps

---

### Task 4: Add masterEffectAnalysers map + create/dispose taps in rebuildMasterEffects

**Files:**
- Modify: `src/engine/ToneEngine.ts`

**What to add:**

1. A private field `masterEffectAnalysers` (Map from effect ID to `{ pre: AnalyserNode; post: AnalyserNode }`)
2. In `rebuildMasterEffects`: create pre/post analysers for each effect, wire as side branches
3. In the cleanup block at the start of `rebuildMasterEffects` (before the `// Filter to only enabled effects` line): disconnect and clear old analysers

**Step 1: Add private field**

Find the block with `masterEffectsNodes`, `masterEffectConfigs`, `masterEffectsRebuildVersion` (around line 118) and add after them:
```typescript
// Pre/post AnalyserNode taps for each master effect (for visualizers)
private masterEffectAnalysers: Map<string, { pre: AnalyserNode; post: AnalyserNode }> = new Map();
```

**Step 2: Add cleanup for analysers in the two cleanup blocks**

There are TWO places in `rebuildMasterEffects` where `masterEffectConfigs.clear()` is called (lines 4745 and 4477). After EACH of those, add analyser cleanup:

In `rebuildMasterEffects` (the main one, ~line 4744):
```typescript
this.masterEffectsNodes = [];
this.masterEffectConfigs.clear();
// Disconnect and clear analyser taps
this.masterEffectAnalysers.forEach(({ pre, post }) => {
  try { pre.disconnect(); } catch { /* */ }
  try { post.disconnect(); } catch { /* */ }
});
this.masterEffectAnalysers.clear();
```

In the RESET path (around line 4476) — search for `this.masterEffectsNodes = [];` and the `masterEffectConfigs.clear()` before it:
```typescript
this.masterEffectsNodes = [];
this.masterEffectConfigs.clear();
this.masterEffectAnalysers.forEach(({ pre, post }) => {
  try { pre.disconnect(); } catch { /* */ }
  try { post.disconnect(); } catch { /* */ }
});
this.masterEffectAnalysers.clear();
```

**Step 3: Create and wire analyser taps after the chain is connected**

After the chain-connect block at the end of `rebuildMasterEffects` (after line 4816, before `this._notifyNoiseEffectsPlaying`):

```typescript
// Create pre/post AnalyserNode taps for each effect
const rawCtx = Tone.getContext().rawContext as AudioContext;
for (let i = 0; i < successNodes.length; i++) {
  const config = successConfigs[i];

  const pre = rawCtx.createAnalyser();
  pre.fftSize = 2048;
  pre.smoothingTimeConstant = 0.8;

  const post = rawCtx.createAnalyser();
  post.fftSize = 2048;
  post.smoothingTimeConstant = 0.8;

  // Pre-tap: same signal that feeds into effect[i]
  // For effect[0]: from masterEffectsInput; for others: from the previous effect's output
  const preSourceNode: Tone.ToneAudioNode = i === 0 ? this.masterEffectsInput : successNodes[i - 1];
  const preNative = getNativeAudioNode(preSourceNode);
  if (preNative) {
    try { preNative.connect(pre); } catch { /* */ }
  }

  // Post-tap: signal after effect[i] (from its output)
  const postNative = getNativeAudioNode((successNodes[i] as any).output ?? successNodes[i]);
  if (postNative) {
    try { postNative.connect(post); } catch { /* */ }
  } else {
    // Fallback: try getNativeAudioNode on the node itself
    const fallback = getNativeAudioNode(successNodes[i]);
    if (fallback) { try { fallback.connect(post); } catch { /* */ } }
  }

  this.masterEffectAnalysers.set(config.id, { pre, post });
}
```

**Step 4: TypeScript check**
```bash
npx tsc -b --noEmit
```
Expected: 0 errors. If there are errors about `getNativeAudioNode`, ensure it's already imported at the top of the file (it should be — check line ~22).

**Step 5: Run tests**
```bash
npx vitest run
```
Expected: All 1219 tests pass.

**Step 6: Commit**
```bash
git add src/engine/ToneEngine.ts
git commit -m "feat(ToneEngine): add pre/post AnalyserNode taps per master effect for visualizers"
```

---

### Task 5: Add getMasterEffectAnalysers() public method to ToneEngine

**Files:**
- Modify: `src/engine/ToneEngine.ts`

**Step 1: Add public getter method**

After the `masterEffectAnalysers` private field (or near the other public effect-accessor methods), add:

```typescript
/**
 * Returns the pre/post AnalyserNodes for a master effect by ID.
 * Pre-analyser receives the signal before the effect; post receives after.
 * Returns null if the effect ID is not found (e.g. effect is disabled or not yet built).
 */
public getMasterEffectAnalysers(id: string): { pre: AnalyserNode; post: AnalyserNode } | null {
  return this.masterEffectAnalysers.get(id) ?? null;
}
```

**Step 2: TypeScript check + tests**
```bash
npx tsc -b --noEmit && npx vitest run
```
Expected: 0 errors, all 1219 tests pass.

**Step 3: Commit**
```bash
git add src/engine/ToneEngine.ts
git commit -m "feat(ToneEngine): expose getMasterEffectAnalysers() for visualizer hook"
```

---

## Part 3: useEffectAnalyser Hook

---

### Task 6: Create src/hooks/useEffectAnalyser.ts

**Files:**
- Create: `src/hooks/useEffectAnalyser.ts`

**Context:**
- Uses existing `useVisualizationAnimation` from `src/hooks/useVisualizationAnimation.ts`
- Reads from `useAudioStore.getState().toneEngineInstance?.getMasterEffectAnalysers(effectId)`
- Allocates Float32Arrays once, reuses each frame
- Returns zeroed arrays when no analyser found (graceful degradation)
- `mode` controls which analyser method is called: `'waveform'` → `getFloatTimeDomainData`, `'fft'` → `getFloatFrequencyData`
- For mode `'both'`, returns separate waveform and fft arrays

**Step 1: Write the file**

```typescript
// src/hooks/useEffectAnalyser.ts
/**
 * useEffectAnalyser — reads pre/post AnalyserNode taps for a master effect.
 * Uses the existing useVisualizationAnimation hook for 30fps rAF loop.
 */
import { useRef, useState, useEffect } from 'react';
import { useAudioStore } from '@stores/useAudioStore';
import { useVisualizationAnimation } from './useVisualizationAnimation';

export type AnalyserMode = 'waveform' | 'fft';

interface EffectAnalyserResult {
  pre: Float32Array;
  post: Float32Array;
}

export function useEffectAnalyser(effectId: string, mode: AnalyserMode): EffectAnalyserResult {
  const FFT_SIZE = 2048;

  // Allocate arrays once — reused every frame to avoid GC pressure
  const preRef = useRef<Float32Array>(new Float32Array(FFT_SIZE));
  const postRef = useRef<Float32Array>(new Float32Array(FFT_SIZE));

  // Version counter to trigger re-renders when data changes
  const [, setTick] = useState(0);

  // Track whether we have any analyser (for idle detection)
  const hasAnalyserRef = useRef(false);

  useEffect(() => {
    // Reset to zeroed arrays when effectId changes
    preRef.current.fill(0);
    postRef.current.fill(0);
  }, [effectId, mode]);

  useVisualizationAnimation({
    onFrame: () => {
      const engine = useAudioStore.getState().toneEngineInstance;
      const analysers = engine?.getMasterEffectAnalysers(effectId) ?? null;

      if (!analysers) {
        if (hasAnalyserRef.current) {
          hasAnalyserRef.current = false;
          preRef.current.fill(0);
          postRef.current.fill(0);
          setTick(t => t + 1);
        }
        return false; // idle
      }

      hasAnalyserRef.current = true;

      if (mode === 'waveform') {
        if (preRef.current.length !== analysers.pre.frequencyBinCount) {
          preRef.current = new Float32Array(analysers.pre.frequencyBinCount);
          postRef.current = new Float32Array(analysers.post.frequencyBinCount);
        }
        analysers.pre.getFloatTimeDomainData(preRef.current);
        analysers.post.getFloatTimeDomainData(postRef.current);
      } else {
        if (preRef.current.length !== analysers.pre.frequencyBinCount) {
          preRef.current = new Float32Array(analysers.pre.frequencyBinCount);
          postRef.current = new Float32Array(analysers.post.frequencyBinCount);
        }
        analysers.pre.getFloatFrequencyData(preRef.current);
        analysers.post.getFloatFrequencyData(postRef.current);
      }

      setTick(t => t + 1);
      return true; // active
    },
    enabled: true,
  });

  return { pre: preRef.current, post: postRef.current };
}
```

**Step 2: TypeScript check**
```bash
npx tsc -b --noEmit
```
Expected: 0 errors.

**Step 3: Run tests**
```bash
npx vitest run
```
Expected: All 1219 tests pass (hook has no tests — that's fine, it's a UI concern).

**Step 4: Commit**
```bash
git add src/hooks/useEffectAnalyser.ts
git commit -m "feat: add useEffectAnalyser hook — reads pre/post analyser taps at 30fps"
```

---

## Part 4: EffectVisualizer Components

---

### Task 7: Create src/components/effects/EffectVisualizer.tsx

This file contains five canvas-based visualizer components. All use imperative canvas drawing (no SVG) for performance.

**Files:**
- Create: `src/components/effects/EffectVisualizer.tsx`

**Step 1: Write the full file**

```typescript
// src/components/effects/EffectVisualizer.tsx
/**
 * Canvas-based visualizer components for master effects.
 * All components use imperative <canvas> drawing for performance.
 * Colors: gray = pre (input), accent = post (output).
 */
import React, { useRef, useEffect, useCallback } from 'react';

// ─── EffectOscilloscope ────────────────────────────────────────────────────────
// Overlaid waveforms: gray=input, accent=output. Zero-cross triggered.

interface EffectOscilloscopeProps {
  pre: Float32Array;
  post: Float32Array;
  color: string; // accent color for post waveform
  width?: number;
  height?: number;
}

export const EffectOscilloscope: React.FC<EffectOscilloscopeProps> = ({
  pre, post, color, width = 300, height = 80,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    // Zero line
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    const drawWave = (data: Float32Array, strokeColor: string, lineWidth: number) => {
      if (!data.length) return;
      // Find zero-crossing for stable display
      let start = 0;
      for (let i = 1; i < data.length - 1; i++) {
        if (data[i - 1] < 0 && data[i] >= 0) { start = i; break; }
      }
      const sliceWidth = width / Math.min(data.length, 1024);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      let x = 0;
      for (let i = start; i < start + Math.min(data.length - start, 1024); i++) {
        const v = data[i] * 0.9; // scale to 90% to avoid clipping
        const y = (height / 2) * (1 - v);
        if (i === start) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.stroke();
    };

    // Draw pre (gray, thin) then post (accent, slightly thicker) for overlay effect
    drawWave(pre, 'rgba(160,160,160,0.5)', 1);
    drawWave(post, color, 1.5);
  });

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ display: 'block', borderRadius: 4, width: '100%', height }}
    />
  );
};

// ─── EffectSpectrum ────────────────────────────────────────────────────────────
// FFT spectrum. Gray fill=input, colored line=output. Log frequency axis.

interface EffectSpectrumProps {
  pre: Float32Array; // dBFS values from getFloatFrequencyData
  post: Float32Array;
  color: string;
  width?: number;
  height?: number;
  sampleRate?: number;
}

export const EffectSpectrum: React.FC<EffectSpectrumProps> = ({
  pre, post, color, width = 300, height = 80, sampleRate = 44100,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    const binCount = pre.length || 1024;
    const nyquist = sampleRate / 2;
    const minDb = -100, maxDb = 0;

    // Map frequency bin index to canvas x (log scale)
    const freqToX = (bin: number): number => {
      const freq = (bin / binCount) * nyquist;
      const minFreq = 20, maxFreq = nyquist;
      const logMin = Math.log10(minFreq), logMax = Math.log10(maxFreq);
      const logFreq = Math.log10(Math.max(freq, minFreq));
      return ((logFreq - logMin) / (logMax - logMin)) * width;
    };

    const dbToY = (db: number): number =>
      height - ((Math.max(minDb, Math.min(maxDb, db)) - minDb) / (maxDb - minDb)) * height;

    // Draw pre as gray fill
    if (pre.length) {
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let i = 1; i < binCount; i++) {
        ctx.lineTo(freqToX(i), dbToY(pre[i]));
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle = 'rgba(120,120,120,0.25)';
      ctx.fill();
    }

    // Draw post as colored line
    if (post.length) {
      ctx.beginPath();
      let started = false;
      for (let i = 1; i < binCount; i++) {
        const x = freqToX(i);
        const y = dbToY(post[i]);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ display: 'block', borderRadius: 4, width: '100%', height }}
    />
  );
};

// ─── WaveshaperCurve ─────────────────────────────────────────────────────────
// Static transfer function visualization — no analyser needed.
// Redraws only when params change.

interface WaveshaperCurveProps {
  type: 'Distortion' | 'Chebyshev' | 'TapeSaturation' | 'BitCrusher';
  drive?: number;   // 0-1 for Distortion/TapeSaturation; ignored for Chebyshev/BitCrusher
  order?: number;   // for Chebyshev
  bits?: number;    // for BitCrusher
  color: string;
  width?: number;
  height?: number;
}

// Chebyshev polynomial T_n(x)
function chebyshev(n: number, x: number): number {
  if (n === 0) return 1;
  if (n === 1) return x;
  let prev2 = 1, prev1 = x;
  for (let i = 2; i <= n; i++) {
    const curr = 2 * x * prev1 - prev2;
    prev2 = prev1;
    prev1 = curr;
  }
  return prev1;
}

export const WaveshaperCurve: React.FC<WaveshaperCurveProps> = ({
  type, drive = 0.5, order = 2, bits = 4, color, width = 300, height = 120,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    // Axes
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(width / 2, 0); ctx.lineTo(width / 2, height); // vertical
    ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); // horizontal
    ctx.stroke();

    const SAMPLES = width;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let px = 0; px < SAMPLES; px++) {
      const x = (px / SAMPLES) * 2 - 1; // -1 to +1

      let y: number;
      switch (type) {
        case 'Distortion': {
          const driveGain = drive * 10 + 0.1; // scale to audible range
          y = Math.tanh(driveGain * x) / Math.max(Math.tanh(driveGain), 0.001);
          break;
        }
        case 'Chebyshev': {
          const n = Math.max(1, Math.round(order));
          y = chebyshev(n, Math.max(-1, Math.min(1, x)));
          // Normalize by max value (T_n(1) = 1, but intermediate values may exceed 1)
          const norm = chebyshev(n, 1);
          y = y / (Math.abs(norm) || 1);
          break;
        }
        case 'TapeSaturation': {
          const d = drive * 5 + 0.1;
          y = Math.sign(x) * Math.tanh(Math.abs(x) * d) / Math.max(Math.tanh(d), 0.001);
          break;
        }
        case 'BitCrusher': {
          const steps = Math.pow(2, Math.max(1, bits));
          y = Math.round(x * steps) / steps;
          break;
        }
        default:
          y = x;
      }

      y = Math.max(-1, Math.min(1, y));
      const canvasY = (1 - y) * (height / 2);
      if (px === 0) ctx.moveTo(px, canvasY);
      else ctx.lineTo(px, canvasY);
    }
    ctx.stroke();
  }, [type, drive, order, bits, color, width, height]);

  useEffect(() => { draw(); }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ display: 'block', borderRadius: 4, width: '100%', height }}
    />
  );
};

// ─── GainReductionMeter ───────────────────────────────────────────────────────
// Shows L/R level bars (green, left) + gain reduction bar (red, right).
// GR = 20*log10(rms_post / rms_pre), clamped to 0dB..−20dB range.

interface GainReductionMeterProps {
  pre: Float32Array;  // time-domain waveform data
  post: Float32Array;
  width?: number;
  height?: number;
}

function computeRMS(data: Float32Array): number {
  if (!data.length) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / data.length);
}

export const GainReductionMeter: React.FC<GainReductionMeterProps> = ({
  pre, post, width = 300, height = 80,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    const rmsPost = computeRMS(post);
    const rmsPre = computeRMS(pre);

    // Level bar (post-signal level, green)
    const levelDb = rmsPost > 0 ? 20 * Math.log10(rmsPost) : -60;
    const levelNorm = Math.max(0, Math.min(1, (levelDb + 60) / 60)); // -60..0dB → 0..1
    const levelW = levelNorm * (width * 0.6);
    ctx.fillStyle = levelNorm > 0.9 ? '#ef4444' : levelNorm > 0.7 ? '#f59e0b' : '#22c55e';
    ctx.fillRect(4, height * 0.1, levelW, height * 0.35);

    // GR bar (red, right side)
    const grDb = (rmsPre > 0.0001 && rmsPost > 0)
      ? Math.max(-20, Math.min(0, 20 * Math.log10(rmsPost / rmsPre)))
      : 0;
    const grNorm = Math.abs(grDb) / 20; // 0..20dB → 0..1
    const grW = grNorm * (width * 0.35);
    const grX = width - 4 - grW;
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(grX, height * 0.1, grW, height * 0.35);

    // Labels
    ctx.fillStyle = '#666';
    ctx.font = '9px monospace';
    ctx.fillText('LEVEL', 4, height * 0.75);
    ctx.fillText('GR', width - 24, height * 0.75);

    // GR value
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${grDb.toFixed(1)}dB`, width - 4, height * 0.9);
    ctx.textAlign = 'left';
  });

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ display: 'block', borderRadius: 4, width: '100%', height }}
    />
  );
};

// ─── MiniOutputMeter ──────────────────────────────────────────────────────────
// 48×16px RMS bar for the chain card. grMode=true for compressor (red, shows GR).

interface MiniOutputMeterProps {
  post: Float32Array;
  pre?: Float32Array; // needed when grMode=true
  color?: string;
  grMode?: boolean;
}

export const MiniOutputMeter: React.FC<MiniOutputMeterProps> = ({
  post, pre, color = '#22c55e', grMode = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const W = 48, H = 16;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);

    let norm = 0;
    let barColor = color;

    if (grMode && pre && pre.length) {
      const rmsPost = computeRMS(post);
      const rmsPre = computeRMS(pre);
      const grDb = (rmsPre > 0.0001 && rmsPost > 0)
        ? Math.max(-20, Math.min(0, 20 * Math.log10(rmsPost / rmsPre)))
        : 0;
      norm = Math.abs(grDb) / 20;
      barColor = '#ef4444';
    } else {
      const rms = computeRMS(post);
      const levelDb = rms > 0 ? 20 * Math.log10(rms) : -60;
      norm = Math.max(0, Math.min(1, (levelDb + 60) / 60));
      barColor = norm > 0.9 ? '#ef4444' : norm > 0.7 ? '#f59e0b' : color;
    }

    if (norm > 0) {
      ctx.fillStyle = barColor;
      ctx.fillRect(1, 3, Math.round(norm * (W - 2)), H - 6);
    }

    // Peak tick at 0dBFS
    ctx.fillStyle = '#333';
    ctx.fillRect(W - 2, 3, 1, H - 6);
  });

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{ display: 'inline-block', verticalAlign: 'middle', borderRadius: 2 }}
    />
  );
};
```

**Step 2: TypeScript check**
```bash
npx tsc -b --noEmit
```
Expected: 0 errors.

**Step 3: Run tests**
```bash
npx vitest run
```
Expected: All 1219 tests pass.

**Step 4: Commit**
```bash
git add src/components/effects/EffectVisualizer.tsx
git commit -m "feat: add EffectVisualizer components — oscilloscope, spectrum, waveshaper curve, GR meter, mini meter"
```

---

## Part 5: Wire Visualizers Into Effect Editors

---

### Task 8: Add visualizers to VisualEffectEditors.tsx

**Files:**
- Modify: `src/components/effects/VisualEffectEditors.tsx`

**What to add:**
- Import `useEffectAnalyser` and all visualizer components
- Add `WaveshaperCurve` above the controls in `DistortionEditor`, `ChebyshevEditor`, `TapeSaturationEditor`
- Add `EffectOscilloscope` above controls in `BitCrusherEditor`, all delay/reverb editors, and all "everything else" editors
- Add `EffectSpectrum` above controls in `EQ3Editor`, `FilterEditor`, `AutoFilterEditor`, `AutoWahEditor`, `MoogFilterEditor`
- Add `GainReductionMeter` above controls in `CompressorEditor`, `SidechainCompressorEditor`

**Step 1: Add imports at the top of VisualEffectEditors.tsx**

After the existing imports, add:
```typescript
import { useEffectAnalyser } from '@hooks/useEffectAnalyser';
import {
  EffectOscilloscope,
  EffectSpectrum,
  WaveshaperCurve,
  GainReductionMeter,
} from './EffectVisualizer';
```

**Step 2: Add WaveshaperCurve to DistortionEditor**

In `DistortionEditor`, the component already reads `drive`. Add the visualizer right before the `<section>` tag:
```typescript
export const DistortionEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const drive = getParam(effect, 'drive', 0.4);
  return (
    <div className="space-y-4">
      <WaveshaperCurve type="Distortion" drive={drive} color="#ef4444" height={100} />
      <section ...>
```

**Step 3: Add WaveshaperCurve to ChebyshevEditor**

Find the `ChebyshevEditor` component. It reads `order`. Add before its outer `<div className="space-y-4">`:
```typescript
<WaveshaperCurve type="Chebyshev" order={order} color="#f97316" height={100} />
```

**Step 4: Add WaveshaperCurve to TapeSaturationEditor**

Add before its outer section:
```typescript
<WaveshaperCurve type="TapeSaturation" drive={drive / 100} color="#f59e0b" height={100} />
```

**Step 5: Add EffectOscilloscope to BitCrusherEditor**

BitCrusher shows the staircase quantization waveform:
```typescript
export const BitCrusherEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');
  const bits = getParam(effect, 'bits', 4);
  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#8b5cf6" />
      <section ...>
```

**Step 6: Add GainReductionMeter to CompressorEditor and SidechainCompressorEditor**

In `CompressorEditor`:
```typescript
export const CompressorEditor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter, onUpdateWet }) => {
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');
  // ... existing param reads ...
  return (
    <div className="space-y-4">
      <GainReductionMeter pre={pre} post={post} />
      <section ...>
```
Do the same for `SidechainCompressorEditor`.

**Step 7: Add EffectSpectrum to EQ/Filter editors**

For `EQ3Editor`, `FilterEditor`, `AutoFilterEditor`, `AutoWahEditor`, `MoogFilterEditor`:
```typescript
const { pre, post } = useEffectAnalyser(effect.id, 'fft');
// ... then add at top of return:
<EffectSpectrum pre={pre} post={post} color="<accent color for that editor>" />
```

Use these accent colors (match existing SectionHeader colors in each editor):
- EQ3: `#10b981` (green)
- Filter: `#06b6d4` (cyan)
- AutoFilter: `#a855f7` (purple)
- AutoWah: `#84cc16` (lime)
- MoogFilter: `#f43f5e` (rose)

**Step 8: Add EffectOscilloscope to all remaining editors**

For all other effect editors that don't already have a visualizer (Reverb, JCReverb, MVerb, SpringReverb, Delay, FeedbackDelay, PingPongDelay, SpaceEcho, RETapeEcho, SpaceyDelayer, Chorus, Phaser, Tremolo, VinylNoise, Leslie, TapeSaturation, etc.):

```typescript
const { pre, post } = useEffectAnalyser(effect.id, 'waveform');
// Add at top of return:
<EffectOscilloscope pre={pre} post={post} color="<accent color>" />
```

Use the matching accent color from `ENCLOSURE_COLORS` for each effect type.

**Step 9: TypeScript check**
```bash
npx tsc -b --noEmit
```
Expected: 0 errors. Fix any hook-inside-conditional issues if editors share components.

**Step 10: Run tests**
```bash
npx vitest run
```
Expected: All 1219 tests pass.

**Step 11: Commit**
```bash
git add src/components/effects/VisualEffectEditors.tsx
git commit -m "feat: add live visualizers to all effect editors — waveshaper curves, oscilloscopes, spectrums, GR meter"
```

---

### Task 9: Add MiniOutputMeter to SortableEffectItem in MasterEffectsPanel.tsx

**Files:**
- Modify: `src/components/effects/MasterEffectsPanel.tsx`

**What to add:** A 48×16px mini RMS bar between the effect name and the WET slider. For Compressor/SidechainCompressor, uses `grMode` (red, shows gain reduction).

**Step 1: Add imports**

At the top of MasterEffectsPanel.tsx, add:
```typescript
import { MiniOutputMeter } from './EffectVisualizer';
import { useEffectAnalyser } from '@hooks/useEffectAnalyser';
```

**Step 2: Extract SortableEffectItem into a component that uses the hook**

The `useEffectAnalyser` hook must be called at the top level of a React component. `SortableEffectItem` is already a function component, so we can add the hook there.

In `SortableEffectItem`, add the hook call and the mini meter.

After the function signature and destructuring, add:
```typescript
const { pre, post } = useEffectAnalyser(effect.id, 'waveform');
const isGrMode = effect.type === 'Compressor' || effect.type === 'SidechainCompressor';
```

Then in the JSX, between the effect name div and the WET slider, add:
```typescript
{/* Mini output meter */}
<MiniOutputMeter
  post={post}
  pre={isGrMode ? pre : undefined}
  grMode={isGrMode}
/>
```

The exact location in the JSX: after `</div>` that closes the effect name block (~line 97) and before the `{/* Wet/Dry Control */}` comment.

**Step 3: TypeScript check**
```bash
npx tsc -b --noEmit
```
Expected: 0 errors.

**Step 4: Run tests**
```bash
npx vitest run
```
Expected: All 1219 tests pass.

**Step 5: Commit**
```bash
git add src/components/effects/MasterEffectsPanel.tsx
git commit -m "feat: add MiniOutputMeter to effect chain cards — live RMS bar for each effect"
```

---

## Verification Checklist

After all tasks complete, verify in the browser:

1. Open master effects → add Chebyshev → open editor → curve should look like a gentle harmonic shape, not a chainsaw
2. Add BitCrusher → open editor → waveform visualizer should show staircase quantization artifacts
3. Add Compressor → defaults to wet: 100; open editor → GR meter shows red bar when compression occurs
4. Every effect editor shows a live visualizer above the controls
5. Each effect row in the chain list shows a tiny RMS bar (green for normal effects, red for compressor)
6. The mini meter updates in real time as audio plays
7. `npx tsc -b --noEmit` → 0 errors
8. `npx vitest run` → 1219/1219 passing
