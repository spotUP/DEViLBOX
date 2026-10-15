/**
 * Built-in Tone.js synth registrations
 *
 * Registers the 9 core Tone.js synths with the SynthRegistry.
 * These were previously created via InstrumentFactory.createSynth/createMonoSynth/etc.
 */

import * as Tone from 'tone';
import { SynthRegistry } from '../SynthRegistry';
import type { SynthDescriptor } from '../SynthDescriptor';
import { registerVoiceSource } from '../../tone/toneVoiceProbe';
import { getNormalizedVolume } from '../../factories/volumeNormalization';
import { createToneSynthNode, toneVoiceOptions } from '../../tone/toneSynthKnobs';

// The accent boost factor — must match ToneEngine.ACCENT_BOOST
const ACCENT_BOOST = 1.35;

const toneSynths: SynthDescriptor[] = [
  {
    id: 'Synth',
    name: 'Synth',
    category: 'tone',
    loadMode: 'eager',
    volumeOffsetDb: 11,
    create: (config) => createToneSynthNode('Synth', config),
  },
  {
    id: 'MonoSynth',
    name: 'Mono Synth',
    category: 'tone',
    loadMode: 'eager',
    volumeOffsetDb: 14,
    create: (config) => createToneSynthNode('MonoSynth', config),
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
    create: (config) => createToneSynthNode('DuoSynth', config),
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
    create: (config) => createToneSynthNode('FMSynth', config),
  },
  {
    id: 'ToneAM',
    name: 'AM Synth',
    category: 'tone',
    loadMode: 'eager',
    volumeOffsetDb: 22,
    create: (config) => createToneSynthNode('ToneAM', config),
  },
  {
    id: 'PluckSynth',
    name: 'Pluck Synth',
    category: 'tone',
    loadMode: 'eager',
    volumeOffsetDb: 32,
    create: (config) => {
      // Use a plain PluckSynth (not PolySynth wrapper) so the FeedbackCombFilter AudioWorklet
      // is created ONCE at construction time. synthTester's workletsAreReady() + 50ms wait
      // ensures onReady fires and connects the audio chain before any note is triggered.
      // With PolySynth, each triggerAttack creates a NEW voice with a NEW FeedbackCombFilter
      // whose onReady fires as a microtask — a race condition with audio rendering that produces
      // silence in the tester. Plain PluckSynth avoids this by reusing the pre-connected filter.
      const synth = new Tone.PluckSynth(toneVoiceOptions('PluckSynth', config));
      synth.volume.value = getNormalizedVolume('PluckSynth', config.volume);
      // Wrapper hides .output → path B (Tone.Analyser) in synthTester
      return registerVoiceSource({
        triggerAttackRelease: (note: string, duration: number, time?: number) =>
          synth.triggerAttackRelease(note, duration, time),
        triggerAttack: (note: string, time?: number) =>
          synth.triggerAttack(note, time),
        triggerRelease: (_note: string, time?: number) => synth.triggerRelease(time),
        releaseAll: () => { /* PluckSynth has no releaseAll — no-op */ },
        connect: (dest: Tone.InputNode) => synth.connect(dest),
        disconnect: () => synth.disconnect(),
        dispose: () => synth.dispose(),
        volume: synth.volume,
      } as unknown as Tone.ToneAudioNode, synth);
    },
  },
  {
    id: 'MetalSynth',
    name: 'Metal Synth',
    category: 'tone',
    loadMode: 'eager',
    volumeOffsetDb: 23,
    create: (config) => {
      const synth = new Tone.MetalSynth({ ...toneVoiceOptions('MetalSynth', config), volume: getNormalizedVolume('MetalSynth', config.volume) } as Partial<Tone.MetalSynthOptions>);
      return registerVoiceSource({
        triggerAttack: (note: string | number, time: number, velocity?: number) => synth.triggerAttack(note, time, velocity),
        triggerRelease: (time?: number) => synth.triggerRelease(time),
        triggerAttackRelease: (duration: string | number, time?: number, velocity?: number) =>
          synth.triggerAttackRelease(duration, time ?? Tone.now(), velocity),
        releaseAll: () => { /* MetalSynth has no releaseAll — no-op */ },
        connect: (dest: Tone.InputNode) => synth.connect(dest),
        disconnect: () => synth.disconnect(),
        dispose: () => synth.dispose(),
        volume: synth.volume,
      } as unknown as Tone.ToneAudioNode, synth);
    },
    onTriggerAttack: (synth, note, time, velocity, opts) => {
      const finalVelocity = opts.accent ? Math.min(1, velocity * ACCENT_BOOST) : velocity;
      (synth as unknown as { triggerAttack: (n: string | number, t: number, v: number) => void }).triggerAttack(note, time, finalVelocity);
      return true;
    },
    onTriggerRelease: (synth, _note, time) => {
      (synth as unknown as { triggerRelease: (t: number) => void }).triggerRelease(time);
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
      return new Tone.MembraneSynth({ ...toneVoiceOptions('MembraneSynth', config), volume: getNormalizedVolume('MembraneSynth', config.volume) } as Partial<Tone.MembraneSynthOptions>);
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
      return new Tone.NoiseSynth({ ...toneVoiceOptions('NoiseSynth', config), volume: getNormalizedVolume('NoiseSynth', config.volume) } as Partial<Tone.NoiseSynthOptions>);
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
