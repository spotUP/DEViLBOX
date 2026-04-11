/**
 * GeonkickPresetLoader.ts — apply a `.gkick` JSON preset to a GeonkickEngine
 * instance using the typed setter surface.
 *
 * Format: plain JSON with `osc0`..`osc8` (9 oscillators across 3 groups)
 * plus a top-level `kick` block holding the master amp envelope, length
 * (in *milliseconds*), filter, distortion, and metadata.
 *
 * Authoritative parser is upstream src/InstrumentState.cpp; this loader
 * mirrors the field/setter mapping but skips the rare fields the bridge
 * doesn't expose yet (per-osc filter, compressor, humanizer, samples).
 */

import {
  GeonkickEngine,
  GeonkickFilterType,
  GeonkickKickEnvelope,
  GeonkickOscEnvelope,
  GeonkickOscFunction,
  type GeonkickEnvelopePoint,
} from './GeonkickEngine';

/* ── Preset JSON shape ─────────────────────────────────────────────────── */

interface PresetEnvelope {
  amplitude?: number;
  points?: number[][]; // each entry is [x, y]
}

interface PresetFilter {
  enabled?: boolean;
  type?: number;
  cutoff?: number;
  factor?: number;
  cutoff_env?: number[][];
}

interface PresetDistortion {
  enabled?: boolean;
  drive?: number;
  volume?: number;
  in_limiter?: number;
  drive_env?: number[][];
  volume_env?: number[][];
}

interface PresetOscillator {
  enabled?: boolean;
  is_fm?: boolean;
  function?: number;
  phase?: number;
  seed?: number;
  ampl_env?: PresetEnvelope;
  freq_env?: PresetEnvelope;
  pitchshift_env?: PresetEnvelope;
  filter?: PresetFilter;
}

interface PresetKick {
  name?: string;
  channel?: number;
  limiter?: number;
  ampl_env?: {
    length?: number;       // milliseconds
    amplitude?: number;
    points?: number[][];
  };
  filter?: PresetFilter;
  distortion?: PresetDistortion;
}

interface GeonkickPreset {
  kick?: PresetKick;
  osc0?: PresetOscillator;
  osc1?: PresetOscillator;
  osc2?: PresetOscillator;
  osc3?: PresetOscillator;
  osc4?: PresetOscillator;
  osc5?: PresetOscillator;
  osc6?: PresetOscillator;
  osc7?: PresetOscillator;
  osc8?: PresetOscillator;
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function pointsFromArray(arr?: number[][]): GeonkickEnvelopePoint[] {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  return arr
    .filter((p) => Array.isArray(p) && p.length >= 2)
    .map((p) => ({ x: p[0], y: p[1], controlPoint: false }));
}

function clampFilterType(t: number | undefined): GeonkickFilterType {
  if (t === 1) return GeonkickFilterType.HighPass;
  if (t === 2) return GeonkickFilterType.BandPass;
  return GeonkickFilterType.LowPass;
}

function clampOscFunction(t: number | undefined): GeonkickOscFunction {
  // Geonkick valid range is 0..7; clamp anything else to sine.
  if (typeof t !== 'number' || t < 0 || t > 7) return GeonkickOscFunction.Sine;
  return (t | 0) as GeonkickOscFunction;
}

/* ── Apply functions ───────────────────────────────────────────────────── */

function applyKickBlock(engine: GeonkickEngine, kick: PresetKick): void {
  if (kick.ampl_env) {
    if (typeof kick.ampl_env.length === 'number') {
      // JSON length is in milliseconds; engine wants seconds.
      engine.setLength(kick.ampl_env.length / 1000);
    }
    const ampPoints = pointsFromArray(kick.ampl_env.points);
    if (ampPoints.length > 0) {
      engine.setKickEnvelope(GeonkickKickEnvelope.Amplitude, ampPoints);
    }
  }

  if (typeof kick.limiter === 'number') {
    engine.setLimiter(kick.limiter);
  }

  if (kick.filter) {
    if (typeof kick.filter.enabled === 'boolean') {
      engine.setFilterEnabled(kick.filter.enabled);
    }
    if (typeof kick.filter.type === 'number') {
      engine.setFilterType(clampFilterType(kick.filter.type));
    }
    if (typeof kick.filter.cutoff === 'number') {
      engine.setFilterCutoff(kick.filter.cutoff);
    }
    if (typeof kick.filter.factor === 'number') {
      engine.setFilterFactor(kick.filter.factor);
    }
    const cutoffPoints = pointsFromArray(kick.filter.cutoff_env);
    if (cutoffPoints.length > 0) {
      engine.setKickEnvelope(GeonkickKickEnvelope.FilterCutoff, cutoffPoints);
    }
  }

  if (kick.distortion) {
    if (typeof kick.distortion.enabled === 'boolean') {
      engine.setDistortionEnabled(kick.distortion.enabled);
    }
    if (typeof kick.distortion.drive === 'number') {
      engine.setDistortionDrive(kick.distortion.drive);
    }
    if (typeof kick.distortion.volume === 'number') {
      engine.setDistortionVolume(kick.distortion.volume);
    }
    const drivePoints = pointsFromArray(kick.distortion.drive_env);
    if (drivePoints.length > 0) {
      engine.setKickEnvelope(GeonkickKickEnvelope.DistortionDrive, drivePoints);
    }
    const volPoints = pointsFromArray(kick.distortion.volume_env);
    if (volPoints.length > 0) {
      engine.setKickEnvelope(GeonkickKickEnvelope.DistortionVolume, volPoints);
    }
  }
}

function applyOscillator(
  engine: GeonkickEngine,
  oscIndex: number,
  osc: PresetOscillator,
): void {
  if (typeof osc.enabled === 'boolean') {
    engine.enableOscillator(oscIndex, osc.enabled);
  }
  if (typeof osc.function === 'number') {
    engine.setOscillatorFunction(oscIndex, clampOscFunction(osc.function));
  }

  if (osc.ampl_env) {
    if (typeof osc.ampl_env.amplitude === 'number') {
      engine.setOscillatorAmplitude(oscIndex, osc.ampl_env.amplitude);
    }
    const points = pointsFromArray(osc.ampl_env.points);
    if (points.length > 0) {
      engine.setOscillatorEnvelope(oscIndex, GeonkickOscEnvelope.Amplitude, points);
    }
  }

  if (osc.freq_env) {
    if (typeof osc.freq_env.amplitude === 'number') {
      engine.setOscillatorFrequency(oscIndex, osc.freq_env.amplitude);
    }
    const points = pointsFromArray(osc.freq_env.points);
    if (points.length > 0) {
      engine.setOscillatorEnvelope(oscIndex, GeonkickOscEnvelope.Frequency, points);
    }
  }

  if (osc.pitchshift_env) {
    const points = pointsFromArray(osc.pitchshift_env.points);
    if (points.length > 0) {
      engine.setOscillatorEnvelope(oscIndex, GeonkickOscEnvelope.PitchShift, points);
    }
  }

  // Per-oscillator filter (osc.filter) is currently not exposed by the
  // bridge — the kick-level filter handles most preset behaviour. TODO:
  // wire gk_wasm_set_osc_filter_* if a preset audibly needs it.
}

/* ── Public API ────────────────────────────────────────────────────────── */

/**
 * Apply a parsed Geonkick preset to a live engine instance. Triggers a
 * full rebake of the kick buffer (each setter marks buffer_update; the
 * worker stub batches them but the final state takes effect on the
 * next note trigger).
 *
 * The loader does NOT reset the engine to defaults first — fields the
 * preset omits keep their current values. Call this on a freshly
 * created engine to get a deterministic result.
 */
export function applyGeonkickPreset(engine: GeonkickEngine, preset: GeonkickPreset): void {
  // Enable all 3 osc groups so the preset's per-oscillator enable flags
  // become the determining gate. gk_wasm_create only enables group 0.
  engine.enableGroup(0, true);
  engine.enableGroup(1, true);
  engine.enableGroup(2, true);

  if (preset.kick) {
    applyKickBlock(engine, preset.kick);
  }

  // Apply oscillators in 0..8 order. Geonkick's own JSON writes them
  // 8..0 but order doesn't matter for the setters.
  const oscList: Array<[number, PresetOscillator | undefined]> = [
    [0, preset.osc0], [1, preset.osc1], [2, preset.osc2],
    [3, preset.osc3], [4, preset.osc4], [5, preset.osc5],
    [6, preset.osc6], [7, preset.osc7], [8, preset.osc8],
  ];
  for (const [idx, osc] of oscList) {
    if (osc) applyOscillator(engine, idx, osc);
  }
}

/** Convenience: parse a `.gkick` JSON string and apply it in one call. */
export function loadGeonkickPresetText(engine: GeonkickEngine, jsonText: string): void {
  const preset = JSON.parse(jsonText) as GeonkickPreset;
  applyGeonkickPreset(engine, preset);
}
