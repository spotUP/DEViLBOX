import type { SynthPreset } from './types';
import type { TunefishInstrumentConfig } from '../../types/tunefishInstrument';
import { DEFAULT_TUNEFISH } from '../../types/tunefishInstrument';

function patch(overrides: Partial<TunefishInstrumentConfig>): Partial<TunefishInstrumentConfig> {
  return { ...DEFAULT_TUNEFISH, ...overrides };
}

export const TUNEFISH_PRESETS: SynthPreset[] = [
  {
    id: 'tf-init',
    name: 'Init',
    description: 'Default Tunefish patch',
    category: 'pad',
    config: patch({}),
  },
  {
    id: 'tf-bright-lead',
    name: 'Bright Lead',
    description: 'Rich additive lead with drive',
    category: 'lead',
    config: patch({ genBandwidth: 0.7, genNumHarmonics: 0.8, genDamp: 0.3, genVolume: 0.85, genDrive: 0.3, lpFilterOn: 1, lpFilterCutoff: 0.7, lpFilterResonance: 0.4 }),
  },
  {
    id: 'tf-sub-bass',
    name: 'Sub Bass',
    description: 'Deep fundamental bass',
    category: 'bass',
    config: patch({ genBandwidth: 0.2, genNumHarmonics: 0.15, genDamp: 0.8, genVolume: 0.9, genOctave: 0.25, lpFilterOn: 1, lpFilterCutoff: 0.3, lpFilterResonance: 0.2 }),
  },
  {
    id: 'tf-warm-pad',
    name: 'Warm Pad',
    description: 'Soft detuned pad with chorus',
    category: 'pad',
    config: patch({ genBandwidth: 0.6, genNumHarmonics: 0.5, genDamp: 0.5, genVolume: 0.7, genUnisono: 0.375, genSpread: 0.6, genDetune: 0.15, chorusRate: 0.3, chorusDepth: 0.5, chorusGain: 0.4, lpFilterOn: 1, lpFilterCutoff: 0.55, lpFilterResonance: 0.1 }),
  },
  {
    id: 'tf-acid-squelch',
    name: 'Acid Squelch',
    description: 'Resonant filter with drive',
    category: 'bass',
    config: patch({ genBandwidth: 0.4, genNumHarmonics: 0.6, genDamp: 0.2, genVolume: 0.9, genDrive: 0.5, lpFilterOn: 1, lpFilterCutoff: 0.35, lpFilterResonance: 0.75 }),
  },
  {
    id: 'tf-glass-bell',
    name: 'Glass Bell',
    description: 'Crystalline bell with harmonics',
    category: 'key',
    config: patch({ genBandwidth: 0.3, genNumHarmonics: 0.9, genDamp: 0.15, genModulation: 0.4, genVolume: 0.6, reverbRoomsize: 0.6, reverbWet: 0.3, reverbWidth: 0.8 }),
  },
  {
    id: 'tf-noise-sweep',
    name: 'Noise Sweep',
    description: 'Filtered noise texture',
    category: 'fx',
    config: patch({ genVolume: 0.3, noiseAmount: 0.8, noiseFreq: 0.6, noiseBw: 0.7, lpFilterOn: 1, lpFilterCutoff: 0.5, lpFilterResonance: 0.5, delayLeft: 0.3, delayRight: 0.4, delayDecay: 0.5 }),
  },
  {
    id: 'tf-pluck',
    name: 'Pluck',
    description: 'Short percussive pluck',
    category: 'pluck',
    config: patch({ genBandwidth: 0.5, genNumHarmonics: 0.7, genDamp: 0.6, genVolume: 0.8, lpFilterOn: 1, lpFilterCutoff: 0.8, lpFilterResonance: 0.15 }),
  },
  {
    id: 'tf-formant-voice',
    name: 'Formant Voice',
    description: 'Vowel-shaped synthesis',
    category: 'pad',
    config: patch({ genBandwidth: 0.5, genNumHarmonics: 0.6, genVolume: 0.7, formantMode: 0.5, formantWet: 0.8, reverbRoomsize: 0.4, reverbWet: 0.2 }),
  },
  {
    id: 'tf-fat-unison',
    name: 'Fat Unison',
    description: 'Thick unison saw lead',
    category: 'lead',
    config: patch({ genBandwidth: 0.8, genNumHarmonics: 0.7, genDamp: 0.3, genVolume: 0.85, genUnisono: 0.5, genSpread: 0.7, genDetune: 0.08, genDrive: 0.2, lpFilterOn: 1, lpFilterCutoff: 0.65, lpFilterResonance: 0.3 }),
  },
  {
    id: 'tf-flanger-pad',
    name: 'Flanger Pad',
    description: 'Flanged evolving texture',
    category: 'pad',
    config: patch({ genBandwidth: 0.55, genNumHarmonics: 0.45, genDamp: 0.5, genVolume: 0.65, flangerLfo: 0.3, flangerFrequency: 0.4, flangerAmplitude: 0.6, flangerWet: 0.5, reverbRoomsize: 0.5, reverbWet: 0.25 }),
  },
  {
    id: 'tf-distorted-bass',
    name: 'Distorted Bass',
    description: 'Heavy distorted bass growl',
    category: 'bass',
    config: patch({ genBandwidth: 0.35, genNumHarmonics: 0.5, genDamp: 0.4, genVolume: 0.9, genOctave: 0.3, genDrive: 0.7, distortAmount: 0.6, lpFilterOn: 1, lpFilterCutoff: 0.4, lpFilterResonance: 0.3 }),
  },
];
