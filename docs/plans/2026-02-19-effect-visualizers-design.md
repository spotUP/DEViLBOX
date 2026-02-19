# Effect Visualizers Design
**Date:** 2026-02-19
**Status:** Approved

## Overview

Add live audio visualizers to the master effects chain — a mini meter on each chain card (always visible) and a full effect-specific visualizer in the expanded editor. Also fix three broken effects: Chebyshev, BitCrusher, Compressor.

---

## Part 1: Bug Fixes

| Effect | Bug | Fix |
|---|---|---|
| Chebyshev | `order: 50` default causes extreme distortion (50th-order Chebyshev polynomial = chainsaw) | Change default to `order: 2` |
| BitCrusher | Silent — Tone.js async AudioWorklet race condition; worklet may not be ready when chain connects | Add `'ready'` postMessage listener in worklet init; re-send bits param on ready |
| Compressor | `wet: 50` makes compression invisible (half-blended with dry); no makeup gain | Change dynamics effects to `wet: 100` by default in `addMasterEffectConfig`; document that users control wet |

---

## Part 2: Architecture

### 2a. ToneEngine — AnalyserNode taps

`rebuildMasterEffects` creates a `pre` and `post` `AnalyserNode` (fftSize=2048, smoothing=0.8) for each master effect as a non-destructive side-branch tap:

```
masterEffectsInput ─┬─> [effectNode] ─┬─> next effect / masterChannel
                    └─> preAnalyser   └─> postAnalyser
```

Storage: `private masterEffectAnalysers: Map<string, { pre: AnalyserNode; post: AnalyserNode }>`

New public method:
```ts
getMasterEffectAnalysers(id: string): { pre: AnalyserNode; post: AnalyserNode } | null
```

Lifecycle: analysers are created alongside their effect node in `rebuildMasterEffects`, disposed in the same cleanup block. Uses the raw `AudioContext` (same as the effect node).

### 2b. `useEffectAnalyser` hook

```ts
// src/hooks/useEffectAnalyser.ts
useEffectAnalyser(effectId: string, mode: 'waveform' | 'fft' | 'both')
  → { pre: Float32Array; post: Float32Array }
```

- Reads from `useAudioStore.getState().toneEngineInstance?.getMasterEffectAnalysers(effectId)`
- `requestAnimationFrame` loop at ~30fps
- Allocates Float32Arrays once on mount, reuses them each frame
- Stops loop on unmount
- Returns zeroed arrays when effect not found (graceful degradation)
- `effect.id` is already available in all editors via `effect: EffectConfig` — no prop changes needed

### 2c. New file: `src/components/effects/EffectVisualizer.tsx`

Shared visualizer components. All use `<canvas>` with imperative drawing for performance.

**Components:**

| Component | Props | Description |
|---|---|---|
| `EffectOscilloscope` | `pre, post, color` | Overlaid waveforms. Gray=input, accent=output. Triggered on zero-cross. |
| `EffectSpectrum` | `pre, post, color` | FFT spectrum. Gray fill=input, colored line=output. Log frequency axis. |
| `WaveshaperCurve` | `type, params` | Static math — draws the actual transfer function. No analyser needed. |
| `GainReductionMeter` | `pre, post` | Vertical GR bar (red, right side) + L/R level rails (green, left). |
| `MiniOutputMeter` | `post, color, grMode` | 48×16px RMS bar for chain card. grMode=true for compressor (shows GR instead). |

### 2d. Effect-type → Visualizer mapping

| Effect(s) | Expanded | Mini card |
|---|---|---|
| Distortion, Chebyshev, TapeSaturation | `WaveshaperCurve` | `MiniOutputMeter` |
| BitCrusher | `EffectOscilloscope` (staircase shows quantization) | `MiniOutputMeter` |
| Compressor, SidechainCompressor | `GainReductionMeter` | `MiniOutputMeter` (grMode) |
| EQ3, Filter, DubFilter, AutoFilter, AutoWah, MoogFilter | `EffectSpectrum` | `MiniOutputMeter` |
| Reverb, JCReverb, MVerb, SpringReverb | `EffectOscilloscope` | `MiniOutputMeter` |
| Delay, FeedbackDelay, PingPongDelay, SpaceEcho, RETapeEcho, SpaceyDelayer | `EffectOscilloscope` | `MiniOutputMeter` |
| Everything else (Chorus, Phaser, Tremolo, Leslie, VinylNoise, etc.) | `EffectOscilloscope` | `MiniOutputMeter` |

### 2e. WaveshaperCurve — math-only, no analyser

Drawn once (or on param change), not animated. Input x-axis = -1..+1, output y-axis = transfer(x):

- **Distortion**: `tanh(drive * x)` normalized
- **Chebyshev**: Chebyshev polynomial `T_n(x)` for order n — drawn directly in JS
- **TapeSaturation**: `sign(x) * tanh(|x| * drive)` odd-harmonic curve
- **BitCrusher**: staircase — `round(x * 2^bits) / 2^bits`

### 2f. Mini meter on chain card (`MasterEffectsPanel.tsx`)

Add a 48×16px canvas to `SortableEffectItem` between the effect name and WET slider. The component reads post-analyser RMS each frame and draws a simple horizontal bar. For compressor: bar is red and shows GR amount instead of level. Flat line when effect is disabled.

---

## Part 3: File Changes

| File | Change |
|---|---|
| `src/engine/ToneEngine.ts` | Add `masterEffectAnalysers` map; create/dispose pre+post taps in `rebuildMasterEffects`; add `getMasterEffectAnalysers()` |
| `src/hooks/useEffectAnalyser.ts` | New — rAF hook |
| `src/components/effects/EffectVisualizer.tsx` | New — all visualizer components |
| `src/components/effects/VisualEffectEditors.tsx` | Add visualizer above controls in each editor |
| `src/components/effects/MasterEffectsPanel.tsx` | Add `MiniOutputMeter` to `SortableEffectItem` |
| `src/engine/InstrumentFactory.ts` | Fix Chebyshev default order (50→2), document BitCrusher async init |

---

## Part 4: Non-goals

- Instrument effects (master chain only for now)
- Instrument-level visualizers
- WAM/neural effect visualizers (complex signal routing)
- Spectrum for delay/reverb (oscilloscope is more informative for time-based effects)
- Export/screenshot of visualizer
