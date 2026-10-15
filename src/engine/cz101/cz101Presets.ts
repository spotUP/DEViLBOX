/**
 * CZ-101 factory bank: one neutral Init patch. It is the synth's default sound and the
 * source patch of the SysEx encoder/decoder round trip. Every other sound comes from the
 * user: Casio CZ single-patch .syx dumps imported into the User list (cz101Sysex.ts).
 *
 * Envelopes are authored in seconds and converted to chip rates here, so a patch
 * reads as a shape ("swell for 0.4 s, settle over 1 s") instead of rate numbers.
 * Levels are the panel's 0-99 scale (amplitude and waveform) or the chip's 6-bit
 * field (pitch).
 */
import { CZWaveform as W } from './cz101Types';
import type { CZEnvelopeStage, CZLine, CZPatch } from './cz101Types';

export interface CZPreset {
  patch: CZPatch;
}

const HOLD = 'hold' as const;
type Step = [seconds: number, level: number] | typeof HOLD;

/** Chip rate field whose step size moves a full-range envelope in `seconds`. */
export function rateForFullMove(seconds: number): number {
  const wanted = 833 / seconds; // amplitude steps per chip sample for a 127-unit move in `seconds`
  let best = 1;
  let bestError = Infinity;
  for (let rate = 1; rate < 128; rate++) {
    const step = (8 | (rate & 7)) << (rate >> 3);
    const error = Math.abs(Math.log(step / wanted));
    if (error < bestError) { bestError = error; best = rate; }
  }
  return best;
}

/** Amplitude or waveform envelope: each step reaches `level` in `seconds`; HOLD is the sustain point. */
function envelope(kind: 'amplitude' | 'waveform', steps: Step[]): CZEnvelopeStage[] {
  const span = kind === 'waveform' ? 0.5 : 1; // the waveform envelope's range is twice as long per unit
  let previous = 0;
  return steps.map((step) => {
    if (step === HOLD) return { rate: 0, level: previous };
    const [seconds, level] = step;
    const delta = Math.max(1, Math.abs(level - previous)) * 127 / 99;
    const full = (seconds * 127) / delta * span;
    previous = level;
    return { rate: rateForFullMove(Math.max(0.002, full)), level };
  });
}
const amp = (...steps: Step[]) => envelope('amplitude', steps);
const wave = (...steps: Step[]) => envelope('waveform', steps);

/**
 * Pitch envelope: offsets above the note, from 0. `field` is 0-63 in 6.25-cent
 * steps, or 2-semitone steps when `coarse`.
 */
function pitch(steps: [seconds: number, field: number, coarse?: boolean][]): CZEnvelopeStage[] {
  let previous = 0; // in 6.25-cent steps, the unit the chip's envelope runs in
  return steps.map(([seconds, field, coarse]) => {
    const distance = coarse ? field * 32 : field; // a coarse step is 32 fine steps
    const delta = Math.max(1, Math.abs(distance - previous));
    const wanted = (delta * 65536) / (Math.max(0.002, seconds) * 40000);
    let best = 1;
    let bestError = Infinity;
    for (let rate = 1; rate < 128; rate++) {
      const step = (8 | (rate & 7)) << (rate >> 3);
      const error = Math.abs(Math.log(step / wanted));
      if (error < bestError) { bestError = error; best = rate; }
    }
    previous = distance;
    return { rate: best, level: field, coarse };
  });
}

/**
 * Init: a plain sawtooth, fast attack, held at full level, quick release. The waveform
 * envelope holds a mid-bright level so the saw is not a pure tone.
 */
export const CZ101_PRESET_BANK: CZPreset[] = [
  {
    patch: {
      name: 'Init',
      line1: {
        waveform1: W.SAW,
        dcaEnvelope: amp([0.005, 99], HOLD, [0.15, 0]),
        dcwEnvelope: wave([0.005, 30], HOLD, [0.15, 30]),
      },
    },
  },
];

/** Names in bank order (instrument list, editor buttons). */
export const CZ101_PRESET_NAMES: string[] = CZ101_PRESET_BANK.map((entry) => entry.patch.name ?? '');

/** Patch by name; unknown names are a programming error in the caller. */
export function cz101PresetByName(name: string): CZPatch {
  const entry = CZ101_PRESET_BANK.find((candidate) => candidate.patch.name === name);
  if (!entry) throw new Error(`Unknown CZ-101 preset: ${name}`);
  return entry.patch;
}

/**
 * Editor knob values a preset implies. Oscillator knobs mirror the patch; the
 * envelope knobs are offsets from the patch, so they rest at their neutral value
 * (64) whatever preset is loaded.
 */
export function cz101PresetParameters(index: number): Record<string, number> {
  return { _program: index, ...cz101PatchParameters(CZ101_PRESET_BANK[index].patch) };
}

/** Editor knob values any patch implies (bank entry or imported user patch). */
export function cz101PatchParameters(patch: CZPatch): Record<string, number> {
  const first = patch.line1;
  return {
    waveform1: first.waveform1,
    waveform2: first.waveform2 ?? first.waveform1,
    window: first.window ?? 0,
    ring_mod: patch.ringMod ? 1 : 0,
    dcw_depth: CZ101_KNOB_NEUTRAL,
    dca_rate: CZ101_KNOB_NEUTRAL,
    dcw_rate: CZ101_KNOB_NEUTRAL,
    dco_rate: CZ101_KNOB_NEUTRAL,
    dco_depth: 0,
  };
}

/** Resting position of the envelope offset knobs. */
export const CZ101_KNOB_NEUTRAL = 64;

/** Editor knob values that modify the loaded preset (all optional: untouched = the preset's own). */
export interface CZKnobs {
  waveform1?: number;
  waveform2?: number;
  window?: number;
  ring_mod?: number;
  dcw_depth?: number;
  dca_rate?: number;
  dcw_rate?: number;
  dco_rate?: number;
  dco_depth?: number;
}

const clampRate = (rate: number) => Math.max(1, Math.min(127, Math.round(rate)));

function offsetRates(stages: CZEnvelopeStage[], knob: number | undefined): CZEnvelopeStage[] {
  const offset = (knob ?? CZ101_KNOB_NEUTRAL) - CZ101_KNOB_NEUTRAL;
  if (offset === 0) return stages;
  // rate 0 marks the sustain point and stays 0
  return stages.map((stage) => (stage.rate === 0 ? stage : { ...stage, rate: clampRate(stage.rate + offset) }));
}

function scaleLevels(stages: CZEnvelopeStage[], knob: number | undefined): CZEnvelopeStage[] {
  const octaves = ((knob ?? CZ101_KNOB_NEUTRAL) - CZ101_KNOB_NEUTRAL) / 32;
  if (octaves === 0) return stages;
  const scale = Math.pow(2, octaves);
  return stages.map((stage) => ({ ...stage, level: Math.min(99, Math.round(stage.level * scale)) }));
}

/**
 * The patch the editor knobs describe: the preset with its oscillator fields
 * overridden and its envelopes scaled. Pure; the bank entry is never modified.
 *  - dcw_depth: waveform envelope levels, one octave of scale per 32 steps
 *  - dca_rate / dcw_rate: added to every stage rate (+8 doubles the speed)
 *  - dco_depth > 0 replaces the pitch envelope with a drop of that many 6.25-cent
 *    steps falling at dco_rate; 0 keeps the preset's own
 */
export function applyCzKnobs(base: CZPatch, knobs: CZKnobs): CZPatch {
  const ring = knobs.ring_mod === undefined ? !!base.ringMod : knobs.ring_mod > 0.5;
  const twoLines = !!base.line2 || ring || !!base.noiseMode;
  const shape = (source: CZLine): CZLine => ({
    ...source,
    dcaEnvelope: offsetRates(source.dcaEnvelope, knobs.dca_rate),
    dcwEnvelope: offsetRates(scaleLevels(source.dcwEnvelope, knobs.dcw_depth), knobs.dcw_rate),
    dcoEnvelope: knobs.dco_depth && knobs.dco_depth > 0
      ? pitch([[0.002, Math.min(63, Math.round(knobs.dco_depth))], [0, 0]]).map((stage, i) =>
        (i === 1 ? { ...stage, rate: clampRate(knobs.dco_rate ?? CZ101_KNOB_NEUTRAL) } : stage))
      : source.dcoEnvelope,
  });
  const line1 = shape({
    ...base.line1,
    waveform1: (knobs.waveform1 ?? base.line1.waveform1) as CZLine['waveform1'],
    waveform2: (knobs.waveform2 ?? base.line1.waveform2) as CZLine['waveform2'],
    window: (knobs.window ?? base.line1.window) as CZLine['window'],
  });
  const line2 = twoLines ? shape(base.line2 ?? { ...base.line1 }) : undefined;
  return { ...base, line1, line2, ringMod: ring, ringOnly: ring && base.ringOnly };
}
