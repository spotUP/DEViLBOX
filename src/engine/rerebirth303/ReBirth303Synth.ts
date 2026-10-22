/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 *
 * re-rebirth 303: monophonic acid bass voice (port of re-rebirth src/audio/bass-voice.js).
 * The oscillator runs continuously so slides can glide pitch; notes are scheduled as
 * automation on the pitch, filter envelope and VCA.
 *
 * osc -> resonant lowpass -> one-pole lowpass -> VCA -> level -> one-pole highpass -> output
 *
 * The filter envelope drives both lowpasses' `detune` (cents), so the cutoff knob stays
 * live on `frequency` while notes play.
 */

import type { DevilboxSynth } from '@/types/synth';
import type { ReBirth303Config } from '@typedefs/instrument';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

// Note 0 at the centre tune position: C2.
const BASE_MIDI = 36;

/** Tune knob (0..1 of 0..127, centre 64): upwards whole semitones to +1 octave, downwards continuous. */
export function tuneCents(knob: number): number {
  const u = knob * 127 - 64;
  if (u >= 0) return Math.round((u * 12) / 63) * 100;
  return 1200 * Math.log2(1 + u / 128);
}

const GATE_RELEASE_TAU = 0.022; // VCA release time constant after the gate closes, seconds
const GLIDE = 0.017; // slide time constant, seconds; exponential in pitch
const LEVEL = 1.244; // overall level
const OCTAVES = 3.093; // cutoff knob range in octaves
const Q_MAX_C = 1.25; // beyond the measured range Q stops growing
const ENV_BASE_SHIFT = -1.51; // octaves at full env mod
const DECAY_TAUS = [0.011, 0.124, 0.261, 0.763, 2.089];
const ACCENT_OCTAVES = 3.3;
const ACCENT_TAU = 0.065;
const ACCENT_GAIN = 2.85;
const ACCENT_GAIN_TAU = 0.092;
const PULSE_DUTY = 0.4767;
const PULSE_SCALE = 0.55;

const ENV_OCTAVES = (envmod: number): number => 0.81 + 3.91 * envmod;
const lowPole = (q: number): number => (1 / q - Math.sqrt(1 / q ** 2 - 4)) / 2;
const midiToHz = (m: number): number => 440 * 2 ** ((m - 69) / 12);
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

function decayTau(knob: number): number {
  const x = clamp01(knob) * (DECAY_TAUS.length - 1);
  const i = Math.min(DECAY_TAUS.length - 2, Math.floor(x));
  return DECAY_TAUS[i] * (DECAY_TAUS[i + 1] / DECAY_TAUS[i]) ** (x - i);
}

const qDb = (r: number): { q0: number; q1: number } => ({
  q0: (20 / Math.LN10) * (-0.4045 + 1.339 * r + 0.5493 * r * r),
  q1: (20 / Math.LN10) * (0.9314 * r + 0.8111 * r * r),
});

/** Static filter per cutoff c and resonance r (both 0..1). */
export function filterShape(c: number, r: number): { fa: number; pole: number; gainDb: number; q0: number; q1: number } {
  const fa = 204.6 * 2 ** (OCTAVES * c) * (1 + 0.2565 * r ** 3);
  const pole = fa * (0.1582 + 1.062 * r);
  const gainDb = 2.691 + r * (-5.016 - 20.27 * c) + r * r * (-3.414 + 22.4 * c);
  return { fa, pole, gainDb, ...qDb(r) };
}

function buildWaves(ctx: BaseAudioContext): { saw: PeriodicWave; pulse: PeriodicWave } {
  const n = 2048;
  const sawReal = new Float32Array(n);
  const sawImag = new Float32Array(n);
  const pulseReal = new Float32Array(n);
  const pulseImag = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    const b = ((k % 2 ? 1 : -1) * 2) / (Math.PI * k);
    const th = 2 * Math.PI * k * PULSE_DUTY;
    sawImag[k] = b;
    pulseImag[k] = PULSE_SCALE * b * (1 - Math.cos(th));
    pulseReal[k] = PULSE_SCALE * b * Math.sin(th);
  }
  return {
    saw: new PeriodicWave(ctx, { real: sawReal, imag: sawImag, disableNormalization: true }),
    pulse: new PeriodicWave(ctx, { real: pulseReal, imag: pulseImag, disableNormalization: true }),
  };
}

/** Freeze a param at its value at `t` and drop later events (Firefox lacks cancelAndHoldAtTime). */
export function holdParam(param: AudioParam, t: number): void {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
  else param.cancelScheduledValues(t);
}

export const DEFAULT_REBIRTH303_VALUES: Required<ReBirth303Config> = {
  tuning: 0.5, cutoff: 0.35, resonance: 0.78, envmod: 0.55, decay: 0.4, accent: 0.7, volume: 0.8, waveform: 0,
};

export class ReBirth303Synth implements DevilboxSynth {
  readonly name = 'ReRebirth303';
  readonly output: GainNode;

  private readonly ctx: BaseAudioContext;
  private readonly waves: { saw: PeriodicWave; pulse: PeriodicWave };
  private readonly osc: OscillatorNode;
  private readonly pitch: ConstantSourceNode;
  private readonly env: ConstantSourceNode;
  private readonly f1: BiquadFilterNode;
  private readonly f2: BiquadFilterNode;
  private readonly qIn: GainNode;
  private readonly qOut: GainNode;
  private readonly vca: GainNode;
  private readonly level: GainNode;
  private params: Required<ReBirth303Config>;
  private wave: 'saw' | 'pulse' = 'saw';
  private gateOpen = false;
  private lastReleaseAt = -1;
  private disposed = false;

  constructor(config: ReBirth303Config = {}, context?: BaseAudioContext) {
    const ctx = context ?? getDevilboxAudioContext();
    this.ctx = ctx;
    this.params = { ...DEFAULT_REBIRTH303_VALUES, ...config };
    this.waves = buildWaves(ctx);
    this.output = ctx.createGain();
    this.output.gain.value = 1;

    this.osc = ctx.createOscillator();
    this.osc.frequency.value = midiToHz(BASE_MIDI);
    this.osc.setPeriodicWave(this.waves.saw);
    // Note pitch in cents above BASE_MIDI; adds to the tune knob on `detune`.
    this.pitch = ctx.createConstantSource();
    this.pitch.offset.value = 0;
    this.pitch.connect(this.osc.detune);

    this.f1 = ctx.createBiquadFilter();
    this.f2 = ctx.createBiquadFilter();
    this.f1.type = 'lowpass';
    this.f2.type = 'lowpass';
    this.env = ctx.createConstantSource();
    this.env.offset.value = 0;
    this.env.connect(this.f1.detune);
    this.env.connect(this.f2.detune);
    // env cents -> Q dB, clamped: scale so the WaveShaper input clips at Q_MAX_C.
    this.qIn = ctx.createGain();
    this.qOut = ctx.createGain();
    const clamp = new WaveShaperNode(ctx, { curve: new Float32Array([-1, 1]) });
    this.env.connect(this.qIn).connect(clamp).connect(this.qOut).connect(this.f1.Q);

    this.vca = ctx.createGain();
    this.vca.gain.value = 0;
    this.level = ctx.createGain();
    // One-pole highpass at 90 Hz: less fundamental than an ideal sawtooth.
    const p = Math.tan((Math.PI * 90) / ctx.sampleRate);
    const a = (1 - p) / (1 + p);
    const lowCut = ctx.createIIRFilter([(1 + a) / 2, -(1 + a) / 2], [1, -a]);
    this.osc.connect(this.f1).connect(this.f2).connect(this.vca).connect(this.level).connect(lowCut).connect(this.output);
    this.osc.start();
    this.pitch.start();
    this.env.start();
    this.applyParams(false);
  }

  /** Apply a partial config (knob moves). Smooth when the synth already runs. */
  applyConfig(config: Partial<ReBirth303Config>): void {
    this.params = { ...this.params, ...config };
    this.applyParams(true);
  }

  set(param: string, value: number): void {
    if (param in this.params) this.applyConfig({ [param]: value });
  }

  get(param: string): number | undefined {
    return (this.params as Record<string, number>)[param];
  }

  private applyParams(smooth: boolean): void {
    const p = this.params;
    const now = this.ctx.currentTime;
    const set = (param: AudioParam, v: number): void => {
      if (smooth) param.setTargetAtTime(v, now, 0.01);
      else param.value = v;
    };
    const { fa, pole, gainDb, q0, q1 } = filterShape(p.cutoff, p.resonance);
    const shift = ENV_BASE_SHIFT * p.envmod;
    const base = 2 ** shift;
    const q2 = 0.1 + 0.15 * p.resonance;
    set(this.f1.frequency, fa * base);
    const c = Math.min(Q_MAX_C, p.cutoff + shift / OCTAVES);
    const span = (Q_MAX_C - c) * OCTAVES * 1200; // env cents until the clamp
    set(this.f1.Q, q0 + q1 * c);
    set(this.qIn.gain, span > 1 ? 1 / span : 0);
    set(this.qOut.gain, (q1 * span) / (OCTAVES * 1200));
    set(this.f2.frequency, (pole * base) / lowPole(q2));
    set(this.f2.Q, 20 * Math.log10(q2));
    set(this.osc.detune, tuneCents(p.tuning));
    set(this.level.gain, p.volume * p.volume * LEVEL * 10 ** (gainDb / 20));
    const wave = p.waveform >= 0.5 ? 'pulse' : 'saw';
    if (this.wave !== wave) {
      this.wave = wave;
      this.osc.setPeriodicWave(this.waves[wave]);
    }
  }

  /**
   * Start a note. `slide` glides from the held (or just-released) previous note
   * without retriggering the envelope; `accent` adds the accent sweep and VCA boost.
   */
  triggerAttack(note: string | number, time?: number, _velocity?: number, accent = false, slide = false): void {
    if (this.disposed) return;
    const t = time ?? this.ctx.currentTime;
    const midi = typeof note === 'number' ? note : noteToMidi(note);
    const cents = (midi - BASE_MIDI) * 100;
    const slides = slide && (this.gateOpen || this.lastReleaseAt >= t - 0.002);
    if (slides) {
      this.pitch.offset.setTargetAtTime(cents, t, GLIDE);
      // Undo a release the tracker scheduled at this step boundary: the gate stays open.
      // bass-voice.js:190 - a slid note has no accent of its own (no new sweep, no VCA boost); the
      // VCA only settles to unity, which drops the previous accented note's boost at the step edge.
      holdParam(this.vca.gain, t);
      this.vca.gain.setTargetAtTime(1, t, 0.004);
    } else {
      this.pitch.offset.cancelScheduledValues(t);
      this.pitch.offset.setValueAtTime(cents, t);
      this.trigger(t, accent);
    }
    this.gateOpen = true;
  }

  triggerRelease(_note?: string | number, time?: number): void {
    if (this.disposed) return;
    const t = time ?? this.ctx.currentTime;
    this.vca.gain.setTargetAtTime(0, t, GATE_RELEASE_TAU);
    this.gateOpen = false;
    this.lastReleaseAt = t;
  }

  triggerAttackRelease(note: string | number, duration: number, time?: number, velocity?: number, accent = false, slide = false): void {
    const t = time ?? this.ctx.currentTime;
    this.triggerAttack(note, t, velocity, accent, slide);
    this.triggerRelease(note, t + duration);
  }

  releaseAll(): void {
    this.triggerRelease();
  }

  private trigger(t: number, accent: boolean): void {
    const p = this.params;
    const acc = accent ? p.accent : 0;
    const env = this.env.offset;
    const octaves = ENV_OCTAVES(p.envmod) + acc * ACCENT_OCTAVES;
    env.cancelScheduledValues(t);
    env.setValueAtTime(octaves * 1200, t);
    env.setTargetAtTime(0, t, accent ? ACCENT_TAU : decayTau(p.decay));
    // Every envelope starts from an explicit value: setTarget right after a cancel is undefined.
    const gain = this.vca.gain;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(0, t);
    gain.linearRampToValueAtTime(1 + acc * ACCENT_GAIN, t + 0.001);
    if (acc) gain.setTargetAtTime(1, t + 0.001, ACCENT_GAIN_TAU);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.osc.stop();
      this.pitch.stop();
      this.env.stop();
    } catch { /* already stopped */ }
    this.output.disconnect();
  }
}
