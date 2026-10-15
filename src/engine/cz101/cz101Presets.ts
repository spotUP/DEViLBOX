/**
 * CZ-101 preset bank: the one source of truth for every sound the instrument list,
 * the editor's preset buttons and the synth's loadPreset() offer.
 *
 * Envelopes are authored in seconds and converted to chip rates here, so a preset
 * reads as a shape ("swell for 0.4 s, settle over 1 s") instead of rate numbers.
 * Levels are the panel's 0-99 scale (amplitude and waveform) or the chip's 6-bit
 * field (pitch).
 */
import { CZWaveform as W, CZWindow as Win } from './cz101Types';
import type { CZEnvelopeStage, CZLine, CZPatch } from './cz101Types';

export type CZPresetCategory =
  | 'Brass' | 'Strings' | 'Keys' | 'Organ' | 'Bells and Mallets' | 'Bass' | 'Lead'
  | 'Pad' | 'Pluck' | 'Percussion and Effects' | 'Ring Modulation';

export interface CZPreset {
  category: CZPresetCategory;
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

interface LineSpec {
  w1: CZWaveform;
  w2?: CZWaveform;
  window?: CZWindow;
  dca: CZEnvelopeStage[];
  dcw: CZEnvelopeStage[];
  dco?: CZEnvelopeStage[];
  detune?: number;
}
type CZWaveform = typeof W[keyof typeof W];
type CZWindow = typeof Win[keyof typeof Win];

function line(spec: LineSpec): CZLine {
  return {
    waveform1: spec.w1,
    waveform2: spec.w2,
    window: spec.window,
    dcaEnvelope: spec.dca,
    dcwEnvelope: spec.dcw,
    dcoEnvelope: spec.dco,
    detune: spec.detune,
  };
}

interface PresetSpec extends LineSpec {
  category: CZPresetCategory;
  name: string;
  line2?: LineSpec;
  octave?: number;
  ring?: boolean;
  ringOnly?: boolean;
  noise?: boolean;
}

function preset(spec: PresetSpec): CZPreset {
  return {
    category: spec.category,
    patch: {
      name: spec.name,
      line1: line(spec),
      line2: spec.line2 ? line(spec.line2) : undefined,
      octave: spec.octave,
      ringMod: spec.ring,
      ringOnly: spec.ringOnly,
      noiseMode: spec.noise,
    },
  };
}

/*
 * Register note: at low waveform depth the Double Sine waveform runs two cycles per
 * period, i.e. it sounds an octave above the note (measured); presets that use it
 * carry an octave offset of -1 relative to their intended register.
 */
export const CZ101_PRESET_BANK: CZPreset[] = [
  // ---- Brass: resonance sweeps open on the attack and settle ----
  preset({ category: 'Brass', name: 'Brass Section', w1: W.RESONANCE,
    dca: amp([0.06, 99], [0.3, 90], HOLD, [0.25, 0]),
    dcw: wave([0.08, 38], [0.5, 24], HOLD, [0.25, 4]) }),
  preset({ category: 'Brass', name: 'Muted Trumpet', w1: W.SAW, window: Win.SAW,
    dca: amp([0.03, 99], [0.2, 88], HOLD, [0.15, 0]),
    dcw: wave([0.04, 70], [0.25, 28], HOLD, [0.15, 5]) }),
  preset({ category: 'Brass', name: 'Synthesizer Brass', w1: W.SAW, w2: W.SAW_PULSE,
    dca: amp([0.09, 99], [0.4, 92], HOLD, [0.35, 0]),
    dcw: wave([0.12, 60], [0.6, 36], HOLD, [0.3, 6]),
    line2: { w1: W.SAW, dca: amp([0.09, 99], [0.4, 92], HOLD, [0.35, 0]), dcw: wave([0.12, 60], [0.6, 36], HOLD, [0.3, 6]), detune: 14 } }),
  preset({ category: 'Brass', name: 'Slow Horn', w1: W.SAW_PULSE, window: Win.TRAPEZOID,
    dca: amp([0.45, 99], [0.4, 90], HOLD, [0.5, 0]),
    dcw: wave([0.6, 45], [0.8, 22], HOLD, [0.4, 3]) }),
  preset({ category: 'Brass', name: 'Fanfare Stab', w1: W.PULSE,
    dca: amp([0.01, 99], [0.35, 55], [0.4, 0]),
    dcw: wave([0.01, 80], [0.3, 20], [0.4, 0]) }),

  // ---- Strings: slow attack, two detuned lines ----
  preset({ category: 'Strings', name: 'String Ensemble', w1: W.SAW,
    dca: amp([0.35, 95], HOLD, [0.6, 0]),
    dcw: wave([0.5, 34], HOLD, [0.6, 8]),
    line2: { w1: W.SAW, dca: amp([0.4, 95], HOLD, [0.6, 0]), dcw: wave([0.55, 34], HOLD, [0.6, 8]), detune: 9 } }),
  preset({ category: 'Strings', name: 'Slow Strings', w1: W.SAW_PULSE,
    dca: amp([1.1, 95], HOLD, [1.2, 0]),
    dcw: wave([1.4, 30], HOLD, [1.2, 6]),
    line2: { w1: W.SAW_PULSE, dca: amp([1.2, 95], HOLD, [1.2, 0]), dcw: wave([1.5, 30], HOLD, [1.2, 6]), detune: -11 } }),
  preset({ category: 'Strings', name: 'Pizzicato Strings', w1: W.SAW, window: Win.SAW, octave: 1,
    dca: amp([0.004, 99], [0.16, 0]),
    dcw: wave([0.004, 85], [0.1, 8]) }),
  preset({ category: 'Strings', name: 'Cello', w1: W.RESONANCE, octave: -1,
    dca: amp([0.18, 99], [0.3, 92], HOLD, [0.3, 0]),
    dcw: wave([0.25, 22], [0.5, 14], HOLD, [0.3, 2]) }),
  preset({ category: 'Strings', name: 'Chamber Violins', w1: W.DOUBLE_SINE, w2: W.SAW, window: Win.SAW, octave: -1,
    dca: amp([0.25, 96], HOLD, [0.5, 0]),
    dcw: wave([0.35, 55], [0.6, 40], HOLD, [0.4, 8]),
    line2: { w1: W.DOUBLE_SINE, w2: W.SAW, window: Win.SAW, dca: amp([0.28, 96], HOLD, [0.5, 0]), dcw: wave([0.38, 55], [0.6, 40], HOLD, [0.4, 8]), detune: 7 } }),

  // ---- Keys ----
  preset({ category: 'Keys', name: 'Electric Piano', w1: W.SAW_PULSE,
    dca: amp([0.005, 99], [1.6, 20], [0.4, 0]),
    dcw: wave([0.005, 55], [0.9, 8], [0.4, 0]) }),
  preset({ category: 'Keys', name: 'Tine Piano', w1: W.DOUBLE_SINE, octave: -1,
    dca: amp([0.004, 99], [2.4, 18]),
    dcw: wave([0.004, 70], [0.5, 12], [1.5, 2]) }),
  preset({ category: 'Keys', name: 'Clavichord', w1: W.SQUARE, window: Win.TRAPEZOID, octave: 1,
    dca: amp([0.003, 99], [0.5, 25], [0.4, 0]),
    dcw: wave([0.003, 90], [0.25, 18], [0.4, 0]) }),
  preset({ category: 'Keys', name: 'Harpsichord', w1: W.SAW_PULSE, w2: W.PULSE,
    dca: amp([0.003, 99], [0.7, 30], [0.1, 0]),
    dcw: wave([0.003, 95], [0.6, 55], [0.1, 0]) }),
  preset({ category: 'Keys', name: 'Digital Piano', w1: W.RESONANCE, window: Win.SAW,
    dca: amp([0.004, 99], [2.0, 15], [0.4, 0]),
    dcw: wave([0.004, 32], [0.4, 8], [1.5, 1]) }),

  // ---- Organ: constant amplitude, fixed timbres ----
  preset({ category: 'Organ', name: 'Pipe Organ', w1: W.SQUARE, w2: W.DOUBLE_SINE, window: Win.TRIANGLE, octave: -1,
    dca: amp([0.03, 96], HOLD, [0.08, 0]),
    dcw: wave([0.03, 40], HOLD, [0.08, 0]) }),
  preset({ category: 'Organ', name: 'Reed Organ', w1: W.PULSE, window: Win.DOUBLE_SAW,
    dca: amp([0.05, 94], HOLD, [0.1, 0]),
    dcw: wave([0.05, 96], HOLD, [0.1, 40]) }),
  preset({ category: 'Organ', name: 'Drawbar Organ', w1: W.SQUARE, w2: W.DOUBLE_SINE, octave: 1,
    dca: amp([0.01, 96], HOLD, [0.04, 0]),
    dcw: wave([0.01, 30], HOLD, [0.04, 30]) }),
  preset({ category: 'Organ', name: 'Church Organ', w1: W.RESONANCE, octave: -1,
    dca: amp([0.08, 96], HOLD, [0.5, 0]),
    dcw: wave([0.08, 14], HOLD, [0.5, 6]) }),

  // ---- Bells and Mallets ----
  preset({ category: 'Bells and Mallets', name: 'Glass Bell', w1: W.RESONANCE, octave: 1,
    dca: amp([0.003, 99], [3.0, 5]),
    dcw: wave([0.002, 99], [0.15, 18], [0.8, 2]) }),
  preset({ category: 'Bells and Mallets', name: 'Tubular Bell', w1: W.RESONANCE, window: Win.SAW,
    dca: amp([0.002, 99], [4.0, 5]),
    dcw: wave([0.002, 99], [0.15, 18], [0.8, 2]) }),
  preset({ category: 'Bells and Mallets', name: 'Marimba', w1: W.SAW_PULSE, octave: 1,
    dca: amp([0.003, 99], [0.9, 0]),
    dcw: wave([0.002, 99], [0.15, 18], [0.8, 2]) }),
  preset({ category: 'Bells and Mallets', name: 'Vibraphone', w1: W.RESONANCE, window: Win.TRIANGLE,
    dca: amp([0.003, 96], [3.2, 10]),
    dcw: wave([0.002, 99], [0.15, 18], [0.8, 2]) }),
  preset({ category: 'Bells and Mallets', name: 'Music Box', w1: W.SAW, octave: 1,
    dca: amp([0.002, 99], [1.2, 0]),
    dcw: wave([0.002, 99], [0.12, 10], [0.5, 1]) }),
  preset({ category: 'Bells and Mallets', name: 'Steel Drum', w1: W.SAW, ring: true, ringOnly: true,
    dca: amp([0.002, 99], [3.4, 0]),
    dcw: wave([0.002, 99], [0.12, 40], [0.3, 1]),
    dco: pitch([[0.001, 12], [0.05, 0]]),
    line2: { w1: W.SAW, detune: 730, dca: amp([0.002, 99], [3.4, 0]), dcw: wave([0.002, 99], [0.12, 40], [0.3, 1]) } }),
  // ---- Bass ----
  preset({ category: 'Bass', name: 'Synthesizer Bass', w1: W.SQUARE, octave: -1,
    dca: amp([0.004, 99], [0.15, 90], HOLD, [0.12, 0]),
    dcw: wave([0.004, 60], [0.3, 28], HOLD, [0.12, 5]) }),
  preset({ category: 'Bass', name: 'Rubber Bass', w1: W.RESONANCE, octave: -1,
    dca: amp([0.004, 99], [0.5, 40], [0.2, 0]),
    dcw: wave([0.004, 35], [0.18, 3], [0.2, 0]) }),
  preset({ category: 'Bass', name: 'Fretless Bass', w1: W.SAW, window: Win.SAW, octave: -1,
    dca: amp([0.02, 99], [0.4, 80], HOLD, [0.3, 0]),
    dcw: wave([0.02, 50], [0.5, 12], HOLD, [0.3, 0]) }),
  preset({ category: 'Bass', name: 'Pulse Bass', w1: W.DOUBLE_PULSE, octave: -1,
    dca: amp([0.003, 99], [0.2, 92], HOLD, [0.1, 0]),
    dcw: wave([0.003, 80], [0.4, 40], HOLD, [0.1, 20]) }),
  preset({ category: 'Bass', name: 'Acid Bass', w1: W.RESONANCE, octave: -1,
    dca: amp([0.003, 99], HOLD, [0.08, 0]),
    dcw: wave([0.003, 80], [0.22, 12], HOLD, [0.08, 0]) }),
  preset({ category: 'Bass', name: 'Sub Bass', w1: W.SAW, octave: -2,
    dca: amp([0.02, 99], HOLD, [0.15, 0]),
    dcw: wave([0.02, 3], HOLD, [0.15, 0]) }),

  // ---- Lead ----
  preset({ category: 'Lead', name: 'Square Lead', w1: W.SQUARE,
    dca: amp([0.01, 98], HOLD, [0.12, 0]),
    dcw: wave([0.01, 85], [0.4, 55], HOLD, [0.12, 25]) }),
  preset({ category: 'Lead', name: 'Sawtooth Lead', w1: W.SAW, w2: W.SAW_PULSE,
    dca: amp([0.01, 98], HOLD, [0.15, 0]),
    dcw: wave([0.01, 99], [0.6, 70], HOLD, [0.15, 30]),
    line2: { w1: W.SAW, dca: amp([0.01, 98], HOLD, [0.15, 0]), dcw: wave([0.01, 99], [0.6, 70], HOLD, [0.15, 30]), detune: 6 } }),
  preset({ category: 'Lead', name: 'Resonant Lead', w1: W.RESONANCE, octave: 1,
    dca: amp([0.01, 98], HOLD, [0.15, 0]),
    dcw: wave([0.01, 20], [0.9, 48], HOLD, [0.15, 10]) }),
  preset({ category: 'Lead', name: 'Whistle', w1: W.DOUBLE_SINE,
    dca: amp([0.12, 94], HOLD, [0.2, 0]),
    dcw: wave([0.15, 6], HOLD, [0.2, 0]),
    dco: pitch([[0.5, 3], [0.3, 0]]) }),
  preset({ category: 'Lead', name: 'Pulse Lead', w1: W.PULSE, window: Win.PULSE, octave: 1,
    dca: amp([0.01, 98], HOLD, [0.1, 0]),
    dcw: wave([0.01, 50], [0.3, 95], HOLD, [0.1, 60]) }),

  // ---- Pad ----
  preset({ category: 'Pad', name: 'Digital Pad', w1: W.SAW_PULSE,
    dca: amp([0.8, 92], HOLD, [1.4, 0]),
    dcw: wave([1.4, 48], [1.5, 20], HOLD, [1.4, 4]),
    line2: { w1: W.SAW, dca: amp([0.9, 92], HOLD, [1.4, 0]), dcw: wave([1.6, 48], [1.5, 20], HOLD, [1.4, 4]), detune: 12 } }),
  preset({ category: 'Pad', name: 'Warm Pad', w1: W.DOUBLE_SINE, window: Win.TRAPEZOID, octave: -1,
    dca: amp([1.0, 90], HOLD, [1.6, 0]),
    dcw: wave([1.2, 24], HOLD, [1.6, 5]) }),
  preset({ category: 'Pad', name: 'Glass Pad', w1: W.RESONANCE, octave: 1,
    dca: amp([0.9, 85], HOLD, [1.5, 0]),
    dcw: wave([1.0, 12], [2.0, 30], HOLD, [1.5, 5]) }),
  preset({ category: 'Pad', name: 'Choir Pad', w1: W.DOUBLE_SINE, w2: W.SAW, window: Win.TRIANGLE, octave: -1,
    dca: amp([0.7, 92], HOLD, [1.2, 0]),
    dcw: wave([0.9, 45], HOLD, [1.2, 10]),
    line2: { w1: W.DOUBLE_SINE, window: Win.TRIANGLE, dca: amp([0.75, 92], HOLD, [1.2, 0]), dcw: wave([0.95, 45], HOLD, [1.2, 10]), detune: -8 } }),
  preset({ category: 'Pad', name: 'Sweep Pad', w1: W.SAW,
    dca: amp([0.5, 94], HOLD, [1.6, 0]),
    dcw: wave([4.0, 85], HOLD, [1.6, 8]) }),

  // ---- Pluck ----
  preset({ category: 'Pluck', name: 'Harp', w1: W.SAW,
    dca: amp([0.002, 99], [1.6, 0]),
    dcw: wave([0.002, 99], [0.15, 18], [0.8, 2]) }),
  preset({ category: 'Pluck', name: 'Acoustic Guitar', w1: W.SAW_PULSE,
    dca: amp([0.003, 99], [0.9, 8]),
    dcw: wave([0.002, 99], [0.15, 18], [0.8, 2]) }),
  preset({ category: 'Pluck', name: 'Banjo', w1: W.PULSE, w2: W.SAW,
    dca: amp([0.003, 99], [0.5, 0]),
    dcw: wave([0.003, 99], [0.12, 26]) }),
  preset({ category: 'Pluck', name: 'Koto', w1: W.SQUARE, window: Win.SAW, octave: 1,
    dca: amp([0.003, 99], [1.1, 0]),
    dcw: wave([0.002, 99], [0.15, 18], [0.8, 2]),
    dco: pitch([[0.003, 4], [0.08, 0]]) }),
  preset({ category: 'Pluck', name: 'Kalimba', w1: W.RESONANCE, octave: 1,
    dca: amp([0.003, 99], [0.7, 0]),
    dcw: wave([0.002, 99], [0.15, 18], [0.8, 2]) }),

  // ---- Percussion and Effects: pitch envelopes and noise ----
  // A struck drum: instant noise click for the beater, a sine body whose pitch falls fast (the pitch envelope)
  preset({ category: 'Percussion and Effects', name: 'Kick Drum', w1: W.SAW, octave: -2,
    dca: amp([0.002, 99], [0.3, 0]),
    dcw: wave([0.002, 4], [0.2, 0]),
    dco: pitch([[0.001, 14, true], [0.045, 0]]),
    noise: true,
    line2: { w1: W.PULSE, detune: 4800, dca: amp([0.001, 85], [0.008, 0]), dcw: wave([0.001, 99]) } }),
  preset({ category: 'Percussion and Effects', name: 'Tom', w1: W.SAW, octave: -1,
    dca: amp([0.002, 99], [0.45, 0]),
    dcw: wave([0.002, 20], [0.3, 2]),
    dco: pitch([[0.001, 7, true], [0.12, 0]]),
    noise: true,
    line2: { w1: W.PULSE, detune: 3600, dca: amp([0.001, 70], [0.01, 0]), dcw: wave([0.001, 99]) } }),
  preset({ category: 'Percussion and Effects', name: 'Snare Drum', w1: W.SAW, octave: -1,
    dca: amp([0.002, 99], [0.12, 0]),
    dcw: wave([0.002, 10], [0.1, 0]),
    dco: pitch([[0.001, 3, true], [0.05, 0]]),
    noise: true,
    line2: { w1: W.PULSE, detune: 3600, dca: amp([0.002, 99], [0.22, 0]), dcw: wave([0.002, 99]) } }),
  preset({ category: 'Percussion and Effects', name: 'Hi-Hat', w1: W.PULSE, octave: 3, noise: true,
    dca: amp([0.001, 90], [0.07, 0]),
    dcw: wave([0.001, 99]),
    line2: { w1: W.PULSE, dca: amp([0.001, 90], [0.07, 0]), dcw: wave([0.001, 99]) } }),
  preset({ category: 'Percussion and Effects', name: 'Open Hi-Hat', w1: W.PULSE, octave: 3, noise: true,
    dca: amp([0.001, 90], [0.3, 0]),
    dcw: wave([0.001, 99]),
    line2: { w1: W.PULSE, dca: amp([0.001, 90], [0.3, 0]), dcw: wave([0.001, 99]) } }),
  preset({ category: 'Percussion and Effects', name: 'Hand Clap', w1: W.PULSE, octave: 3, noise: true,
    dca: amp([0.001, 99], [0.012, 15], [0.001, 99], [0.012, 15], [0.001, 99], [0.2, 0]),
    dcw: wave([0.001, 99]),
    line2: { w1: W.PULSE, dca: amp([0.001, 99], [0.012, 15], [0.001, 99], [0.012, 15], [0.001, 99], [0.2, 0]), dcw: wave([0.001, 99]) } }),
  preset({ category: 'Percussion and Effects', name: 'Laser Zap', w1: W.RESONANCE, octave: 1,
    dca: amp([0.002, 99], [0.5, 0]),
    dcw: wave([0.002, 70], [0.4, 8]),
    dco: pitch([[0.001, 30, true], [0.3, 0]]) }),
  preset({ category: 'Percussion and Effects', name: 'Wind Noise', w1: W.PULSE, octave: 1, noise: true,
    dca: amp([1.2, 70], HOLD, [1.5, 0]),
    dcw: wave([1.5, 90], HOLD, [1.5, 20]),
    line2: { w1: W.PULSE, dca: amp([1.2, 70], HOLD, [1.5, 0]), dcw: wave([1.5, 90], HOLD, [1.5, 20]) } }),

  // ---- Ring Modulation: line 2 multiplied by line 1 ----
  preset({ category: 'Ring Modulation', name: 'Metallic Clang', w1: W.SQUARE, ring: true, ringOnly: true,
    dca: amp([0.002, 96], [1.4, 0]),
    dcw: wave([0.002, 99], [0.15, 18], [0.8, 2]),
    line2: { w1: W.SAW, dca: amp([0.002, 99], [1.4, 0]), dcw: wave([0.002, 99], [0.15, 18], [0.8, 2]), detune: 530 } }),
  preset({ category: 'Ring Modulation', name: 'Alien Ring', w1: W.DOUBLE_SINE, ring: true, octave: -1,
    dca: amp([0.2, 96], HOLD, [0.4, 0]),
    dcw: wave([0.3, 70], HOLD, [0.4, 20]),
    line2: { w1: W.DOUBLE_SINE, dca: amp([0.2, 99], HOLD, [0.4, 0]), dcw: wave([0.3, 70], HOLD, [0.4, 20]), detune: 390 } }),
  preset({ category: 'Ring Modulation', name: 'Robot Voice', w1: W.PULSE, window: Win.TRAPEZOID, ring: true,
    dca: amp([0.02, 98], HOLD, [0.1, 0]),
    dcw: wave([0.02, 99], HOLD, [0.1, 70]),
    line2: { w1: W.SQUARE, dca: amp([0.02, 99], HOLD, [0.1, 0]), dcw: wave([0.02, 60], HOLD, [0.1, 30]), detune: -700 } }),
  preset({ category: 'Ring Modulation', name: 'Gong', w1: W.RESONANCE, ring: true, ringOnly: true, octave: -1,
    dca: amp([0.01, 99], [5.0, 4]),
    dcw: wave([0.002, 99], [0.15, 18], [0.8, 2]),
    line2: { w1: W.RESONANCE, dca: amp([0.01, 99], [5.0, 4]), dcw: wave([0.002, 99], [0.15, 18], [0.8, 2]), detune: 281 } }),
  preset({ category: 'Ring Modulation', name: 'Ring Bell', w1: W.SAW_PULSE, ring: true, ringOnly: true, octave: 1,
    dca: amp([0.003, 96], [2.4, 3]),
    dcw: wave([0.002, 99], [0.15, 18], [0.8, 2]),
    line2: { w1: W.DOUBLE_SINE, dca: amp([0.003, 99], [2.4, 3]), dcw: wave([0.002, 99], [0.15, 18], [0.8, 2]), detune: 1000 } }),
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
  const patch = CZ101_PRESET_BANK[index].patch;
  const first = patch.line1;
  return {
    _program: index,
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
