/**
 * amsynthCurves.ts - what the amsynth engine does with the editor's knobs (third-party/amsynth-master/src/core/synth:
 * ADSR.cpp, VoiceBoard.cpp, LowPassFilter.cpp, Oscillator.cpp, Parameter.cpp), as curves. Layout values are the raw
 * parameter values (Parameter::getValue); the engine acts on the CONTROL value, which a per-parameter law derives:
 *
 *   envelope times   0.0005 + v^3 seconds (law Power 3, offset 0.0005), so the knob value 0.5 is 125 ms, not 1250 ms
 *   LFO rate         v^2 Hz (law Power 2)
 *   filter cutoff    16^v times the base frequency (law Exponential 16)
 *   LFO > pitch      depth v^3 / 2 as a ratio on the oscillator frequency (c = v^3 - 1, depth (c + 1) / 2)
 *   LFO > filter/amp depth (v + 1) / 2: the knob's centre is 50 % depth, its minimum is none
 *   detune           1.25^v as a frequency ratio; range 2^v octaves
 *
 * Envelopes are linear in time: attack to 1 (straight to the sustain level when the decay is at its 0.5 ms minimum,
 * ADSR::triggerOn), linear decay to the sustain, linear release to 0 (ADSR.cpp). The filter is the Zoelzer bilinear
 * biquad of LowPassFilter.cpp (r = max(0.001, 2 (1 - resonance)), k = tan(pi f / fs)), applied twice for the 24 dB
 * slope. The cutoff is cutoffKnob control * (kbd blend of 261.626 Hz and the note) * velocity blend * LFO factor,
 * plus the filter envelope: note frequency * env * amount when positive, cutoff * amount / 16 * env when negative
 * (VoiceBoard::ProcessSamplesMix). LFO shapes are the engine's saw() / sine / square (Oscillator.cpp).
 *
 * Not modelled (named): the oscillators' alias-reduction pulse-width scaling at high pitch, noise and random
 * oscillators (no deterministic shape), velocity (curves assume velocity 1), portamento, the reverb and distortion.
 */
import type { CurveDescriptor } from '@/types/synthPanel';
import {
  audioSampleRate, envelopeDomain, envelopeMarkerX, holdFor, num, polyMul, stagedEnvelope, voiceMarker, zMagnitudeDb, logGrid,
  FILTER_DB_MAX, FILTER_DB_MIN, type StagedEnvelope,
} from './wasmSubtractiveModels';
import { fmtHz, fmtMs } from './commonCurveModels';

export const AMSYNTH_SYNTH_TYPE = 'AMSynth';
export const AMSYNTH_REFERENCE_NOTE = 60;
type Get = (key: string) => number;

// ---- control laws (Parameter.cpp:88) ---------------------------------------------------------------------

export const amsynthTimeSeconds = (v: number): number => 0.0005 + v ** 3;
export const amsynthLfoHz = (v: number): number => v ** 2;
export const amsynthCutoffMultiplier = (v: number): number => 16 ** v;
export const amsynthLfoPitchDepth = (v: number): number => (v ** 3) / 2;
export const amsynthLfoDepth = (v: number): number => (v + 1) / 2;
export const amsynthNoteHz = (note: number): number => 440 * Math.pow(2, (note - 69) / 12);

// ---- envelopes ------------------------------------------------------------------------------------------

export interface AmsynthEnvelopeKnobs { attack: number; decay: number; sustain: number; release: number }

export function amsynthEnvelope(k: AmsynthEnvelopeKnobs): StagedEnvelope {
  const a = amsynthTimeSeconds(k.attack);
  const d = amsynthTimeSeconds(k.decay);
  const r = amsynthTimeSeconds(k.release);
  const s = Math.min(1, Math.max(0, k.sustain));
  const skipDecay = d <= 0.0005; // ADSR::triggerOn aims the attack at the sustain level
  const peak = skipDecay ? s : 1;
  const decaySeconds = skipDecay ? 0 : d;
  return stagedEnvelope({
    attackSeconds: a, decaySeconds, holdSeconds: holdFor(a, decaySeconds), releaseSeconds: r,
    attack: (t) => (a > 0 ? (peak * t) / a : peak),
    decay: (t) => 1 + ((s - 1) * t) / d,
    release: (t) => s * (1 - t / r),
  });
}
export const amsynthAmpKnobs = (get: Get): AmsynthEnvelopeKnobs => ({
  attack: num(get('ampAttack')), decay: num(get('ampDecay')), sustain: num(get('ampSustain'), 1), release: num(get('ampRelease')),
});
export const amsynthFilterEnvKnobs = (get: Get): AmsynthEnvelopeKnobs => ({
  attack: num(get('filterAttack')), decay: num(get('filterDecay')), sustain: num(get('filterSustain'), 1), release: num(get('filterRelease')),
});

// ---- filter ---------------------------------------------------------------------------------------------

/** VoiceBoard::ProcessSamplesMix, cpp:155-166, for the given envelope and LFO values (-1..1). */
export function amsynthCutoffHz(get: Get, env: number, lfo = -1, note = AMSYNTH_REFERENCE_NOTE, fs = 48000): number {
  const frequency = amsynthNoteHz(note);
  const kbd = num(get('filterKbdTrack'), 0.5);
  const base = kbd * frequency + (1 - kbd) * 261.626;
  const velocityMultiplier = 1; // BLEND(1, velocity, sensitivity) at velocity 1
  const mod = amsynthLfoDepth(num(get('filterModAmount'), -1));
  const lfoMultiplier = (lfo * 0.5 + 0.5) * mod + 1 - mod;
  let cutoff = amsynthCutoffMultiplier(num(get('filterCutoff'), 1.5)) * base * velocityMultiplier * lfoMultiplier;
  const amount = num(get('filterEnvAmount'));
  if (amount > 0) cutoff += frequency * env * amount;
  else cutoff += cutoff * (1 / 16) * amount * env;
  return Math.max(Math.min(cutoff, fs * 0.5 * 0.99), 10);
}

/** LowPassFilter.cpp biquad coefficients; null for the bypass type. */
export function amsynthFilterCoefficients(type: number, cutoff: number, resonance: number, slope24: boolean, fs: number): { b: number[]; a: number[] } | null {
  const t = Math.round(type);
  if (t === 4) return null;
  const w = Math.max(10, Math.min(cutoff, fs * 0.5 * 0.99)) / fs;
  const r = Math.max(0.001, 2 * (1 - resonance));
  const k = Math.tan(w * Math.PI);
  const k2 = k * k;
  const rk = r * k;
  const bh = 1 + rk + k2;
  const a1d = (2 * (k2 - 1)) / bh;
  const a2d = (1 - rk + k2) / bh;
  let b: number[];
  switch (t) {
    case 0: { const a0 = k2 / bh; b = [a0, 2 * a0, a0]; break; }
    case 1: { const a0 = 1 / bh; b = [a0, -2 * a0, a0]; break; }
    case 2: b = [rk / bh, 0, -rk / bh]; break;
    default: { const a0 = (1 + k2) / bh; b = [a0, a1d, a0]; break; }
  }
  const a = [1, a1d, a2d];
  return slope24 ? { b: polyMul(b, b), a: polyMul(a, a) } : { b, a };
}

export function amsynthFilterSeries(get: Get, fs: number, env: number): Array<[number, number]> {
  const cutoff = amsynthCutoffHz(get, env, -1, AMSYNTH_REFERENCE_NOTE, fs);
  const c = amsynthFilterCoefficients(num(get('filterType')), cutoff, num(get('filterResonance')), num(get('filterSlope'), 1) >= 0.5, fs);
  return logGrid().filter((hz) => hz < fs / 2).map((hz) => [hz, c ? Math.max(FILTER_DB_MIN, zMagnitudeDb(c.b, c.a, hz, fs)) : 0] as [number, number]);
}

// ---- LFO and oscillators --------------------------------------------------------------------------------

/** Engine LFO wave indices (VoiceBoard.cpp:20-28, UpdateParameter). */
export const AMSYNTH_LFO_WAVES = ['Sine', 'Square', 'Triangle', 'Noise', 'Random', 'Saw Up', 'Saw Down'] as const;

/** Oscillator.cpp saw(): a triangle at shape 0 morphing to a sawtooth at shape 1; phase in cycles. */
export function amsynthSaw(phase: number, shape: number): number {
  const t = phase - Math.floor(phase);
  const a = (shape + 1) / 2;
  if (t < a / 2) return (2 * t) / a;
  if (t > 1 - a / 2) return (2 * t - 2) / a;
  return a >= 1 ? 0 : (1 - 2 * t) / (1 - a);
}
/** Oscillator.cpp doSquare() at low frequency: high until pi + pi * min(pw, 0.9), then low. */
export function amsynthPulse(phase: number, pulseWidth: number): number {
  const t = phase - Math.floor(phase);
  const duty = 0.5 + 0.5 * Math.min(pulseWidth, 0.9);
  return t <= duty ? 1 : -1;
}
export function amsynthLfoValue(wave: number, phase: number): number {
  switch (Math.round(wave)) {
    case 0: return Math.sin(2 * Math.PI * phase);
    case 1: return amsynthPulse(phase, 0);
    case 2: return amsynthSaw(phase, 0);
    case 5: return amsynthSaw(phase, 1);
    case 6: return -amsynthSaw(phase, 1);
    default: return 0;
  }
}
const LFO_POINTS = 160;
export function amsynthLfoSeries(wave: number, scale: (lfo: number) => number): Array<[number, number]> {
  return Array.from({ length: LFO_POINTS }, (_, i) => { const x = i / (LFO_POINTS - 1); return [x, scale(amsynthLfoValue(wave, 2 * x))] as [number, number]; });
}
/** Pitch swing of the LFO in cents: the oscillator frequency is multiplied by 1 + depth * lfo (VoiceBoard cpp:149). */
export const amsynthLfoPitchCents = (depth: number, lfo: number): number => 1200 * Math.log2(Math.max(1e-6, 1 + depth * lfo));

/** Oscillator wave value (Oscillator.cpp); noise and random have no deterministic shape. */
function oscValue(wave: number, phase: number, pulseWidth: number): number {
  switch (Math.round(wave)) {
    case 0: return Math.sin(2 * Math.PI * phase);
    case 1: return amsynthPulse(phase, pulseWidth);
    case 2: return amsynthSaw(phase, pulseWidth);
    default: return 0;
  }
}
/** Both oscillators mixed as VoiceBoard cpp:178-188 mixes them, over `cycles` periods of oscillator 1. */
export function amsynthOscillatorSeries(get: Get, cycles = 4, count = 320): Array<[number, number]> {
  const ratio = Math.pow(1.25, num(get('osc2Detune'))) * Math.pow(2, num(get('osc2Range'))) * Math.pow(2, num(get('osc2Pitch')) / 12);
  const sync = num(get('osc2Sync')) >= 0.5 && [0, 2].includes(Math.round(num(get('osc1Waveform'), 2)));
  const ring = num(get('oscMixMode'));
  const mix = num(get('oscMix'));
  const v1 = ((1 - ring) * (1 - mix)) / 2;
  const v2 = ((1 - ring) * (1 + mix)) / 2;
  const raw = Array.from({ length: count }, (_, i) => {
    const t = (i / (count - 1)) * cycles;
    const p2 = sync ? (t - Math.floor(t)) * ratio : t * ratio;
    const o1 = oscValue(num(get('osc1Waveform'), 2), t, num(get('osc1Pulsewidth'), 0.5));
    const o2 = oscValue(num(get('osc2Waveform'), 2), p2, num(get('osc2Pulsewidth'), 0.5));
    return v1 * o1 + v2 * o2 + ring * o1 * o2;
  });
  const peak = Math.max(1e-6, ...raw.map(Math.abs));
  return raw.map((y, i) => [i / (count - 1), y / peak]);
}

// ---- curve descriptors ----------------------------------------------------------------------------------

export function amsynthCurves(sampleRate: () => number = audioSampleRate): Record<'amp' | 'filterEnv' | 'filter' | 'lfo' | 'oscillator', CurveDescriptor> {
  const readout = (k: AmsynthEnvelopeKnobs): string =>
    `A ${fmtMs(amsynthTimeSeconds(k.attack) * 1000)}  D ${fmtMs(amsynthTimeSeconds(k.decay) * 1000)}  S ${Math.round(k.sustain * 100)}%  R ${fmtMs(amsynthTimeSeconds(k.release) * 1000)}`;
  const filterType = (get: Get): string => ['low-pass', 'high-pass', 'band-pass', 'band-stop', 'bypass'][Math.round(num(get('filterType')))] ?? 'low-pass';
  return {
    amp: {
      label: 'Amplitude Envelope', xUnit: 's', yDomain: [0, 1],
      xDomain: (get) => envelopeDomain(amsynthEnvelope(amsynthAmpKnobs(get))),
      series: (get) => [{ points: amsynthEnvelope(amsynthAmpKnobs(get)).points, fill: true }],
      readout: (get) => readout(amsynthAmpKnobs(get)),
      marker: voiceMarker(AMSYNTH_SYNTH_TYPE, (v, get) => envelopeMarkerX(amsynthEnvelope(amsynthAmpKnobs(get)), v.stage, v.level)),
    },
    filterEnv: {
      label: 'Filter Envelope', xUnit: 's', yDomain: [0, 1],
      xDomain: (get) => envelopeDomain(amsynthEnvelope(amsynthFilterEnvKnobs(get))),
      series: (get) => [{ points: amsynthEnvelope(amsynthFilterEnvKnobs(get)).points, fill: true }],
      readout: (get) => readout(amsynthFilterEnvKnobs(get)),
      marker: voiceMarker(AMSYNTH_SYNTH_TYPE, (v, get) => envelopeMarkerX(amsynthEnvelope(amsynthFilterEnvKnobs(get)), v.filterStage, v.filterLevel)),
    },
    filter: {
      label: 'Filter Response (middle C)', xScale: 'log', xDomain: [20, 20000], yDomain: [FILTER_DB_MIN, FILTER_DB_MAX], xUnit: 'Hz', yUnit: 'dB',
      series: (get) => {
        const fs = sampleRate();
        return [{ points: amsynthFilterSeries(get, fs, 0), color: 'rgba(255,255,255,0.35)' }, { points: amsynthFilterSeries(get, fs, 1), fill: true }];
      },
      readout: (get) => `${filterType(get)} ${num(get('filterSlope'), 1) >= 0.5 ? '24' : '12'} dB  ${fmtHz(amsynthCutoffHz(get, 0, -1, AMSYNTH_REFERENCE_NOTE, sampleRate()))} to ${fmtHz(amsynthCutoffHz(get, 1, -1, AMSYNTH_REFERENCE_NOTE, sampleRate()))}`,
      marker: voiceMarker(AMSYNTH_SYNTH_TYPE, (v) => (v.cutoff > 0 ? v.cutoff : null)),
    },
    lfo: {
      label: 'LFO (pitch swing in cents)', xDomain: [0, 1], yUnit: 'cents',
      yDomain: (get) => { const d = amsynthLfoPitchDepth(num(get('freqModAmount'))); const m = Math.max(10, Math.abs(amsynthLfoPitchCents(d, 1)), Math.abs(amsynthLfoPitchCents(d, -1))); return [-m, m]; },
      series: (get) => {
        const d = amsynthLfoPitchDepth(num(get('freqModAmount')));
        return [{ points: amsynthLfoSeries(num(get('lfoWaveform')), (l) => amsynthLfoPitchCents(d, l)) }];
      },
      readout: (get) => `${AMSYNTH_LFO_WAVES[Math.round(num(get('lfoWaveform')))] ?? ''}  ${amsynthLfoHz(num(get('lfoFreq'))).toFixed(2)} Hz  filter ${Math.round(amsynthLfoDepth(num(get('filterModAmount'), -1)) * 100)}%  amp ${Math.round(amsynthLfoDepth(num(get('ampModAmount'), -1)) * 100)}%`,
      marker: voiceMarker(AMSYNTH_SYNTH_TYPE, (v) => v.lfoPhase / 2),
    },
    oscillator: {
      label: 'Oscillators (4 cycles)', xDomain: [0, 1], yDomain: [-1, 1],
      series: (get) => [{ points: amsynthOscillatorSeries(get) }],
    },
  };
}
