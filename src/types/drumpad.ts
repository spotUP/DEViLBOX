/**
 * Drum Pad Types - MPC-inspired drum pad system
 */

import type { InstrumentConfig } from './instrument/defaults';
import type { SynthType, EnvelopeConfig } from './instrument/base';
import type { DrumType, DrumMachineType } from './instrument/drums';
import type { DjFxActionId } from '../engine/drumpad/DjFxActions';

export type OutputBus = 'stereo' | 'out1' | 'out2' | 'out3' | 'out4';
export type FilterType = 'lpf' | 'hpf' | 'bpf' | 'off';
export type PlayMode = 'oneshot' | 'sustain';
export type DecayMode = 'start' | 'end';  // Decay from note-on or sample-end
export type PadBank = 'A' | 'B' | 'C' | 'D';

export interface MpcResampleConfig {
  enabled: boolean;
  model: 'MPC60' | 'MPC3000' | 'SP1200' | 'MPC2000XL';
}

export interface SampleData {
  id: string;
  name: string;
  audioBuffer: AudioBuffer;
  duration: number;
  sampleRate: number;
  reversedBuffer?: AudioBuffer;
  originalAudioBuffer?: AudioBuffer;
}

export interface SampleLayer {
  sample: SampleData;
  velocityRange: [number, number];  // Min/max velocity (0-127)
  levelOffset: number;               // dB adjustment (-24 to +24)
}

export type ScratchActionId =
  | 'scratch_baby' | 'scratch_trans' | 'scratch_flare'
  | 'scratch_hydro' | 'scratch_crab'  | 'scratch_orbit'
  | 'scratch_chirp' | 'scratch_stab' | 'scratch_scribble' | 'scratch_tear'
  | 'scratch_uzi' | 'scratch_twiddle' | 'scratch_8crab'
  | 'scratch_3flare' | 'scratch_laser' | 'scratch_phaser'
  | 'scratch_tweak' | 'scratch_drag' | 'scratch_vibrato'
  | 'scratch_stop'
  | 'fader_lfo_off' | 'fader_lfo_1_4' | 'fader_lfo_1_8' | 'fader_lfo_1_16' | 'fader_lfo_1_32';

export type VelocityCurve = 'linear' | 'exponential' | 'logarithmic' | 'scurve' | 'fixed';

export interface DrumPad {
  id: number;              // 1-64
  sample: SampleData | null;
  name: string;
  color?: string;          // Custom pad color (CSS hex, e.g. '#ff6b35')

  // Instrument / synth assignment (optional — triggers via ToneEngine)
  instrumentId?: number;   // Legacy: reference to song instrument in useInstrumentStore
  instrumentNote?: string; // Fixed note to trigger (e.g. 'C3', 'D#2')
  synthConfig?: InstrumentConfig; // Pad-owned synth config (independent from song instruments)

  // Basic parameters
  level: number;           // 0-127
  tune: number;            // -120 to +120 (10 units = 1 semitone, ±1 octave fine precision)
  pan: number;             // -64 to +63 (0 = center)
  output: OutputBus;       // Output routing
  velocityCurve?: VelocityCurve; // Velocity response curve (default: 'linear')

  // Amplitude Envelope
  attack: number;          // 0-100ms
  decay: number;           // 0-2000ms
  decayMode: DecayMode;    // 'start' = decay from note-on, 'end' = from sample end
  sustain: number;         // 0-100%
  release: number;         // 0-5000ms

  // Filter
  filterType: FilterType;
  cutoff: number;          // 20-20000 Hz
  resonance: number;       // 0-100%

  // Filter Envelope (MPC-style)
  filterAttack: number;    // 0-100 (scaled to ms internally)
  filterDecay: number;     // 0-100 (scaled to ms internally)
  filterEnvAmount: number; // 0-100 (depth of filter envelope sweep)

  // Velocity Modulation (MPC-style, 0-100 each)
  veloToLevel: number;     // How much velocity affects amplitude (0=fixed, 100=full range)
  veloToAttack: number;    // Velocity → attack time modulation
  veloToStart: number;     // Velocity → sample start offset (soft hits start later in sample)
  veloToFilter: number;    // Velocity → filter cutoff modulation
  veloToPitch: number;     // Velocity → pitch modulation (-120 to +120)

  // MPC features
  muteGroup: number;       // 0 = none, 1-8 = mute group
  playMode: PlayMode;      // 'oneshot' or 'sustain'
  sampleStart: number;     // 0-1 normalized (default 0)
  sampleEnd: number;       // 0-1 normalized (default 1)
  reverse: boolean;        // default false

  // Layers (velocity switching)
  layers: SampleLayer[];

  // DJ scratch action (optional — fires in addition to any sample)
  scratchAction?: ScratchActionId;

  // DJ FX action (optional — momentary effect triggered on pad press/release)
  djFxAction?: DjFxActionId;
}

export interface DrumProgram {
  id: string;              // 'A-01' to 'Z-99'
  name: string;
  pads: DrumPad[];         // 64 pads (4 banks of 16)
  masterLevel: number;     // 0-127
  masterTune: number;      // -12 to +12 semitones
  mpcResample?: MpcResampleConfig;
}

export interface MIDIMapping {
  type: 'note' | 'cc';
  note?: number;           // MIDI note number (if type === 'note')
  cc?: number;             // CC number (if type === 'cc')
}

export interface DrumPadState {
  programs: Map<string, DrumProgram>;
  currentProgramId: string;
  midiMappings: Record<string, MIDIMapping>;  // padId -> mapping
  preferences: {
    defaultProgram: string;
    velocitySensitivity: number;  // 0.0-2.0
    padColors: Record<number, string>;
    showAdvanced: boolean;
  };
}

/**
 * Create default empty pad
 */
export function createEmptyPad(id: number): DrumPad {
  return {
    id,
    sample: null,
    name: `Pad ${id}`,
    level: 100,
    tune: 0,
    pan: 0,
    output: 'stereo',
    attack: 0,
    decay: 200,
    decayMode: 'start',
    sustain: 80,
    release: 100,
    filterType: 'off',
    cutoff: 20000,
    resonance: 0,
    filterAttack: 0,
    filterDecay: 50,
    filterEnvAmount: 0,
    veloToLevel: 100,
    veloToAttack: 0,
    veloToStart: 0,
    veloToFilter: 0,
    veloToPitch: 0,
    muteGroup: 0,
    playMode: 'oneshot',
    sampleStart: 0,
    sampleEnd: 1,
    reverse: false,
    layers: [],
  };
}

/**
 * Create default empty program
 */
export function createEmptyProgram(id: string, name: string): DrumProgram {
  return {
    id,
    name,
    pads: Array.from({ length: 64 }, (_, i) => createEmptyPad(i + 1)),
    masterLevel: 100,
    masterTune: 0,
  };
}

/** Base ID for pad-owned instruments in ToneEngine (50000 + padId) */
export const PAD_INSTRUMENT_BASE = 50000;

/** Get the bank letter for a pad ID (1-64) */
export function getPadBank(padId: number): PadBank {
  if (padId <= 16) return 'A';
  if (padId <= 32) return 'B';
  if (padId <= 48) return 'C';
  return 'D';
}

/** Apply velocity curve transformation (input: 0-127, output: 0-127) */
export function applyVelocityCurve(velocity: number, curve: VelocityCurve = 'linear'): number {
  const normalized = velocity / 127; // 0-1
  let result: number;
  switch (curve) {
    case 'exponential':
      result = normalized * normalized;
      break;
    case 'logarithmic':
      result = Math.sqrt(normalized);
      break;
    case 'scurve':
      // S-curve: soft at extremes, steep in middle
      result = normalized < 0.5
        ? 2 * normalized * normalized
        : 1 - 2 * (1 - normalized) * (1 - normalized);
      break;
    case 'fixed':
      result = 1; // Always max velocity
      break;
    default: // 'linear'
      result = normalized;
  }
  return Math.max(1, Math.min(127, Math.round(result * 127)));
}

/** Get the 16 pads for a given bank */
export function getBankPads(pads: DrumPad[], bank: PadBank): DrumPad[] {
  const bankIndex = { A: 0, B: 1, C: 2, D: 3 }[bank];
  return pads.slice(bankIndex * 16, (bankIndex + 1) * 16);
}

/** Create a pad-owned synth-based InstrumentConfig (used when user picks a synth type in PadEditor) */
export function makeDrumConfig(
  padId: number, name: string, synthType: SynthType, note: string = 'C4',
  envelope?: Partial<EnvelopeConfig>,
  parameters?: Record<string, unknown>,
): { synthConfig: InstrumentConfig; instrumentNote: string } {
  const fullEnvelope: EnvelopeConfig | undefined = envelope ? {
    attack: envelope.attack ?? 1,
    decay: envelope.decay ?? 200,
    sustain: envelope.sustain ?? 0,
    release: envelope.release ?? 100,
  } : undefined;
  return {
    synthConfig: {
      id: PAD_INSTRUMENT_BASE + padId,
      name,
      type: 'synth',
      synthType,
      effects: [],
      volume: 0,
      pan: 0,
      ...(fullEnvelope ? { envelope: fullEnvelope } : {}),
      ...(parameters ? { parameters } : {}),
    },
    instrumentNote: note,
  };
}

/** Create a pad-owned sample-based InstrumentConfig */
export function makeSampleConfig(padId: number, name: string, url: string): { synthConfig: InstrumentConfig; instrumentNote: string } {
  return {
    synthConfig: {
      id: PAD_INSTRUMENT_BASE + padId,
      name,
      type: 'sample',
      synthType: 'Sampler',
      sample: { url, baseNote: 'C4', detune: 0, loop: false, loopStart: 0, loopEnd: 0, reverse: false, playbackRate: 1 },
      effects: [],
      volume: -6,
      pan: 0,
    },
    instrumentNote: 'C4',
  };
}

/** Create a pad-owned DrumMachine config (circuit-modeled 808/909 synthesis) */
function makeDrumMachineConfig(
  padId: number, name: string, drumType: DrumType, machineType: DrumMachineType,
  note: string = 'C4', drumSubType?: string
): { synthConfig: InstrumentConfig; instrumentNote: string } {
  const synthType = machineType === '808' ? 'TR808' : 'TR909';
  const paramKey = machineType === '808' ? 'io808Type' : 'tr909Type';
  return {
    synthConfig: {
      id: PAD_INSTRUMENT_BASE + padId,
      name,
      type: 'synth',
      synthType,
      drumMachine: { drumType, machineType, noteMode: 'pitch' },
      effects: [],
      volume: 0,
      pan: 0,
      ...(drumSubType ? { parameters: { [paramKey]: drumSubType } } : {}),
    },
    instrumentNote: note,
  };
}

/**
 * Factory preset: TR-808 Kit — io-808 circuit-modeled synthesis
 */
export function create808Program(): DrumProgram {
  const program = createEmptyProgram('A-01', 'TR-808');
  const M: DrumMachineType = '808';

  // [name, drumType, note, io808Type] — all C4 = normal pitch in pitch mode
  const kit: [string, DrumType, string, string][] = [
    ['Kick',       'kick',     'C4',  'kick'],
    ['Snare',      'snare',    'C4',  'snare'],
    ['Clap',       'clap',     'C4',  'clap'],
    ['Rimshot',    'rimshot',  'C4',  'rimshot'],
    ['Closed Hat', 'hihat',    'C4',  'closedHat'],
    ['Open Hat',   'hihat',    'C4',  'openHat'],
    ['Low Tom',    'tom',      'C4',  'tomLow'],
    ['Mid Tom',    'tom',      'C4',  'tomMid'],
    ['High Tom',   'tom',      'C4',  'tomHigh'],
    ['Cymbal',     'cymbal',   'C4',  'cymbal'],
    ['Clave',      'clave',    'C4',  'clave'],
    ['Cowbell',    'cowbell',  'C4',  'cowbell'],
    ['Maracas',    'maracas',  'C4',  'maracas'],
    ['Conga Low',  'conga',    'C4',  'congaLow'],
    ['Conga Mid',  'conga',    'C4',  'congaMid'],
    ['Conga High', 'conga',    'C4',  'congaHigh'],
  ];

  kit.forEach(([name, drumType, note, subType], i) => {
    const pad = program.pads[i];
    pad.name = name;
    const cfg = makeDrumMachineConfig(pad.id, name, drumType, M, note, subType);
    pad.synthConfig = cfg.synthConfig;
    pad.instrumentNote = cfg.instrumentNote;
    
    // Debug logging
    if (process.env.NODE_ENV === 'development' && i === 0) {
      console.log('[create808Program] First pad config:', {
        padId: pad.id,
        name: pad.name,
        synthType: pad.synthConfig.synthType,
        drumType: pad.synthConfig.drumMachine?.drumType,
        io808Type: pad.synthConfig.parameters?.io808Type,
        instrumentNote: pad.instrumentNote,
      });
    }
  });


  return program;
}

/**
 * Factory preset: TR-909 Kit — sample-based synthesis (André Michelle port)
 * The real 909 has 11 voices: BD, SD, LT, MT, HT, RS, CP, CH, OH, Crash, Ride
 */
export function create909Program(): DrumProgram {
  const program = createEmptyProgram('B-01', 'TR-909');
  const M: DrumMachineType = '909';

  // [name, drumType, note, tr909Type] — all C4 = normal pitch in pitch mode
  const kit: [string, DrumType, string, string][] = [
    ['Kick',       'kick',     'C4',  'kick'],
    ['Snare',      'snare',    'C4',  'snare'],
    ['Clap',       'clap',     'C4',  'clap'],
    ['Rimshot',    'rimshot',  'C4',  'rimshot'],
    ['Closed Hat', 'hihat',    'C4',  'closedHat'],
    ['Open Hat',   'hihat',    'C4',  'openHat'],
    ['Low Tom',    'tom',      'C4',  'tomLow'],
    ['Mid Tom',    'tom',      'C4',  'tomMid'],
    ['High Tom',   'tom',      'C4',  'tomHigh'],
    ['Crash',      'cymbal',   'C4',  'crash'],
    ['Ride',       'cymbal',   'C4',  'ride'],
  ];

  kit.forEach(([name, drumType, note, subType], i) => {
    const pad = program.pads[i];
    pad.name = name;
    const cfg = makeDrumMachineConfig(pad.id, name, drumType, M, note, subType);
    pad.synthConfig = cfg.synthConfig;
    pad.instrumentNote = cfg.instrumentNote;
    
    // Debug logging
    if (process.env.NODE_ENV === 'development' && i === 0) {
      console.log('[create909Program] First pad config:', {
        padId: pad.id,
        name: pad.name,
        synthType: pad.synthConfig.synthType,
        drumType: pad.synthConfig.drumMachine?.drumType,
        tr909Type: pad.synthConfig.parameters?.tr909Type,
        instrumentNote: pad.instrumentNote,
      });
    }
  });

  return program;
}

/**
 * Factory preset: DJ FX Kit — Momentary performance effects on pads
 */
export function createDJFXProgram(): DrumProgram {
  const program = createEmptyProgram('C-01', 'DJ FX');

  const fxPads: { name: string; color: string; action: DjFxActionId }[] = [
    // Row 1: Stutter & Echo
    { name: 'Stutter 1/8',  color: '#ef4444', action: 'fx_stutter_8th' },
    { name: 'Stutter 1/16', color: '#f97316', action: 'fx_stutter_16th' },
    { name: 'Stutter 1/32', color: '#eab308', action: 'fx_stutter_32nd' },
    { name: 'Dub Echo',     color: '#22c55e', action: 'fx_dub_echo' },
    // Row 2: Delay & Filter
    { name: 'Tape Echo',    color: '#14b8a6', action: 'fx_tape_echo' },
    { name: 'Ping Pong',    color: '#06b6d4', action: 'fx_ping_pong' },
    { name: 'HP Sweep',     color: '#3b82f6', action: 'fx_filter_hp_sweep' },
    { name: 'LP Sweep',     color: '#6366f1', action: 'fx_filter_lp_sweep' },
    // Row 3: Modulation & FX
    { name: 'Reverb Wash',  color: '#8b5cf6', action: 'fx_reverb_wash' },
    { name: 'Flanger',      color: '#a855f7', action: 'fx_flanger' },
    { name: 'Phaser',       color: '#d946ef', action: 'fx_phaser' },
    { name: 'Ring Mod',     color: '#ec4899', action: 'fx_ring_mod' },
    // Row 4: Wild FX & Sounds
    { name: 'Bitcrush',     color: '#f43f5e', action: 'fx_bitcrush' },
    { name: 'Dub Siren',    color: '#fb923c', action: 'fx_dub_siren' },
    { name: 'Air Horn',     color: '#fbbf24', action: 'fx_air_horn' },
    { name: 'Noise Riser',  color: '#a3e635', action: 'fx_noise_riser' },
  ];

  fxPads.forEach((fx, i) => {
    const pad = program.pads[i];
    pad.name = fx.name;
    pad.color = fx.color;
    pad.djFxAction = fx.action;
    pad.playMode = 'sustain'; // Hold to engage
  });

  return program;
}
