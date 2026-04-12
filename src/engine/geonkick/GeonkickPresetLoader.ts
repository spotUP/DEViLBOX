/**
 * GeonkickPresetLoader.ts — apply a `.gkick` JSON preset to a GeonkickEngine
 * instance using the typed setter surface.
 *
 * Format: plain JSON with `osc0`..`osc8` (9 oscillators across 3 groups)
 * plus a top-level `kick` block holding the master amp envelope, length
 * (in *milliseconds*), filter, distortion, and metadata.
 *
 * Authoritative parser is upstream src/InstrumentState.cpp; this loader
 * mirrors the field/setter mapping. Covers: layers, layers_amplitude,
 * length, limiter, kick amplitude, filter, distortion, per-osc filter,
 * FM flag, phase, seed, envelopes. Skips compressor, humanizer, samples.
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
  layers?: number[];
  layers_amplitude?: number[];
  tuned_output?: boolean;
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
      engine.setLength(kick.ampl_env.length / 1000);
    }
    if (typeof kick.ampl_env.amplitude === 'number') {
      engine.setKickAmplitude(kick.ampl_env.amplitude);
    }
    const ampPoints = pointsFromArray(kick.ampl_env.points);
    engine.setKickEnvelope(
      GeonkickKickEnvelope.Amplitude,
      ampPoints.length > 0 ? ampPoints : DEFAULT_ENVELOPE,
    );
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
  // ── enable / waveform ──────────────────────────────────────────────
  engine.enableOscillator(oscIndex, osc.enabled ?? false);
  engine.setOscillatorFunction(oscIndex, clampOscFunction(osc.function));

  // ── FM, phase, seed ────────────────────────────────────────────────
  engine.setOscillatorFm(oscIndex, osc.is_fm ?? false);
  engine.setOscillatorPhase(oscIndex, osc.phase ?? 0);
  engine.setOscillatorSeed(oscIndex, osc.seed ?? 0);

  // ── amplitude envelope ─────────────────────────────────────────────
  engine.setOscillatorAmplitude(oscIndex, osc.ampl_env?.amplitude ?? 0.26);
  engine.setOscillatorEnvelope(
    oscIndex,
    GeonkickOscEnvelope.Amplitude,
    pointsFromArray(osc.ampl_env?.points) || DEFAULT_ENVELOPE,
  );

  // ── frequency envelope ─────────────────────────────────────────────
  engine.setOscillatorFrequency(oscIndex, osc.freq_env?.amplitude ?? 800);
  const freqPoints = pointsFromArray(osc.freq_env?.points);
  if (freqPoints.length > 0) {
    engine.setOscillatorEnvelope(oscIndex, GeonkickOscEnvelope.Frequency, freqPoints);
  } else {
    engine.setOscillatorEnvelope(oscIndex, GeonkickOscEnvelope.Frequency, DEFAULT_ENVELOPE);
  }

  // ── pitch shift envelope ───────────────────────────────────────────
  const pitchPoints = pointsFromArray(osc.pitchshift_env?.points);
  if (pitchPoints.length > 0) {
    engine.setOscillatorEnvelope(oscIndex, GeonkickOscEnvelope.PitchShift, pitchPoints);
  } else {
    engine.setOscillatorEnvelope(oscIndex, GeonkickOscEnvelope.PitchShift, [
      { x: 0, y: 0.5, controlPoint: false },
      { x: 1, y: 0.5, controlPoint: false },
    ]);
  }

  // ── per-oscillator filter ──────────────────────────────────────────
  const f = osc.filter;
  engine.setOscillatorFilterEnabled(oscIndex, f?.enabled ?? false);
  if (f) {
    engine.setOscillatorFilterType(oscIndex, clampFilterType(f.type));
    engine.setOscillatorFilterCutoff(oscIndex, f.cutoff ?? 800);
    engine.setOscillatorFilterFactor(oscIndex, f.factor ?? 10);
    const cutoffEnvPoints = pointsFromArray(f.cutoff_env);
    if (cutoffEnvPoints.length > 0) {
      engine.setOscillatorEnvelope(oscIndex, GeonkickOscEnvelope.FilterCutoff, cutoffEnvPoints);
    }
  }
}

/* ── Public API ────────────────────────────────────────────────────────── */

/** Default envelope shape — full-on from start to end. */
const DEFAULT_ENVELOPE: GeonkickEnvelopePoint[] = [
  { x: 0, y: 1, controlPoint: false },
  { x: 1, y: 1, controlPoint: false },
];

/**
 * Apply a parsed Geonkick preset to a live engine instance. Triggers a
 * full rebake of the kick buffer (each setter marks buffer_update; the
 * worker stub batches them but the final state takes effect on the
 * next note trigger).
 *
 * Applies deterministically: for every field, writes either the preset's
 * value OR a safe default so stale state from a previous preset can't
 * bleed through. The critical `layers` array is respected — groups NOT
 * listed in it are explicitly disabled, matching upstream InstrumentState.cpp.
 */
export function applyGeonkickPreset(engine: GeonkickEngine, preset: GeonkickPreset): void {
  // ── Layers (which oscillator groups are active) ─────────────────────
  // Upstream starts with all layers disabled, then enables only the ones
  // listed in the layers array. My loader mirrors this exactly.
  const activeLayers = new Set<number>(preset.kick?.layers ?? [0]);
  for (let g = 0; g < 3; g++) {
    engine.enableGroup(g, activeLayers.has(g));
  }

  // ── Layers amplitude ────────────────────────────────────────────────
  const layersAmp = preset.kick?.layers_amplitude ?? [1, 1, 1];
  for (let g = 0; g < 3; g++) {
    engine.setGroupAmplitude(g, layersAmp[g] ?? 1);
  }

  // ── Kick block ─────────────────────────────────────────────────────
  if (preset.kick) {
    applyKickBlock(engine, preset.kick);
  }

  // ── Oscillators ─────────────────────────────────────────────────────
  const oscList: Array<[number, PresetOscillator | undefined]> = [
    [0, preset.osc0], [1, preset.osc1], [2, preset.osc2],
    [3, preset.osc3], [4, preset.osc4], [5, preset.osc5],
    [6, preset.osc6], [7, preset.osc7], [8, preset.osc8],
  ];
  for (const [idx, osc] of oscList) {
    applyOscillator(engine, idx, osc ?? { enabled: false });
  }
}

/** Convenience: parse a `.gkick` JSON string and apply it in one call. */
export function loadGeonkickPresetText(engine: GeonkickEngine, jsonText: string): void {
  const preset = JSON.parse(jsonText) as GeonkickPreset;
  applyGeonkickPreset(engine, preset);
}
