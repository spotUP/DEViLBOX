/**
 * Drum Pad Types - MPC-inspired drum pad system
 */

export type OutputBus = 'stereo' | 'out1' | 'out2' | 'out3' | 'out4';
export type FilterType = 'lpf' | 'hpf' | 'bpf' | 'off';

export interface SampleData {
  id: string;
  name: string;
  audioBuffer: AudioBuffer;
  duration: number;
  sampleRate: number;
}

export interface SampleLayer {
  sample: SampleData;
  velocityRange: [number, number];  // Min/max velocity (0-127)
  levelOffset: number;               // dB adjustment (-24 to +24)
}

export interface DrumPad {
  id: number;              // 1-16
  sample: SampleData | null;
  name: string;

  // Basic parameters
  level: number;           // 0-127
  tune: number;            // -36 to +36 semitones
  pan: number;             // -64 to +63 (0 = center)
  output: OutputBus;       // Output routing

  // Envelope
  attack: number;          // 0-100ms
  decay: number;           // 0-2000ms
  sustain: number;         // 0-100%
  release: number;         // 0-5000ms

  // Filter
  filterType: FilterType;
  cutoff: number;          // 20-20000 Hz
  resonance: number;       // 0-100%

  // Layers (velocity switching)
  layers: SampleLayer[];
}

export interface DrumProgram {
  id: string;              // 'A-01' to 'Z-99'
  name: string;
  pads: DrumPad[];         // 16 pads
  masterLevel: number;     // 0-127
  masterTune: number;      // -12 to +12 semitones
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
    sustain: 80,
    release: 100,
    filterType: 'off',
    cutoff: 20000,
    resonance: 0,
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
    pads: Array.from({ length: 16 }, (_, i) => createEmptyPad(i + 1)),
    masterLevel: 100,
    masterTune: 0,
  };
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
