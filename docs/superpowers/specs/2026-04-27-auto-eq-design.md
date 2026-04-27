---
date: 2026-04-27
topic: auto-eq
tags: [dub, eq, analysis, neural, fil4]
status: final
---

# Auto EQ — Design Spec

## Summary

When the dub bus is active and audio analysis completes, automatically compute and apply an intelligent EQ curve to the Fil4 return EQ (`returnEQ` in DubBus). The curve is built in three stages: genre baseline → instrument modulation → spectral compensation. For 8-bit/lo-fi source material, a neural enhancement stage inserts before the dub bus signal chain to bring samples up to full fidelity.

The auto-EQ fires once per song analysis and re-fires when the song changes. The result is a "great start" the engineer tunes from — `autoEqStrength` (default 0.85) blends the curve toward flat, leaving headroom for manual adjustment.

---

## Processing Pipeline (dub bus, when active)

```
Channel sends
  → [DC Offset Removal + Denoise, offline on sample buffers if 8-bit detected]
  → [NeuralEnhancer AudioWorklet, real-time if 8-bit detected]
  → Spectral Exciter (real-time, all sources, gentle harmonic brightening)
  → Transient Sharpening (real-time, all sources, punch/snap)
  → HPF → TapeSat → Echo / Spring → Fil4 return EQ (auto-EQ applied here)
  → Return gain → Master
```

---

## File Layout

```
src/engine/dub/AutoEQ.ts               # New — computeAutoEQ() + genre maps + spectral + detectLoFi
src/engine/dub/DubBusEnhancer.ts       # New — offline DC+denoise pipeline + real-time exciter/sharpener worklets
src/engine/dub/DubBus.ts               # Modify — subscribe to analysis store, apply auto-EQ + enhancer chain
src/types/dub.ts                       # Modify — autoEqStrength, autoEqLastGenre
src/components/effects/Fil4EqPanel.tsx # Modify — slim info bar above curve
```

---

## Stage 1 — Genre Baseline

`computeGenreBaseline(genre, energy, danceability) → Partial<Fil4Params>`

Maps `GenreResult.primary` → a base EQ curve targeting deep bass, clear treble, and punch:

| Genre | Sub shelf | Low-mid cut | Presence boost | Air shelf | HP |
|---|---|---|---|---|---|
| Reggae / Dub | +4 dB @ 70 Hz, Q 0.8 | −3 dB @ 320 Hz, Q 1.2 | +2 dB @ 3 kHz, BW 1.5 | +2.5 dB @ 10 kHz, Q 0.8 | 28 Hz |
| Electronic / Dance | +3.5 dB @ 65 Hz, Q 0.8 | −2 dB @ 280 Hz, Q 1.0 | +1.5 dB @ 4 kHz, BW 1.5 | +3 dB @ 12 kHz, Q 0.8 | 25 Hz |
| Hip-Hop | +4 dB @ 75 Hz, Q 0.8 | −2.5 dB @ 300 Hz, Q 1.1 | +2 dB @ 3.5 kHz, BW 1.5 | +2 dB @ 12 kHz, Q 0.8 | 30 Hz |
| Rock | +2 dB @ 80 Hz, Q 0.9 | −1.5 dB @ 350 Hz, Q 0.9 | +3 dB @ 3.5 kHz, BW 1.2 | +2 dB @ 10 kHz, Q 0.8 | 35 Hz |
| Jazz | +1.5 dB @ 80 Hz, Q 0.9 | 0 | +1 dB @ 5 kHz, BW 2.0 | +1.5 dB @ 12 kHz, Q 0.8 | 25 Hz |
| Classical | +1 dB @ 80 Hz, Q 0.9 | 0 | +0.5 dB @ 6 kHz, BW 2.0 | +2 dB @ 14 kHz, Q 0.8 | 20 Hz |
| Blues / Soul / R&B | +2.5 dB @ 75 Hz, Q 0.8 | −2 dB @ 300 Hz, Q 1.0 | +2 dB @ 3 kHz, BW 1.5 | +2 dB @ 10 kHz, Q 0.8 | 28 Hz |
| Unknown | +2 dB @ 70 Hz, Q 0.8 | −1 dB @ 300 Hz, Q 1.0 | +1.5 dB @ 3 kHz, BW 1.5 | +2 dB @ 10 kHz, Q 0.8 | 25 Hz |

**Energy scaling:** `gain_applied = base_gain × (0.85 + energy × 0.3)` — high-energy tracks get up to 15% more on sub and presence; low-energy tracks get softer curves.

**Danceability scaling:** high danceability (+0.1 dB sub, +0.1 dB presence) — reinforces groove.

---

## Stage 2 — Instrument Modulation

`computeInstrumentModulation(hints: InstrumentHints) → EQDelta`

Additive deltas applied on top of the genre baseline:

| CED hint | Sub shelf delta | Presence delta | Air shelf delta | Other |
|---|---|---|---|---|
| `hasBass` | +0.5 dB | 0 | 0 | HP tighten to 35 Hz |
| `hasPercussion` | 0 | +1 dB | 0 | HP tighten |
| `hasSynth` | 0 | 0 | +1 dB @ 12 kHz | |
| `hasVoice` | 0 | −0.5 dB | 0 | avoid nasal |
| `hasStrings` or `hasBrass` | 0 | +0.5 dB @ 5 kHz | +0.5 dB | |
| `hasGuitar` | +0.5 dB @ 80 Hz | +0.5 dB @ 3.5 kHz | 0 | |
| `hasPiano` | 0 | +0.5 dB @ 4 kHz | +1 dB | |

---

## Stage 3 — Spectral Compensation

`computeSpectralCompensation(frequencyPeaks: number[][], sampleRate: number) → EQDelta`

Uses `WorkerAnalysisResult.frequencyPeaks` (2D array of [frequency, magnitude] pairs):

1. Build a smoothed magnitude envelope from the peaks
2. Compare against a target "flat but musical" reference curve
3. For each region where actual energy is ≥ 3 dB above reference → place narrow parametric cut (Q 2.0, max −2 dB)
4. For each region where actual energy is ≥ 3 dB below reference → small boost (max +1.5 dB)
5. All corrections clamped to ±2 dB so spectral stage refines, never dominates
6. Map each correction region to the nearest available Fil4 parametric band (P1–P4)

The spectral stage primarily affects P1–P4 parametric bands; HP/shelves come from Stages 1–2.

---

## Stage 4 — Lo-fi Restoration + Signal Enhancement

`detectLoFiSources(editorMode, instruments) → boolean`

Detection — either condition triggers enhancement:
1. `editorMode` is a chip format: `c64sid`, `sidfactory2`, `cheesecutter`, `goattracker`, `furnace` (with chip chips), `hively`, `klys`, `sc68`, `uade`, or any format in the chip-dump group (`NSF`, `SID`, `SAP`, `VGM`, `YM`)
2. Any instrument has `synthType` in the deterministic lo-fi set: `C64SID`, `GTUltraSynth`, `SF2Synth`, `HivelySynth`, `KlysSynth`, `ChipSynth`, `SidMonSynth`, `SidMon1Synth`, `FCSynth`, `FredSynth`, `TFMXSynth`, `Furnace`, `ChiptuneModule`, and other WASM replayer types from `synthTypeToInstrumentType()` → `'synthesizer'`

**4a — DC Offset Removal (offline, 8-bit only):**
When lo-fi sources detected, run `WaveformProcessor.removeDCOffset()` (src/lib/audio/WaveformProcessor.ts:343) on each affected instrument's sample buffer at song load / dub bus enable. Applied once, result cached in instrument store. Removes the thump/click DC bias common in chip audio.

**4b — Denoise (offline, 8-bit only):**
Run `SampleProcessing.denoise()` (src/utils/audio/SampleProcessing.ts:84) on each affected sample buffer. Strips quantization noise. Applied offline alongside DC removal.

**4c — Neural Enhancer (real-time AudioWorklet, 8-bit only):**
Insert a `NeuralEffectWrapper` using the existing sample-upscaling / "resurrect" model into the dub bus input node when lo-fi is detected. Zero-overhead passthrough when not needed. Model sourced from `NeuralEnhancerWorker.ts` — same as the sample editor's enhancement path.

**4d — Spectral Exciter (real-time, all sources):**
Insert `SampleProcessing.spectralExciter()` logic as a lightweight AudioWorklet on the dub bus input — HPF-filtered waveshaper + 8 kHz air boost. Adds harmonic brightness complementing the auto-EQ high shelf. Uses a gentle drive (0.15) so it enhances rather than saturates. Applied to ALL sources, not just lo-fi.

**4e — Transient Sharpening (real-time, all sources):**
Insert `SampleProcessing.sharpenTransients()` logic as a lightweight AudioWorklet on the dub bus input — HPF isolation + 3 kHz presence boost. Adds punch/snap before the echo chain. Gentle (gain 1.2×, not aggressive sharpening). Applied to ALL sources.

---

## `computeAutoEQ` — Top-Level Function

```typescript
// src/engine/dub/AutoEQ.ts

export interface AutoEQResult {
  params: Partial<Fil4Params>;
  genre: string;           // label shown in UI
  loFiDetected: boolean;   // whether neural enhancer was activated
}

export function computeAutoEQ(
  analysis: WorkerAnalysisResult,
  hints: InstrumentHints,
  strength: number,   // 0–1, default 0.85
): AutoEQResult {
  const baseline  = computeGenreBaseline(analysis.genre, analysis.genre.energy, analysis.genre.danceability);
  const instDelta = computeInstrumentModulation(hints);
  const specDelta = computeSpectralCompensation(analysis.frequencyPeaks ?? [], 44100);

  const merged = mergeEQDeltas(baseline, instDelta, specDelta);
  const scaled = scaleToStrength(merged, strength);  // lerp each gain toward 0 dB

  return {
    params: scaled,
    genre: analysis.genre.primary || 'Unknown',
    loFiDetected: false,  // set by DubBus after detectLoFiSources()
  };
}
```

All three stage functions are pure — no side effects, no store access. Tests are straightforward.

---

## DubBus Integration

**Trigger (in DubBus constructor / `play()` hook):**
```typescript
// Subscribe to analysis store — fires when analysisState transitions to 'ready'
this._autoEQUnsub = useTrackerAnalysisStore.subscribe((state) => {
  if (state.analysisState === 'ready' && state.currentAnalysis && this.settings.enabled) {
    this._applyAutoEQ(state.currentAnalysis);
  }
});
```

**`_applyAutoEQ(analysis: WorkerAnalysisResult)`:**
1. Build `hints` from `useInstrumentTypeStore.getState()` + `buildInstrumentHints()`
2. Call `computeAutoEQ(analysis, hints, this.settings.autoEqStrength)`
3. Apply each band to `this.returnEQ` via `setLowShelf`, `setHighShelf`, `setBand`, `setHP`
4. Detect lo-fi sources via `detectLoFiSources(editorMode, instruments)` — insert/remove neural enhancer
5. Update `this.settings.autoEqLastGenre`
6. Fire notification: `"Auto EQ — Reggae/Dub · 85%"`

**Cleanup in `dispose()`:** call `this._autoEQUnsub?.()`.

---

## `dub.ts` Additions

```typescript
// In DubBusSettings interface:
autoEqStrength: number;    // 0–1 blend, default 0.85
autoEqLastGenre: string;   // last applied genre label, read-only mirror

// In DEFAULT_DUB_BUS:
autoEqStrength: 0.85,
autoEqLastGenre: '',
```

---

## Fil4EqPanel UI Addition

A slim info bar (one row, 24px tall) above the curve canvas in `Fil4EqPanel.tsx`:

```
⚡ Auto EQ  Reggae/Dub · 85%   [━━━━━━━━━━░░░░░]  strength slider
```

- Shows `autoEqLastGenre` from DubBus settings (empty when no analysis yet)
- Compact `<input type="range">` for strength (0–1), updates `setDubBus({ autoEqStrength: v })`
- When `autoEqLastGenre` is empty, shows: `⚡ Auto EQ  analyzing…`
- Lo-fi badge: if neural enhancer active, shows `🎛 Enhanced` next to genre label

---

## Neural Model

The neural sample-upscaling model already exists in the app. In `DubBus._applyAutoEQ()`, when lo-fi is detected:
```typescript
const { NeuralEffectWrapper } = await import('../NeuralEffectWrapper');
const modelIndex = NEURAL_MODEL_INDEX_SAMPLE_UPSCALE;  // same as sample editor
this._neuralEnhancer = new NeuralEffectWrapper({ modelIndex, wet: 0.7 });
// Insert between this.input and this.hpf in the audio graph
```

When lo-fi is no longer detected (song changes to non-chip format):
```typescript
this._neuralEnhancer?.dispose();
this._neuralEnhancer = null;
```

---

## Testing

**Automated:**
- Unit tests for `computeAutoEQ`: given a reggae analysis + hasBass/hasPercussion hints → verify expected band gains and HP frequency
- Unit tests for `computeGenreBaseline`: all 8 genre branches produce valid `Fil4Params`
- Unit tests for `computeSpectralCompensation`: flat peaks → no compensation; pile-up at 300 Hz → cut applied; each correction clamped to ±2 dB
- Unit tests for `detectLoFiSources`: c64sid → true; XM → false; instruments with C64SID synthType → true

**Manual:**
- Load `world class dub.mod` (reggae) → dub bus enables → analysis completes → Fil4EqPanel shows "Auto EQ Reggae/Dub · 85%", sub shelf and presence visible on curve
- Load a C64 SID tune → neural enhancer badge appears
- Drag strength to 0% → curve goes flat; drag to 100% → full computed curve
- Move a band knob manually → curve updates immediately (auto-EQ result stays in Fil4EqEffect state, manual tweaks layer on top)
- Load a new song → old auto-EQ clears, new analysis fires, new curve applied

---

## Open Questions (resolved)

- Apply automatically: ✅ yes, no toggle
- Strength control: ✅ 0–1, default 0.85
- Neural enhancement: ✅ 8-bit/lo-fi sources only
- All three stages combined: ✅ genre + instrument + spectral
