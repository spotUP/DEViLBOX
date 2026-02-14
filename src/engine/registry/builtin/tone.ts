/**
 * Built-in Tone.js synth registrations
 *
 * Registers the 9 core Tone.js synths with the SynthRegistry.
 * These were previously created via InstrumentFactory.createSynth/createMonoSynth/etc.
 */

import * as Tone from 'tone';
import { SynthRegistry } from '../SynthRegistry';
import type { SynthDescriptor } from '../SynthDescriptor';
import type { InstrumentConfig } from '@typedefs/instrument';

// Volume normalization offsets (from InstrumentFactory.VOLUME_NORMALIZATION_OFFSETS)
const TONE_VOLUME_OFFSETS: Record<string, number> = {
  Synth: 11,
  MonoSynth: 14,
  DuoSynth: 5,
  FMSynth: 16,
  AMSynth: 22,
  PluckSynth: 32,
  MetalSynth: 23,
  MembraneSynth: 10,
  NoiseSynth: 7,
};

function getNormalizedVolume(synthType: string, configVolume: number | undefined): number {
  const baseVolume = configVolume ?? -12;
  const offset = TONE_VOLUME_OFFSETS[synthType] ?? 0;
  return baseVolume + offset;
}

/** Shared helper: extract standard envelope from config */
function getEnvelope(config: InstrumentConfig) {
  return {
    attack: (config.envelope?.attack ?? 10) / 1000,
    decay: (config.envelope?.decay ?? 200) / 1000,
    sustain: (config.envelope?.sustain ?? 50) / 100,
    release: (config.envelope?.release ?? 1000) / 1000,
  };
}

// The accent boost factor — must match ToneEngine.ACCENT_BOOST
const ACCENT_BOOST = 1.35;

const toneSynths: SynthDescriptor[] = [
  {
    id: 'Synth',
    name: 'Synth',
    category: 'tone',
    loadMode: 'eager',
    volumeOffsetDb: 11,
    create: (config) => {
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: {
          type: (config.oscillator?.type || 'sawtooth') as Tone.ToneOscillatorType,
        } as Partial<Tone.OmniOscillatorOptions>,
        envelope: getEnvelope(config),
        volume: getNormalizedVolume('Synth', config.volume),
      });
      if (config.oscillator?.detune) {
        synth.set({ detune: config.oscillator.detune });
      }
      // Pitch envelope wrapping is handled by InstrumentFactory's static helpers
      // which are still accessible. For now, return synth directly — pitch envelope
      // is applied via the existing InstrumentFactory code path.
      return synth;
    },
  },
  {
    id: 'MonoSynth',
    name: 'Mono Synth',
    category: 'tone',
    loadMode: 'eager',
    volumeOffsetDb: 14,
    create: (config) => {
      const monoConfig: Record<string, unknown> = {
        oscillator: {
          type: (config.oscillator?.type || 'sawtooth') as Tone.ToneOscillatorType,
          detune: config.oscillator?.detune || 0,
        },
        envelope: getEnvelope(config),
        volume: getNormalizedVolume('MonoSynth', config.volume),
      };
      if (config.filter && config.filter.type && config.filter.frequency) {
        monoConfig.filter = {
          type: config.filter.type,
          frequency: config.filter.frequency,
          Q: config.filter.Q ?? 1,
          rolloff: config.filter.rolloff ?? -12,
        };
      }
      if (config.filterEnvelope && config.filterEnvelope.baseFrequency !== undefined && config.filterEnvelope.attack !== undefined) {
        monoConfig.filterEnvelope = {
          baseFrequency: config.filterEnvelope.baseFrequency,
          octaves: config.filterEnvelope.octaves ?? 3,
          attack: config.filterEnvelope.attack / 1000,
          decay: (config.filterEnvelope.decay ?? 200) / 1000,
          sustain: (config.filterEnvelope.sustain ?? 50) / 100,
          release: (config.filterEnvelope.release ?? 1000) / 1000,
        };
      }
      return new Tone.MonoSynth(monoConfig as unknown as Tone.MonoSynthOptions);
    },
    onTriggerRelease: (_synth, _note, time) => {
      // MonoSynth uses triggerRelease(time) — no note parameter
      (_synth as Tone.MonoSynth).triggerRelease(time);
      return true;
    },
  },
  {
    id: 'DuoSynth',
    name: 'Duo Synth',
    category: 'tone',
    loadMode: 'eager',
    volumeOffsetDb: 5,
    create: (config) => {
      const oscType = (config.oscillator?.type || 'sawtooth') as Tone.ToneOscillatorType;
      const env = getEnvelope(config);
      return new Tone.DuoSynth({
        voice0: {
          oscillator: { type: oscType } as Partial<Tone.OmniOscillatorOptions>,
          envelope: env,
        },
        voice1: {
          oscillator: { type: oscType } as Partial<Tone.OmniOscillatorOptions>,
          envelope: env,
        },
        vibratoAmount: config.oscillator?.detune ? config.oscillator.detune / 100 : 0.5,
        vibratoRate: 5,
        volume: getNormalizedVolume('DuoSynth', config.volume),
      });
    },
    onTriggerRelease: (_synth, _note, time) => {
      (_synth as Tone.DuoSynth).triggerRelease(time);
      return true;
    },
  },
  {
    id: 'FMSynth',
    name: 'FM Synth',
    category: 'tone',
    loadMode: 'eager',
    volumeOffsetDb: 16,
    create: (config) => {
      return new Tone.PolySynth(Tone.FMSynth, {
        oscillator: {
          type: config.oscillator?.type || 'sine',
        } as Partial<Tone.OmniOscillatorOptions>,
        envelope: getEnvelope(config),
        modulationIndex: 10,
        volume: getNormalizedVolume('FMSynth', config.volume),
      });
    },
  },
  {
    id: 'AMSynth',
    name: 'AM Synth',
    category: 'tone',
    loadMode: 'eager',
    volumeOffsetDb: 22,
    create: (config) => {
      return new Tone.PolySynth(Tone.AMSynth, {
        oscillator: {
          type: config.oscillator?.type || 'sine',
        } as Partial<Tone.OmniOscillatorOptions>,
        envelope: getEnvelope(config),
        volume: getNormalizedVolume('AMSynth', config.volume),
      });
    },
  },
  {
    id: 'PluckSynth',
    name: 'Pluck Synth',
    category: 'tone',
    loadMode: 'eager',
    volumeOffsetDb: 32,
    create: (config) => {
      const synth = new Tone.PolySynth(Tone.PluckSynth as unknown as typeof Tone.Synth);
      synth.set({
        attackNoise: 1,
        dampening: 4000,
        resonance: 0.7,
      } as unknown as Partial<Tone.SynthOptions>);
      synth.volume.value = getNormalizedVolume('PluckSynth', config.volume);
      return synth;
    },
  },
  {
    id: 'MetalSynth',
    name: 'Metal Synth',
    category: 'tone',
    loadMode: 'eager',
    volumeOffsetDb: 23,
    create: (config) => {
      return new Tone.MetalSynth({
        envelope: {
          attack: (config.envelope?.attack ?? 1) / 1000,
          decay: (config.envelope?.decay ?? 100) / 1000,
          release: (config.envelope?.release ?? 100) / 1000,
        },
        volume: getNormalizedVolume('MetalSynth', config.volume),
      });
    },
    onTriggerAttack: (synth, _note, time, velocity, opts) => {
      const finalVelocity = opts.accent ? Math.min(1, velocity * ACCENT_BOOST) : velocity;
      (synth as Tone.MetalSynth).triggerAttack(time, finalVelocity);
      return true;
    },
    onTriggerRelease: (synth, _note, time) => {
      (synth as Tone.MetalSynth).triggerRelease(time);
      return true;
    },
  },
  {
    id: 'MembraneSynth',
    name: 'Membrane Synth',
    category: 'tone',
    loadMode: 'eager',
    volumeOffsetDb: 10,
    create: (config) => {
      return new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 10,
        oscillator: {
          type: config.oscillator?.type || 'sine',
        } as Partial<Tone.OmniOscillatorOptions>,
        envelope: {
          attack: (config.envelope?.attack ?? 1) / 1000,
          decay: (config.envelope?.decay ?? 400) / 1000,
          sustain: 0.01,
          release: (config.envelope?.release ?? 100) / 1000,
        },
        volume: getNormalizedVolume('MembraneSynth', config.volume),
      });
    },
    onTriggerAttack: (synth, note, time, velocity, opts) => {
      const finalVelocity = opts.accent ? Math.min(1, velocity * ACCENT_BOOST) : velocity;
      (synth as Tone.MembraneSynth).triggerAttack(note, time, finalVelocity);
      return true;
    },
    onTriggerRelease: (synth, _note, time) => {
      (synth as Tone.MembraneSynth).triggerRelease(time);
      return true;
    },
  },
  {
    id: 'NoiseSynth',
    name: 'Noise Synth',
    category: 'tone',
    loadMode: 'eager',
    volumeOffsetDb: 7,
    create: (config) => {
      return new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: getEnvelope(config),
        volume: getNormalizedVolume('NoiseSynth', config.volume),
      });
    },
    onTriggerAttack: (synth, _note, time, velocity, opts) => {
      const finalVelocity = opts.accent ? Math.min(1, velocity * ACCENT_BOOST) : velocity;
      (synth as Tone.NoiseSynth).triggerAttack(time, finalVelocity);
      return true;
    },
    onTriggerRelease: (synth, _note, time) => {
      (synth as Tone.NoiseSynth).triggerRelease(time);
      return true;
    },
  },
];

SynthRegistry.register(toneSynths);
