/**
 * Drum Pad Types - MPC-inspired drum pad system
 */

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
  | 'lfo_off' | 'lfo_14' | 'lfo_18' | 'lfo_116' | 'lfo_132';

export interface DrumPad {
  id: number;              // 1-64
  sample: SampleData | null;
  name: string;

  // Basic parameters
  level: number;           // 0-127
  tune: number;            // -120 to +120 (10 units = 1 semitone, ±1 octave fine precision)
  pan: number;             // -64 to +63 (0 = center)
  output: OutputBus;       // Output routing

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

/** Get the bank letter for a pad ID (1-64) */
export function getPadBank(padId: number): PadBank {
  if (padId <= 16) return 'A';
  if (padId <= 32) return 'B';
  if (padId <= 48) return 'C';
  return 'D';
}

/** Get the 16 pads for a given bank */
export function getBankPads(pads: DrumPad[], bank: PadBank): DrumPad[] {
  const bankIndex = { A: 0, B: 1, C: 2, D: 3 }[bank];
  return pads.slice(bankIndex * 16, (bankIndex + 1) * 16);
}

/**
 * Factory preset: TR-808 Kit
 */
export function create808Program(): DrumProgram {
  const program = createEmptyProgram('A-01', '808 Kit');

  // Set pad names (samples will be loaded later)
  program.pads[0].name = 'Kick';
  program.pads[1].name = 'Snare';
  program.pads[2].name = 'Clap';
  program.pads[3].name = 'Rim';
  program.pads[4].name = 'Cl Hat';
  program.pads[5].name = 'Op Hat';
  program.pads[6].name = 'Lo Tom';
  program.pads[7].name = 'Mid Tom';
  program.pads[8].name = 'Hi Tom';
  program.pads[9].name = 'Crash';
  program.pads[10].name = 'Ride';
  program.pads[11].name = 'Clave';
  program.pads[12].name = 'Cowbell';
  program.pads[13].name = 'Maracas';
  program.pads[14].name = 'Conga';
  program.pads[15].name = 'Cymbal';

  return program;
}

/**
 * Factory preset: TR-909 Kit
 */
export function create909Program(): DrumProgram {
  const program = createEmptyProgram('B-01', '909 Kit');

  program.pads[0].name = 'Kick';
  program.pads[1].name = 'Snare';
  program.pads[2].name = 'Clap';
  program.pads[3].name = 'Rim';
  program.pads[4].name = 'Cl Hat';
  program.pads[5].name = 'Op Hat';
  program.pads[6].name = 'Lo Tom';
  program.pads[7].name = 'Mid Tom';
  program.pads[8].name = 'Hi Tom';
  program.pads[9].name = 'Crash';
  program.pads[10].name = 'Ride';
  program.pads[11].name = 'Shaker';
  program.pads[12].name = 'Tambourine';
  program.pads[13].name = 'Splash';
  program.pads[14].name = 'China';
  program.pads[15].name = 'Reverse Cymbal';

  return program;
}
