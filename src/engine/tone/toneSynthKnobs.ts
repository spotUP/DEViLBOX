/**
 * toneSynthKnobs - the one place that turns an InstrumentConfig into the options of a Tone.js core synth, at creation
 * AND on a live edit, and that gives the five melodic Tone voices (Synth, MonoSynth, DuoSynth, FMSynth, AMSynth) the
 * modulation the editor declares: the oscillator detune and octave, the pitch envelope and the LFO.
 *
 * Three creation paths build these synths (ToneEngine.getInstrument's inline switch, the SynthRegistry entries in
 * registry/builtin/tone.ts, and ToneJSSynthFactory); all of them take their options from `toneVoiceOptions` and their
 * voice class from `toneVoiceClass`. The live path (SynthParameterUpdates.updateToneJsSynthInPlace) calls
 * `applyToneVoiceOptions`, which is `set(toneVoiceOptions(...))` on the same options, so a knob cannot reach the
 * creation path and miss the live path (or the other way round).
 *
 * Modulation lives on the voice (`rig` option, a ToneRig): a cents Signal for detune + octave, a Signal driven by the
 * pitch envelope at every note attack and release, and one Tone.LFO fanned out to pitch (cents), volume (tremolo) and,
 * on a MonoSynth, the filter cutoff. They sum into the voice's own `detune` / `volume` / `filter.frequency`, so the
 * engine's pitch effects (arpeggio, portamento, global detune write `detune.value`) keep working next to them.
 */
import * as Tone from 'tone';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { LFOWaveform, PitchEnvelopeConfig } from '@typedefs/instrument';
import { getNormalizedVolume } from '../factories/volumeNormalization';
import { registerVoiceSource } from './toneVoiceProbe';

// ---------------------------------------------------------------------------------------------------------
// Defaults (the layouts in constants/synthLayouts/toneSynths.ts import these, so a knob's resting value is the
// engine's value)
// ---------------------------------------------------------------------------------------------------------

export const TONE_PLUCK_DEFAULTS = { attackNoise: 1, dampening: 4000, resonance: 0.7, release: 1 } as const;
export const TONE_METAL_DEFAULTS = { harmonicity: 5.1, modulationIndex: 32, octaves: 1.5, resonance: 4000, attackMs: 1, decayMs: 100, releaseMs: 100 } as const;
export const TONE_MEMBRANE_DEFAULTS = { pitchDecay: 0.05, octaves: 10, attackMs: 1, decayMs: 400, releaseMs: 100 } as const;
export const TONE_FM_DEFAULTS = { modulationIndex: 10, harmonicity: 3 } as const;
export const TONE_AM_DEFAULTS = { harmonicity: 3 } as const;
/** Tone.MonoSynth.getDefaults().filterEnvelope: what runs when the config names none of it. */
export const TONE_MONO_FILTER_DEFAULTS = { baseFrequency: 200, octaves: 3, exponent: 2 } as const;
export const TONE_LFO_DEFAULTS = { rate: 5, waveform: 'sine' } as const;

export const TONE_KNOB_SYNTH_TYPES: ReadonlySet<string> = new Set([
  'Synth', 'MonoSynth', 'DuoSynth', 'FMSynth', 'ToneAM', 'PluckSynth', 'MetalSynth', 'MembraneSynth', 'NoiseSynth',
]);
/** The synths that carry the detune / pitch envelope / LFO rig. */
const MODULATED_TYPES: ReadonlySet<string> = new Set(['Synth', 'MonoSynth', 'DuoSynth', 'FMSynth', 'ToneAM']);

// ---------------------------------------------------------------------------------------------------------
// Pitch envelope: the one definition the engine schedules and the editor curve draws
// ---------------------------------------------------------------------------------------------------------

/** The pitch envelope in engine units: cents and seconds. */
export interface PitchEnvelopeShape {
  /** Offset reached at the end of the attack (the envelope starts at 0 cents). */
  peakCents: number;
  /** Offset held after the decay. */
  sustainCents: number;
  attackS: number;
  decayS: number;
  releaseS: number;
}

/** The shape a pitch envelope config describes; null when it is off or has no amount (no offset to apply). */
export function pitchEnvelopeShape(cfg: Partial<PitchEnvelopeConfig> | undefined | null): PitchEnvelopeShape | null {
  if (!cfg || !cfg.enabled) return null;
  const amount = Number(cfg.amount ?? 0);
  if (!Number.isFinite(amount) || amount === 0) return null;
  const peakCents = amount * 100;
  const sustainPercent = Number.isFinite(Number(cfg.sustain)) ? Number(cfg.sustain) : 0;
  return {
    peakCents,
    sustainCents: (Math.max(-100, Math.min(100, sustainPercent)) / 100) * peakCents,
    attackS: Math.max(0, Number(cfg.attack ?? 0)) / 1000,
    decayS: Math.max(0, Number(cfg.decay ?? 0)) / 1000,
    releaseS: Math.max(0, Number(cfg.release ?? 0)) / 1000,
  };
}

/**
 * The offset (cents) the pitch envelope gives `t` seconds after the attack, for a note held for `holdS` seconds
 * (Infinity: never released). Linear segments, exactly what `ToneRig.attack` / `release` schedule.
 */
export function pitchEnvelopeCentsAt(shape: PitchEnvelopeShape, t: number, holdS = Infinity): number {
  const at = (x: number): number => {
    if (x < 0) return 0;
    if (x < shape.attackS) return shape.peakCents * (x / shape.attackS);
    const afterAttack = x - shape.attackS;
    if (afterAttack < shape.decayS) return shape.peakCents + (shape.sustainCents - shape.peakCents) * (afterAttack / shape.decayS);
    return shape.sustainCents;
  };
  if (t < holdS) return at(t);
  const atRelease = at(holdS);
  const sinceRelease = t - holdS;
  if (shape.releaseS <= 0 || sinceRelease >= shape.releaseS) return 0;
  return atRelease * (1 - sinceRelease / shape.releaseS);
}

// ---------------------------------------------------------------------------------------------------------
// The rig settings built from a config
// ---------------------------------------------------------------------------------------------------------

export interface ToneLfoSettings {
  type: LFOWaveform;
  rateHz: number;
  /** Vibrato swing in cents (+- this much). */
  pitchCents: number;
  /** Tremolo depth 0..1: the gain swings between (1 - depth) and 1 of the voice's level. */
  volumeDepth: number;
  /** Cutoff swing 0..1 of half the filter envelope's peak frequency (MonoSynth only). */
  filterDepth: number;
}

export interface ToneRigSettings {
  /** Oscillator detune + octave * 1200, in cents. */
  detuneCents: number;
  pitchEnvelope: PitchEnvelopeShape | null;
  lfo: ToneLfoSettings | null;
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const LFO_WAVES: ReadonlySet<string> = new Set(['sine', 'triangle', 'sawtooth', 'square']);

/** True when the LFO config modulates something (it is enabled and at least one depth is above 0). */
export function lfoSettingsOf(synthType: string, config: InstrumentConfig): ToneLfoSettings | null {
  const lfo = config.lfo;
  if (!lfo || !lfo.enabled) return null;
  const wave = LFO_WAVES.has(String(lfo.waveform)) ? (lfo.waveform as LFOWaveform) : TONE_LFO_DEFAULTS.waveform;
  const settings: ToneLfoSettings = {
    type: wave,
    rateHz: Math.max(0.01, num(lfo.rate, TONE_LFO_DEFAULTS.rate)),
    pitchCents: Math.max(0, num(lfo.pitchAmount, 0)),
    volumeDepth: clamp01(num(lfo.volumeAmount, 0) / 100),
    filterDepth: synthType === 'MonoSynth' ? clamp01(num(lfo.filterAmount, 0) / 100) : 0,
  };
  return settings.pitchCents > 0 || settings.volumeDepth > 0 || settings.filterDepth > 0 ? settings : null;
}

export function toneRigSettings(synthType: string, config: InstrumentConfig): ToneRigSettings {
  const osc = config.oscillator;
  // DuoSynth reads oscillator.detune as its vibrato depth (vibratoAmount); only the octave goes through the rig.
  const detune = synthType === 'DuoSynth' ? 0 : num(osc?.detune, 0);
  return {
    detuneCents: detune + Math.round(num(osc?.octave, 0)) * 1200,
    pitchEnvelope: pitchEnvelopeShape(config.pitchEnvelope),
    lfo: lfoSettingsOf(synthType, config),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Options builders
// ---------------------------------------------------------------------------------------------------------

const envelopeOf = (config: InstrumentConfig) => ({
  attack: num(config.envelope?.attack, 10) / 1000,
  decay: num(config.envelope?.decay, 200) / 1000,
  sustain: num(config.envelope?.sustain, 50) / 100,
  release: num(config.envelope?.release, 1000) / 1000,
});

/** The oscillator type for a melodic voice; the editor's 'noise' has no tone, so it falls back. */
const oscTypeOf = (config: InstrumentConfig, fallback: string): string => {
  const t = config.oscillator?.type;
  return !t || t === 'noise' ? fallback : t;
};

/** Only the fields the config defines, milliseconds and percent converted to Tone's seconds and 0..1. */
function partialEnvelope(env: Partial<{ attack: number; decay: number; sustain: number; release: number }> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!env) return out;
  if (typeof env.attack === 'number') out.attack = env.attack / 1000;
  if (typeof env.decay === 'number') out.decay = env.decay / 1000;
  if (typeof env.sustain === 'number') out.sustain = env.sustain / 100;
  if (typeof env.release === 'number') out.release = env.release / 1000;
  return out;
}

const param = (config: InstrumentConfig, key: string, fallback: number): number => num(config.parameters?.[key], fallback);

/**
 * The options of a Tone core synth for `config`, as `new Tone.X(options)`, a PolySynth voice's `options`, and
 * `instrument.set(options)` take them. No volume (each creation site normalizes it) and no filter rolloff (a
 * rolloff change rebuilds the filter, so it is a creation option only: see `toneFilterRolloff`).
 */
export function toneVoiceOptions(synthType: string, config: InstrumentConfig): Record<string, unknown> {
  switch (synthType) {
    case 'Synth':
      return { oscillator: { type: oscTypeOf(config, 'sawtooth') }, envelope: envelopeOf(config), rig: toneRigSettings(synthType, config) };
    case 'MonoSynth': {
      const options: Record<string, unknown> = {
        oscillator: { type: oscTypeOf(config, 'sawtooth') }, envelope: envelopeOf(config), rig: toneRigSettings(synthType, config),
      };
      const filter: Record<string, unknown> = {};
      if (config.filter?.type) filter.type = config.filter.type;
      if (typeof config.filter?.Q === 'number') filter.Q = config.filter.Q;
      if (Object.keys(filter).length > 0) options.filter = filter;
      const fe = config.filterEnvelope;
      if (fe) {
        // The filter's cutoff IS this envelope's sweep (Tone overrides filter.frequency): base * 2^octaves at the peak.
        const filterEnvelope: Record<string, number> = partialEnvelope(fe);
        if (typeof fe.baseFrequency === 'number') filterEnvelope.baseFrequency = fe.baseFrequency;
        if (typeof fe.octaves === 'number') filterEnvelope.octaves = fe.octaves;
        if (Object.keys(filterEnvelope).length > 0) options.filterEnvelope = filterEnvelope;
      }
      return options;
    }
    case 'DuoSynth': {
      const voice = { oscillator: { type: oscTypeOf(config, 'sawtooth') }, envelope: envelopeOf(config) };
      return {
        voice0: voice, voice1: { oscillator: { ...voice.oscillator }, envelope: { ...voice.envelope } },
        vibratoAmount: config.oscillator?.detune ? config.oscillator.detune / 100 : 0.5,
        vibratoRate: 5,
        rig: toneRigSettings(synthType, config),
      };
    }
    case 'FMSynth': {
      const options: Record<string, unknown> = {
        oscillator: { type: oscTypeOf(config, 'sine') }, envelope: envelopeOf(config),
        modulationIndex: num(config.modulationIndex, TONE_FM_DEFAULTS.modulationIndex),
        harmonicity: num(config.harmonicity, TONE_FM_DEFAULTS.harmonicity),
        rig: toneRigSettings(synthType, config),
      };
      addModulator(options, config);
      return options;
    }
    case 'ToneAM': {
      const options: Record<string, unknown> = {
        oscillator: { type: oscTypeOf(config, 'sine') }, envelope: envelopeOf(config),
        harmonicity: num(config.harmonicity, TONE_AM_DEFAULTS.harmonicity),
        rig: toneRigSettings(synthType, config),
      };
      addModulator(options, config);
      return options;
    }
    case 'PluckSynth':
      return {
        attackNoise: param(config, 'attackNoise', TONE_PLUCK_DEFAULTS.attackNoise),
        dampening: param(config, 'dampening', TONE_PLUCK_DEFAULTS.dampening),
        resonance: param(config, 'resonance', TONE_PLUCK_DEFAULTS.resonance),
        release: param(config, 'release', TONE_PLUCK_DEFAULTS.release),
      };
    case 'MetalSynth':
      return {
        harmonicity: param(config, 'harmonicity', TONE_METAL_DEFAULTS.harmonicity),
        modulationIndex: param(config, 'modulationIndex', TONE_METAL_DEFAULTS.modulationIndex),
        resonance: param(config, 'resonance', TONE_METAL_DEFAULTS.resonance),
        octaves: param(config, 'octaves', TONE_METAL_DEFAULTS.octaves),
        envelope: {
          attack: num(config.envelope?.attack, TONE_METAL_DEFAULTS.attackMs) / 1000,
          decay: num(config.envelope?.decay, TONE_METAL_DEFAULTS.decayMs) / 1000,
          release: num(config.envelope?.release, TONE_METAL_DEFAULTS.releaseMs) / 1000,
        },
      };
    case 'MembraneSynth':
      return {
        pitchDecay: param(config, 'pitchDecay', TONE_MEMBRANE_DEFAULTS.pitchDecay),
        octaves: param(config, 'octaves', TONE_MEMBRANE_DEFAULTS.octaves),
        oscillator: { type: oscTypeOf(config, 'sine') },
        envelope: {
          attack: num(config.envelope?.attack, TONE_MEMBRANE_DEFAULTS.attackMs) / 1000,
          decay: num(config.envelope?.decay, TONE_MEMBRANE_DEFAULTS.decayMs) / 1000,
          sustain: 0.01,
          release: num(config.envelope?.release, TONE_MEMBRANE_DEFAULTS.releaseMs) / 1000,
        },
      };
    case 'NoiseSynth':
      return { noise: { type: 'white' }, envelope: envelopeOf(config) };
    default:
      return {};
  }
}

/** The modulator half of an FM / AM voice: its own waveform and amplitude envelope (only what the config sets). */
function addModulator(options: Record<string, unknown>, config: InstrumentConfig): void {
  const env = partialEnvelope(config.modulationEnvelope);
  if (Object.keys(env).length > 0) options.modulationEnvelope = env;
  const type = config.modulation?.type;
  if (type && type !== 'noise') options.modulation = { type };
}

/** MonoSynth's filter slope, a creation-only option. */
export function toneFilterRolloff(config: InstrumentConfig): -12 | -24 | -48 | -96 {
  return config.filter?.rolloff ?? -12;
}

// ---------------------------------------------------------------------------------------------------------
// Live update
// ---------------------------------------------------------------------------------------------------------

/** What a live edit to `updates` can change in a Tone core synth (the store's in-place path asks this). */
export function touchesToneVoice(updates: Partial<Record<keyof InstrumentConfig, unknown>>): boolean {
  return !!(
    updates.oscillator || updates.envelope || updates.filter || updates.filterEnvelope || updates.pitchEnvelope || updates.lfo
    || updates.parameters || updates.modulationIndex !== undefined || updates.harmonicity !== undefined
    || updates.modulationEnvelope || updates.modulation || updates.volume !== undefined
  );
}

/** The Tone node behind an instrument the factories wrapped in a plain object (registered with the voice probe), else the instrument. */
export type ToneSettable = { set: (options: Record<string, unknown>) => unknown };

/** Push every knob of `config` into a live Tone core synth. Returns false when `target` cannot take options. */
export function applyToneVoiceOptions(target: unknown, synthType: string, config: InstrumentConfig): boolean {
  const settable = target as Partial<ToneSettable> | null;
  if (!settable || typeof settable.set !== 'function' || !TONE_KNOB_SYNTH_TYPES.has(synthType)) return false;
  settable.set(toneVoiceOptions(synthType, config));
  return true;
}

// ---------------------------------------------------------------------------------------------------------
// The rig
// ---------------------------------------------------------------------------------------------------------

interface RigHost {
  context: Tone.BaseContext;
  detune: Tone.InputNode;
  volume: Tone.Param<'decibels'>;
  filter?: { frequency: Tone.InputNode };
  filterEnvelope?: { baseFrequency: number; octaves: number };
}

/** Per-voice modulation nodes. Built lazily: a voice with nothing to modulate owns no extra node. */
export class ToneRig {
  private settings: ToneRigSettings = { detuneCents: 0, pitchEnvelope: null, lfo: null };
  private base: Tone.Signal | null = null;
  private pitch: Tone.Signal | null = null;
  private lfo: Tone.LFO | null = null;
  private lfoPitch: Tone.Gain | null = null;
  private lfoVolume: Tone.Gain | null = null;
  private lfoVolumeOffset: Tone.Signal | null = null;
  private lfoFilter: Tone.Gain | null = null;

  private readonly host: RigHost;

  constructor(host: RigHost, initial?: ToneRigSettings) {
    this.host = host;
    if (initial) this.apply(initial);
  }

  get current(): ToneRigSettings { return this.settings; }

  apply(next: ToneRigSettings): void {
    this.settings = next;
    // Detune + octave: a Signal added to the voice's own detune, so the engine's pitch effects stay independent.
    if (next.detuneCents !== 0 && !this.base) {
      this.base = new Tone.Signal({ context: this.host.context, value: 0 });
      this.base.connect(this.host.detune);
    }
    this.base?.setValueAtTime(next.detuneCents, this.host.context.currentTime);
    if (!next.pitchEnvelope && this.pitch) { this.pitch.cancelScheduledValues(0); this.pitch.value = 0; }
    this.syncLfo();
  }

  /** A note starts at `time`: run the pitch envelope, restart the LFO. */
  attack(time: number): void {
    const env = this.settings.pitchEnvelope;
    if (env) {
      if (!this.pitch) {
        this.pitch = new Tone.Signal({ context: this.host.context, value: 0 });
        this.pitch.connect(this.host.detune);
      }
      const p = this.pitch;
      p.cancelScheduledValues(time);
      p.setValueAtTime(0, time);
      if (env.attackS > 0) p.linearRampToValueAtTime(env.peakCents, time + env.attackS);
      else p.setValueAtTime(env.peakCents, time);
      if (env.decayS > 0) p.linearRampToValueAtTime(env.sustainCents, time + env.attackS + env.decayS);
      else p.setValueAtTime(env.sustainCents, time + env.attackS);
    }
    if (this.lfo) {
      this.updateVolumeGain();
      this.lfo.stop(time);
      this.lfo.start(time);
    }
  }

  /** The note is released at `time`: the pitch offset returns to 0 over the release. */
  release(time: number): void {
    const env = this.settings.pitchEnvelope;
    if (!env || !this.pitch) return;
    this.pitch.cancelAndHoldAtTime(time);
    if (env.releaseS > 0) this.pitch.linearRampToValueAtTime(0, time + env.releaseS);
    else this.pitch.setValueAtTime(0, time);
  }

  private linearVoiceGain(): number {
    return Tone.dbToGain(this.host.volume.value);
  }

  private updateVolumeGain(): void {
    const d = this.settings.lfo?.volumeDepth ?? 0;
    if (!this.lfoVolume || !this.lfoVolumeOffset) return;
    const half = 0.5 * d * this.linearVoiceGain();
    this.lfoVolume.gain.value = half;
    this.lfoVolumeOffset.value = -half;
  }

  private filterPeakHz(): number {
    const fe = this.host.filterEnvelope;
    return fe ? fe.baseFrequency * 2 ** fe.octaves : 0;
  }

  private syncLfo(): void {
    const l = this.settings.lfo;
    if (!l) { this.disposeLfo(); return; }
    const context = this.host.context;
    if (!this.lfo) {
      this.lfo = new Tone.LFO({ context, frequency: l.rateHz, type: l.type, min: -1, max: 1 });
      this.lfo.start();
    }
    this.lfo.frequency.value = l.rateHz;
    this.lfo.type = l.type;

    if (l.pitchCents > 0) {
      if (!this.lfoPitch) {
        this.lfoPitch = new Tone.Gain({ context, gain: 0 });
        this.lfo.connect(this.lfoPitch);
        this.lfoPitch.connect(this.host.detune);
      }
      this.lfoPitch.gain.value = l.pitchCents;
    } else if (this.lfoPitch) { this.lfoPitch.dispose(); this.lfoPitch = null; }

    if (l.volumeDepth > 0) {
      if (!this.lfoVolume) {
        // gain(t) = level * (1 - depth/2 + depth/2 * lfo): between (1 - depth) and 1 of the voice's level.
        this.lfoVolume = new Tone.Gain({ context, gain: 0 });
        this.lfoVolumeOffset = new Tone.Signal({ context, value: 0 });
        this.lfo.connect(this.lfoVolume);
        this.lfoVolume.connect(this.host.volume);
        this.lfoVolumeOffset.connect(this.host.volume);
      }
      this.updateVolumeGain();
    } else {
      this.lfoVolume?.dispose(); this.lfoVolume = null;
      this.lfoVolumeOffset?.dispose(); this.lfoVolumeOffset = null;
    }

    if (l.filterDepth > 0 && this.host.filter) {
      if (!this.lfoFilter) {
        this.lfoFilter = new Tone.Gain({ context, gain: 0 });
        this.lfo.connect(this.lfoFilter);
        this.lfoFilter.connect(this.host.filter.frequency);
      }
      this.lfoFilter.gain.value = 0.5 * l.filterDepth * this.filterPeakHz();
    } else if (this.lfoFilter) { this.lfoFilter.dispose(); this.lfoFilter = null; }
  }

  private disposeLfo(): void {
    for (const node of [this.lfoPitch, this.lfoVolume, this.lfoVolumeOffset, this.lfoFilter, this.lfo]) node?.dispose();
    this.lfoPitch = this.lfoVolume = this.lfoFilter = null;
    this.lfoVolumeOffset = null;
    this.lfo = null;
  }

  dispose(): void {
    this.disposeLfo();
    this.base?.dispose(); this.base = null;
    this.pitch?.dispose(); this.pitch = null;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Voice classes
// ---------------------------------------------------------------------------------------------------------

// A mixin constructor has to take `any[]` (TS2545); the Tone constructors are overloaded.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtor = new (...args: any[]) => any;

/** The members of a Tone Monophonic voice the rig overrides or reads (the d.ts marks the envelope triggers protected). */
interface VoiceInternals {
  dispose(): unknown;
  _triggerEnvelopeAttack(time: number, velocity: number): void;
  _triggerEnvelopeRelease(time: number): void;
}

/** `Base` with a `rig` property: `set({ rig })` and the `rig` constructor option configure the voice's ToneRig. */
function withToneRig<B extends AnyCtor>(Base: B): B {
  class RiggedVoice extends (Base as new (...args: unknown[]) => VoiceInternals & RigHost) {
    private _rig: ToneRig;
    constructor(...args: unknown[]) {
      super(...args);
      const given = (args[0] as { rig?: ToneRigSettings } | undefined)?.rig;
      this._rig = new ToneRig(this, given);
    }
    get rig(): ToneRigSettings { return this._rig.current; }
    set rig(settings: ToneRigSettings) { this._rig.apply(settings); }
    _triggerEnvelopeAttack(time: number, velocity: number): void {
      super._triggerEnvelopeAttack(time, velocity);
      this._rig.attack(time);
    }
    _triggerEnvelopeRelease(time: number): void {
      super._triggerEnvelopeRelease(time);
      this._rig.release(time);
    }
    dispose(): this {
      this._rig.dispose();
      super.dispose();
      return this;
    }
  }
  return RiggedVoice as unknown as B;
}

const voiceClasses = new Map<string, AnyCtor>();

/** Built on first use: importing this module must not touch Tone's classes (tests mock the module). */
export function toneVoiceClass(synthType: 'Synth'): typeof Tone.Synth;
export function toneVoiceClass(synthType: 'MonoSynth'): typeof Tone.MonoSynth;
export function toneVoiceClass(synthType: 'DuoSynth'): typeof Tone.DuoSynth;
export function toneVoiceClass(synthType: 'FMSynth'): typeof Tone.FMSynth;
export function toneVoiceClass(synthType: 'ToneAM'): typeof Tone.AMSynth;
export function toneVoiceClass(synthType: 'Synth' | 'FMSynth' | 'ToneAM'): typeof Tone.Synth | typeof Tone.FMSynth | typeof Tone.AMSynth;
export function toneVoiceClass(synthType: string): AnyCtor {
  if (!MODULATED_TYPES.has(synthType)) throw new Error(`[toneSynthKnobs] ${synthType} has no modulated voice class`);
  let cls = voiceClasses.get(synthType);
  if (!cls) {
    const base: AnyCtor = synthType === 'Synth' ? Tone.Synth
      : synthType === 'MonoSynth' ? Tone.MonoSynth
      : synthType === 'DuoSynth' ? Tone.DuoSynth
      : synthType === 'FMSynth' ? Tone.FMSynth
      : Tone.AMSynth;
    cls = withToneRig(base);
    voiceClasses.set(synthType, cls);
  }
  return cls;
}

// ---------------------------------------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------------------------------------

export interface CreateToneSynthOptions {
  /** One voice per instance (tracker channels: the engine drives pitch effects on it) instead of a PolySynth. Synth: a MonoSynth. */
  monophonic?: boolean;
  /** PolySynth voice limit (Tone's default is 32). */
  polyphony?: number;
  /** The already normalized volume in dB; default: getNormalizedVolume(synthType, config.volume) of the live engine. */
  volumeDb?: number;
}

/** The LFO clock the live markers read: the rate the voice's rig currently runs, 0 when the LFO is off. */
function rigLfoRateHz(node: unknown): number {
  const n = node as { rig?: ToneRigSettings; options?: { rig?: ToneRigSettings } };
  return (n.rig ?? n.options?.rig)?.lfo?.rateHz ?? 0;
}

/**
 * The raw Tone instrument for Synth, MonoSynth, DuoSynth, FMSynth or ToneAM: the rigged voice class, the options of
 * `toneVoiceOptions`, the normalized volume. Every creation path calls this (see the module comment).
 */
export function createToneSynthNode(synthType: string, config: InstrumentConfig, create: CreateToneSynthOptions = {}): Tone.ToneAudioNode {
  if (!MODULATED_TYPES.has(synthType)) throw new Error(`[toneSynthKnobs] ${synthType} is not a modulated Tone synth`);
  const options = toneVoiceOptions(synthType, config);
  const volume = create.volumeDb ?? getNormalizedVolume(synthType, config.volume);
  let node: Tone.ToneAudioNode;
  if (synthType === 'MonoSynth') {
    const filter = { ...(options.filter as Record<string, unknown> | undefined), rolloff: toneFilterRolloff(config) };
    node = new (toneVoiceClass('MonoSynth'))({ ...options, filter, volume } as never);
  } else if (synthType === 'DuoSynth') {
    node = new (toneVoiceClass('DuoSynth'))({ ...options, volume } as never);
  } else if (synthType === 'Synth' && create.monophonic) {
    // Tracker channels: a MonoSynth, so the engine can drive its frequency directly (arpeggio, portamento, vibrato).
    node = new (toneVoiceClass('MonoSynth'))({ ...options, volume } as never);
  } else if (create.monophonic) {
    node = new (toneVoiceClass(synthType as 'FMSynth' | 'ToneAM'))({ ...options, volume } as never);
  } else {
    const voice = toneVoiceClass(synthType as 'Synth' | 'FMSynth' | 'ToneAM');
    const poly = new (Tone.PolySynth as unknown as new (o: Record<string, unknown>) => Tone.PolySynth)({
      voice, options, volume, ...(create.polyphony !== undefined ? { maxPolyphony: create.polyphony } : {}),
    });
    node = poly;
  }
  registerVoiceSource(node, node, { modLfo: { rateHz: () => rigLfoRateHz(node) } });
  return node;
}
