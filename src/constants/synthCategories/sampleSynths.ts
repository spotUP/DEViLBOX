import type { SynthInfo } from './types';

export const sampleSynthEntries: Record<string, SynthInfo> = {
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
