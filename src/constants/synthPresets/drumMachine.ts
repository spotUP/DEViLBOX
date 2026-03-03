import type { SynthPreset } from './types';
import type { DrumMachineConfig } from '../../types/instrument';

export const DRUM_MACHINE_PRESETS: SynthPreset[] = [
  {
    id: 'drum-909-kick',
    name: '909 Kick',
    description: 'Classic TR-909 kick',
    category: 'drum',
    config: {
      drumType: 'kick',
      machineType: '909',
      kick: { pitch: 80, decay: 300, drive: 50, envAmount: 2.5, envDuration: 50, filterFreq: 3000 },
    } as Partial<DrumMachineConfig>,
  },
  {
    id: 'drum-808-kick',
    name: '808 Kick',
    description: 'Booming TR-808 kick',
    category: 'drum',
    config: {
      drumType: 'kick',
      machineType: '808',
      kick: { pitch: 48, decay: 400, drive: 60, envAmount: 2.0, envDuration: 110, filterFreq: 250 },
    } as Partial<DrumMachineConfig>,
  },
  {
    id: 'drum-909-snare',
    name: '909 Snare',
    description: 'Punchy TR-909 snare',
    category: 'drum',
    config: {
      drumType: 'snare',
      machineType: '909',
      snare: { pitch: 220, decay: 100, snappy: 70, envAmount: 4.0, filterType: 'notch', filterFreq: 1000 },
    } as Partial<DrumMachineConfig>,
  },
  {
    id: 'drum-808-snare',
    name: '808 Snare',
    description: 'Crisp TR-808 snare',
    category: 'drum',
    config: {
      drumType: 'snare',
      machineType: '808',
      snare: { pitch: 238, decay: 100, snappy: 60, envAmount: 1.0, filterType: 'highpass', filterFreq: 1000 },
    } as Partial<DrumMachineConfig>,
  },
  {
    id: 'drum-909-clap',
    name: '909 Clap',
    description: 'Filtered noise clap',
    category: 'drum',
    config: {
      drumType: 'clap',
      machineType: '909',
      clap: { tone: 55, decay: 80, spread: 10, filterFreqs: [900, 1200], modulatorFreq: 40 },
    } as Partial<DrumMachineConfig>,
  },
  {
    id: 'drum-808-clap',
    name: '808 Clap',
    description: 'Classic 808 clap',
    category: 'drum',
    config: {
      drumType: 'clap',
      machineType: '808',
      clap: { tone: 50, decay: 115, spread: 100, filterFreqs: [1000, 1000], modulatorFreq: 10 },
    } as Partial<DrumMachineConfig>,
  },
  {
    id: 'drum-closed-hat',
    name: 'Closed Hat',
    description: 'Tight closed hi-hat',
    category: 'drum',
    config: {
      drumType: 'hihat',
      machineType: '808',
      hihat: { tone: 60, decay: 50, metallic: 60 },
    } as Partial<DrumMachineConfig>,
  },
  {
    id: 'drum-open-hat',
    name: 'Open Hat',
    description: 'Sustaining open hi-hat',
    category: 'drum',
    config: {
      drumType: 'hihat',
      machineType: '808',
      hihat: { tone: 50, decay: 300, metallic: 50 },
    } as Partial<DrumMachineConfig>,
  },
  {
    id: 'drum-low-tom',
    name: 'Low Tom',
    description: 'Deep floor tom',
    category: 'drum',
    config: {
      drumType: 'tom',
      machineType: '808',
      tom: { pitch: 100, decay: 250, tone: 10, envAmount: 2.0, envDuration: 100 },
    } as Partial<DrumMachineConfig>,
  },
  {
    id: 'drum-mid-tom',
    name: 'Mid Tom',
    description: 'Medium tom',
    category: 'drum',
    config: {
      drumType: 'tom',
      machineType: '808',
      tom: { pitch: 150, decay: 200, tone: 8, envAmount: 2.0, envDuration: 100 },
    } as Partial<DrumMachineConfig>,
  },
  {
    id: 'drum-high-tom',
    name: 'High Tom',
    description: 'High rack tom',
    category: 'drum',
    config: {
      drumType: 'tom',
      machineType: '808',
      tom: { pitch: 200, decay: 180, tone: 5, envAmount: 2.0, envDuration: 100 },
    } as Partial<DrumMachineConfig>,
  },
  {
    id: 'drum-cowbell',
    name: 'Cowbell',
    description: '808 cowbell',
    category: 'drum',
    config: {
      drumType: 'cowbell',
      machineType: '808',
      cowbell: { decay: 400, filterFreq: 2640 },
    } as Partial<DrumMachineConfig>,
  },
  {
    id: 'drum-rimshot',
    name: 'Rimshot',
    description: 'Resonant rim click',
    category: 'drum',
    config: {
      drumType: 'rimshot',
      machineType: '909',
      rimshot: { decay: 30, filterFreqs: [220, 500, 950], filterQ: 10.5, saturation: 3.0 },
    } as Partial<DrumMachineConfig>,
  },
  {
    id: 'drum-clave',
    name: 'Clave',
    description: '808 wood clave',
    category: 'drum',
    config: {
      drumType: 'clave',
      machineType: '808',
      clave: { decay: 40, pitch: 2450, pitchSecondary: 1750, filterFreq: 2450 },
    } as Partial<DrumMachineConfig>,
  },
  {
    id: 'drum-conga-low',
    name: 'Low Conga',
    description: '808 tumba',
    category: 'drum',
    config: {
      drumType: 'conga',
      machineType: '808',
      conga: { pitch: 195, decay: 180, tuning: 0 },
    } as Partial<DrumMachineConfig>,
  },
  {
    id: 'drum-conga-mid',
    name: 'Mid Conga',
    description: '808 conga',
    category: 'drum',
    config: {
      drumType: 'conga',
      machineType: '808',
      conga: { pitch: 280, decay: 180, tuning: 50 },
    } as Partial<DrumMachineConfig>,
  },
  {
    id: 'drum-conga-high',
    name: 'High Conga',
    description: '808 quinto',
    category: 'drum',
    config: {
      drumType: 'conga',
      machineType: '808',
      conga: { pitch: 410, decay: 180, tuning: 100 },
    } as Partial<DrumMachineConfig>,
  },
  {
    id: 'drum-maracas',
    name: 'Maracas',
    description: '808 shaker',
    category: 'drum',
    config: {
      drumType: 'maracas',
      machineType: '808',
      maracas: { decay: 30, filterFreq: 5000 },
    } as Partial<DrumMachineConfig>,
  },
  {
    id: 'drum-cymbal',
    name: 'Crash Cymbal',
    description: '808 crash',
    category: 'drum',
    config: {
      drumType: 'cymbal',
      machineType: '808',
      cymbal: { tone: 50, decay: 3000 },
    } as Partial<DrumMachineConfig>,
  },
  {
    id: 'drum-trap-kick',
    name: 'Trap Kick',
    description: '808 sub kick for trap',
    category: 'drum',
    config: {
      drumType: 'kick',
      machineType: '808',
      kick: { pitch: 40, decay: 600, drive: 40, envAmount: 3.0, envDuration: 150, filterFreq: 200 },
    } as Partial<DrumMachineConfig>,
  },
];

// ============================================
// PWM SYNTH PRESETS
// ============================================

