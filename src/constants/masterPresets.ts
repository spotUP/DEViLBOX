import type { InstrumentConfig } from '../types/instrument';
import type { Pattern } from '../types/tracker';
import { TB303_PRESETS } from './tb303Presets';

export interface MasterPreset {
  id: string;
  name: string;
  description: string;
  category: 'acid' | 'techno' | 'house' | 'general';
  instruments: InstrumentConfig[];
  bpm?: number;
  // Optional starting pattern
  patterns?: Pattern[];
}

export const MASTER_PRESETS: MasterPreset[] = [
  {
    id: 'acid-core',
    name: 'Acid Core',
    description: 'Classic TB-303 + TR-909 setup',
    category: 'acid',
    bpm: 140,
    instruments: [
      {
        ...TB303_PRESETS[0],
        id: 1,
        name: '303 Bassline',
        type: 'synth',
        volume: -12
      } as InstrumentConfig,
      {
        id: 2,
        name: '909 Kick',
        type: 'synth',
        synthType: 'DrumMachine',
        drumMachine: { drumType: 'kick' },
        volume: -6
      } as InstrumentConfig,
      {
        id: 3,
        name: '909 Snare',
        type: 'synth',
        synthType: 'DrumMachine',
        drumMachine: { drumType: 'snare' },
        volume: -10
      } as InstrumentConfig,
      {
        id: 4,
        name: '909 Open Hihat',
        type: 'synth',
        synthType: 'DrumMachine',
        drumMachine: { drumType: 'hihat' },
        volume: -12
      } as InstrumentConfig
    ]
  },
  {
    id: 'deep-house',
    name: 'Deep House',
    description: 'Atmospheric house tools',
    category: 'house',
    bpm: 124,
    instruments: [
      {
        id: 1,
        name: 'Deep Bass',
        type: 'synth',
        synthType: 'Synth',
        oscillator: { type: 'sine', detune: 0 },
        volume: -10
      } as InstrumentConfig,
      {
        id: 2,
        name: '808 Kick',
        type: 'synth',
        synthType: 'DrumMachine',
        drumMachine: { drumType: 'kick' },
        volume: -6
      } as InstrumentConfig,
      {
        id: 3,
        name: 'Chord Stab',
        type: 'synth',
        synthType: 'PolySynth',
        polySynth: { voiceCount: 4, voiceType: 'Synth', oscillator: { type: 'square' }, envelope: { attack: 10, decay: 300, sustain: 0, release: 100 } },
        volume: -12
      } as InstrumentConfig
    ]
  }
];
