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
  GranularSynth: {
    type: 'GranularSynth',
    name: 'Granular Synth',
    shortName: 'Granular',
    description: 'Sample-based granular synthesis with grain manipulation',
    bestFor: ['Textures', 'Pads', 'Ambient', 'Sound design', 'Glitch'],
    icon: 'Sparkles',
    color: 'text-violet-400',
  },
  // New synths
  SuperSaw: {
    type: 'SuperSaw',
    name: 'SuperSaw',
    shortName: 'SSaw',
    description: 'Massive detuned saw waves for trance and EDM',
    bestFor: ['Trance leads', 'EDM drops', 'Big chords', 'Supersaw stabs'],
    icon: 'Layers',
    color: 'text-orange-500',
  },
  PolySynth: {
    type: 'PolySynth',
    name: 'Poly Synth',
    shortName: 'Poly',
    description: 'True polyphonic synth with voice management',
    bestFor: ['Chords', 'Pads', 'Polyphonic parts', 'Layered sounds'],
    icon: 'LayoutGrid',
    color: 'text-blue-500',
  },
  Organ: {
    type: 'Organ',
    name: 'Drawbar Organ',
    shortName: 'Organ',
    description: 'Hammond-style tonewheel organ with drawbars',
    bestFor: ['House', 'Gospel', 'Jazz', 'Rock organ'],
    icon: 'Piano',
    color: 'text-amber-600',
  },
  DrumMachine: {
    type: 'DrumMachine',
    name: 'Drum Machine',
    shortName: '808/909',
    description: 'Analog drum synthesis (808/909 style)',
    bestFor: ['Kicks', 'Snares', 'Hi-hats', 'Electronic drums'],
    icon: 'Disc',
    color: 'text-red-500',
  },
  ChipSynth: {
    type: 'ChipSynth',
    name: 'Chip Synth',
    shortName: 'Chip',
    description: '8-bit video game console sounds',
    bestFor: ['Chiptune', 'Retro', 'Lo-fi', 'Arpeggios'],
    icon: 'Gamepad2',
    color: 'text-green-400',
  },
  PWMSynth: {
    type: 'PWMSynth',
    name: 'PWM Synth',
    shortName: 'PWM',
    description: 'Pulse width modulation for rich analog tones',
    bestFor: ['Analog pads', 'Warm leads', 'Classic synth'],
    icon: 'Waves',
    color: 'text-emerald-400',
  },
  StringMachine: {
    type: 'StringMachine',
    name: 'String Machine',
    shortName: 'Strings',
    description: 'Vintage ensemble strings (Solina-style)',
    bestFor: ['Lush pads', 'Disco strings', 'Ambient', 'Retro'],
    icon: 'Music4',
    color: 'text-rose-400',
  },
  FormantSynth: {
    type: 'FormantSynth',
    name: 'Formant Synth',
    shortName: 'Vocal',
    description: 'Vowel synthesis for vocal-like sounds',
    bestFor: ['Vocal pads', 'Talk box', 'Choir', 'Robotic'],
    icon: 'Mic',
    color: 'text-fuchsia-400',
  },
  ChiptuneModule: {
    type: 'ChiptuneModule',
    name: 'Chiptune Module',
    shortName: 'MOD',
    description: 'Libopenmpt-powered playback for MOD/XM/IT/S3M files',
    bestFor: ['Tracker modules', 'Retro game music', 'Sample-accurate playback'],
    icon: 'Gamepad2',
    color: 'text-lime-400',
  },
};

// Organized categories
export const SYNTH_CATEGORIES: SynthCategory[] = [
  {
    id: 'bass',
    name: 'Bass',
    description: 'Deep and punchy bass synths',
    synths: [SYNTH_INFO.TB303, SYNTH_INFO.MonoSynth, SYNTH_INFO.SuperSaw],
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
      SYNTH_INFO.SuperSaw,
      SYNTH_INFO.ChipSynth,
      SYNTH_INFO.PWMSynth,
      SYNTH_INFO.FormantSynth,
    ],
  },
  {
    id: 'drums',
    name: 'Drums',
    description: 'Percussion and drum synthesis',
    synths: [SYNTH_INFO.MembraneSynth, SYNTH_INFO.MetalSynth, SYNTH_INFO.NoiseSynth, SYNTH_INFO.DrumMachine],
  },
  {
    id: 'pads',
    name: 'Pads',
    description: 'Evolving textures and pads',
    synths: [SYNTH_INFO.Synth, SYNTH_INFO.DuoSynth, SYNTH_INFO.Wavetable, SYNTH_INFO.GranularSynth, SYNTH_INFO.PolySynth, SYNTH_INFO.StringMachine, SYNTH_INFO.PWMSynth],
  },
  {
    id: 'keys',
    name: 'Keys',
    description: 'Keyboard instruments',
    synths: [SYNTH_INFO.FMSynth, SYNTH_INFO.Organ],
  },
  {
    id: 'samples',
    name: 'Samples',
    description: 'Sample-based instruments',
    synths: [SYNTH_INFO.Sampler, SYNTH_INFO.Player, SYNTH_INFO.GranularSynth],
  },
];

// Get all synth types as a flat list (sorted A-Z by short name)
export const ALL_SYNTH_TYPES: SynthType[] = (Object.keys(SYNTH_INFO) as SynthType[]).sort((a, b) =>
  SYNTH_INFO[a].shortName.localeCompare(SYNTH_INFO[b].shortName)
);

// Helper to get category for a synth type (returns primary category)
export function getCategoryForSynth(synthType: SynthType): SynthCategory | undefined {
  return SYNTH_CATEGORIES.find((cat) => cat.synths.some((s) => s.type === synthType));
}

// Helper to get synth info
export function getSynthInfo(synthType: SynthType): SynthInfo {
  return SYNTH_INFO[synthType];
}
