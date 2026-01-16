/**
 * Synth Categories - Organized synth types with descriptions and guidance
 */

import type { SynthType } from '@typedefs/instrument';

export interface SynthInfo {
  type: SynthType;
  name: string;
  shortName: string;
  description: string;
  bestFor: string[];
  icon: string; // Lucide icon name
  color: string; // Tailwind color class
}

export interface SynthCategory {
  id: string;
  name: string;
  description: string;
  synths: SynthInfo[];
}

// Individual synth information
export const SYNTH_INFO: Record<SynthType, SynthInfo> = {
  TB303: {
    type: 'TB303',
    name: 'TB-303',
    shortName: '303',
    description: 'Classic acid bass synthesizer with resonant filter and slide',
    bestFor: ['Acid bass', 'Squelchy lines', 'Techno', 'House'],
    icon: 'Zap',
    color: 'text-accent-primary',
  },
  MonoSynth: {
    type: 'MonoSynth',
    name: 'Mono Synth',
    shortName: 'Mono',
    description: 'Single-voice synth with oscillator, filter, and envelope',
    bestFor: ['Bass', 'Lead lines', 'Portamento'],
    icon: 'AudioLines',
    color: 'text-blue-400',
  },
  Synth: {
    type: 'Synth',
    name: 'Basic Synth',
    shortName: 'Synth',
    description: 'Simple polyphonic synthesizer with amplitude envelope',
    bestFor: ['Pads', 'Chords', 'Simple sounds'],
    icon: 'Music2',
    color: 'text-purple-400',
  },
  DuoSynth: {
    type: 'DuoSynth',
    name: 'Duo Synth',
    shortName: 'Duo',
    description: 'Two-voice synth with harmonics and vibratoesque LFO',
    bestFor: ['Rich leads', 'Detuned sounds', 'Fat bass'],
    icon: 'Layers',
    color: 'text-indigo-400',
  },
  FMSynth: {
    type: 'FMSynth',
    name: 'FM Synth',
    shortName: 'FM',
    description: 'Frequency modulation synth for complex harmonic tones',
    bestFor: ['Bells', 'Electric piano', 'Metallic sounds'],
    icon: 'Radio',
    color: 'text-cyan-400',
  },
  AMSynth: {
    type: 'AMSynth',
    name: 'AM Synth',
    shortName: 'AM',
    description: 'Amplitude modulation synth with ring modulation character',
    bestFor: ['Tremolo effects', 'Ring mod', 'Atmospheric'],
    icon: 'Activity',
    color: 'text-teal-400',
  },
  PluckSynth: {
    type: 'PluckSynth',
    name: 'Pluck Synth',
    shortName: 'Pluck',
    description: 'Karplus-Strong string synthesis for plucked strings',
    bestFor: ['Guitar', 'Harp', 'Pizzicato', 'String plucks'],
    icon: 'Guitar',
    color: 'text-amber-400',
  },
  MembraneSynth: {
    type: 'MembraneSynth',
    name: 'Membrane Synth',
    shortName: 'Membrane',
    description: 'Drum membrane simulation for kicks and toms',
    bestFor: ['Kick drums', 'Toms', 'Percussion'],
    icon: 'Circle',
    color: 'text-orange-400',
  },
  MetalSynth: {
    type: 'MetalSynth',
    name: 'Metal Synth',
    shortName: 'Metal',
    description: 'Metallic percussion synthesis with harmonics',
    bestFor: ['Hi-hats', 'Cymbals', 'Bells', 'Metallic hits'],
    icon: 'Hexagon',
    color: 'text-yellow-400',
  },
  NoiseSynth: {
    type: 'NoiseSynth',
    name: 'Noise Synth',
    shortName: 'Noise',
    description: 'Filtered noise generator with envelope',
    bestFor: ['Snares', 'Hi-hats', 'Risers', 'FX'],
    icon: 'Hash',
    color: 'text-gray-400',
  },
  Wavetable: {
    type: 'Wavetable',
    name: 'Wavetable',
    shortName: 'Wave',
    description: 'Wavetable synth with morphing and unison',
    bestFor: ['Evolving pads', 'Modern bass', 'Complex timbres'],
    icon: 'Waves',
    color: 'text-pink-400',
  },
  Sampler: {
    type: 'Sampler',
    name: 'Sampler',
    shortName: 'Sampler',
    description: 'Multi-sample playback with velocity layers',
    bestFor: ['Realistic instruments', 'Sample kits', 'One-shots'],
    icon: 'FileAudio',
    color: 'text-rose-400',
  },
  Player: {
    type: 'Player',
    name: 'Sample Player',
    shortName: 'Player',
    description: 'Simple one-shot sample playback',
    bestFor: ['Loops', 'One-shots', 'Vocal samples'],
    icon: 'Play',
    color: 'text-lime-400',
  },
};

// Organized categories
export const SYNTH_CATEGORIES: SynthCategory[] = [
  {
    id: 'bass',
    name: 'Bass',
    description: 'Deep and punchy bass synths',
    synths: [SYNTH_INFO.TB303, SYNTH_INFO.MonoSynth],
  },
  {
    id: 'lead',
    name: 'Lead',
    description: 'Melodic lead synthesizers',
    synths: [
      SYNTH_INFO.Synth,
      SYNTH_INFO.DuoSynth,
      SYNTH_INFO.FMSynth,
      SYNTH_INFO.AMSynth,
      SYNTH_INFO.PluckSynth,
    ],
  },
  {
    id: 'drums',
    name: 'Drums',
    description: 'Percussion and drum synthesis',
    synths: [SYNTH_INFO.MembraneSynth, SYNTH_INFO.MetalSynth, SYNTH_INFO.NoiseSynth],
  },
  {
    id: 'pads',
    name: 'Pads',
    description: 'Evolving textures and pads',
    synths: [SYNTH_INFO.Synth, SYNTH_INFO.DuoSynth, SYNTH_INFO.Wavetable],
  },
  {
    id: 'samples',
    name: 'Samples',
    description: 'Sample-based instruments',
    synths: [SYNTH_INFO.Sampler, SYNTH_INFO.Player],
  },
];

// Get all synth types as a flat list
export const ALL_SYNTH_TYPES: SynthType[] = Object.keys(SYNTH_INFO) as SynthType[];

// Helper to get category for a synth type (returns primary category)
export function getCategoryForSynth(synthType: SynthType): SynthCategory | undefined {
  return SYNTH_CATEGORIES.find((cat) => cat.synths.some((s) => s.type === synthType));
}

// Helper to get synth info
export function getSynthInfo(synthType: SynthType): SynthInfo {
  return SYNTH_INFO[synthType];
}
