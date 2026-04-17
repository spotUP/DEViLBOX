/**
 * Drum Pad Types - MPC-inspired drum pad system
 */

import type { InstrumentConfig } from './instrument/defaults';
import type { EffectConfig } from './instrument/effects';
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
  /** URL the sample was loaded from (built-in pack path, e.g. '/data/samples/packs/...') — enables re-fetch on environment restore */
  sourceUrl?: string;
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
  presetName?: string;     // Currently active synth preset name (shown on pad)

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

  // Vocoder push-to-talk (optional — hold pad to talk, release to stop)
  pttAction?: boolean;

  // Effects chain for sample playback (separate from synthConfig.effects)
  // Applied by DrumPadEngine as send effects (reverb, delay, saturation, etc.)
  effects?: EffectConfig[];
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
    level: 127,
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
    veloToLevel: 70,
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

/**
 * Default instrument FX chain for drumpad synths — Reggae Soundsystem.
 * Spring reverb + Space Echo + warm EQ — deep, dubby, but with tail values
 * that decay cleanly between hits rather than stacking into permanent wash.
 * Returns fresh array with unique IDs each call.
 */
export function createDefaultPadFX(): EffectConfig[] {
  const ts = Date.now();
  return [
    {
      id: `pad-fx-eq-${ts}`,
      category: 'tonejs',
      type: 'EQ3',
      enabled: true,
      wet: 100,
      parameters: { low: 2.5, mid: -1, high: -1.5 },
    },
    {
      id: `pad-fx-spring-${ts}`,
      category: 'wasm',
      type: 'SpringReverb',
      enabled: true,
      wet: 25,
      parameters: { decay: 0.45, damping: 0.45, tension: 0.5, mix: 0.3, drip: 0.55, diffusion: 0.7 },
    },
    {
      id: `pad-fx-echo-${ts}`,
      category: 'tonejs',
      type: 'SpaceEcho',
      enabled: true,
      wet: 32,
      parameters: { mode: 4, rate: 300, intensity: 0.18, echoVolume: 0.3, reverbVolume: 0.12, bpmSync: 1, syncDivision: '1/4' },
    },
  ] as EffectConfig[];
}

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
 * Factory preset: DJ FX Kit — Real DJ deck effects + performance FX
 */
export function createDJFXProgram(): DrumProgram {
  const program = createEmptyProgram('C-01', 'DJ FX');

  const fxPads: { name: string; color: string; action: DjFxActionId }[] = [
    // Row 1: Deck filter & echo (real DJ engine effects)
    { name: 'HPF Sweep',    color: '#3b82f6', action: 'fx_deck_hpf_sweep' },
    { name: 'LPF Sweep',    color: '#6366f1', action: 'fx_deck_lpf_sweep' },
    { name: 'Echo Out',     color: '#22c55e', action: 'fx_deck_echo_out' },
    { name: 'Brake',        color: '#ef4444', action: 'fx_deck_brake' },
    // Row 2: EQ kills & filter reset (real DJ engine effects)
    { name: 'Kill Lo',      color: '#f97316', action: 'fx_deck_kill_lo' },
    { name: 'Kill Mid',     color: '#eab308', action: 'fx_deck_kill_mid' },
    { name: 'Kill Hi',      color: '#a3e635', action: 'fx_deck_kill_hi' },
    { name: 'Filt Reset',   color: '#14b8a6', action: 'fx_deck_filter_reset' },
    // Row 3: Beat jumps (real DJ engine effects)
    { name: 'Jump −16',     color: '#8b5cf6', action: 'fx_deck_jump_m16' },
    { name: 'Jump −4',      color: '#a855f7', action: 'fx_deck_jump_m4' },
    { name: 'Jump +4',      color: '#d946ef', action: 'fx_deck_jump_p4' },
    { name: 'Jump +16',     color: '#ec4899', action: 'fx_deck_jump_p16' },
    // Row 4: Performance FX & sounds (master bus)
    { name: 'Stutter 1/8',  color: '#f43f5e', action: 'fx_stutter_8' },
    { name: 'Dub Siren',    color: '#fb923c', action: 'fx_dub_siren' },
    { name: 'Air Horn',     color: '#fbbf24', action: 'fx_air_horn' },
    { name: 'Noise Riser',  color: '#06b6d4', action: 'fx_noise_riser' },
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

/**
 * Factory preset: DJ Complete — All scratch patterns, fader LFO, deck FX, and beat jumps.
 * Bank A: 16 scratch patterns (Baby through Phaser)
 * Bank B: 3 remaining scratches + stop + 5 fader LFO + 7 deck FX
 * Bank C: EQ kills + filter reset + beat jumps + performance FX
 */
export function createDJCompleteProgram(): DrumProgram {
  const program = createEmptyProgram('D-01', 'DJ Complete');

  // ── Bank A (pads 1–16): Scratch patterns ──────────────────────────
  const scratchPads: { name: string; color: string; action: ScratchActionId }[] = [
    { name: 'Baby',     color: '#3b82f6', action: 'scratch_baby' },
    { name: 'Trans',    color: '#ef4444', action: 'scratch_trans' },
    { name: 'Flare',    color: '#f97316', action: 'scratch_flare' },
    { name: 'Hydro',    color: '#22c55e', action: 'scratch_hydro' },
    { name: 'Crab',     color: '#8b5cf6', action: 'scratch_crab' },
    { name: 'Orbit',    color: '#06b6d4', action: 'scratch_orbit' },
    { name: 'Chirp',    color: '#eab308', action: 'scratch_chirp' },
    { name: 'Stab',     color: '#ec4899', action: 'scratch_stab' },
    { name: 'Scribble', color: '#a3e635', action: 'scratch_scribble' },
    { name: 'Tear',     color: '#f43f5e', action: 'scratch_tear' },
    { name: 'Uzi',      color: '#fb923c', action: 'scratch_uzi' },
    { name: 'Twiddle',  color: '#a855f7', action: 'scratch_twiddle' },
    { name: '8-Crab',   color: '#d946ef', action: 'scratch_8crab' },
    { name: '3-Flare',  color: '#14b8a6', action: 'scratch_3flare' },
    { name: 'Laser',    color: '#fbbf24', action: 'scratch_laser' },
    { name: 'Phaser',   color: '#6366f1', action: 'scratch_phaser' },
  ];

  scratchPads.forEach((sp, i) => {
    const pad = program.pads[i]; // pads 1–16
    pad.name = sp.name;
    pad.color = sp.color;
    pad.scratchAction = sp.action;
    pad.playMode = 'sustain'; // Hold to scratch
  });

  // ── Bank B (pads 17–32): Remaining scratches + LFO + Deck FX ─────
  const bankBPads: { name: string; color: string; scratch?: ScratchActionId; fx?: DjFxActionId }[] = [
    { name: 'Tweak',      color: '#84cc16', scratch: 'scratch_tweak' },
    { name: 'Drag',       color: '#78716c', scratch: 'scratch_drag' },
    { name: 'Vibrato',    color: '#c084fc', scratch: 'scratch_vibrato' },
    { name: 'STOP',       color: '#991b1b', scratch: 'scratch_stop' },
    // Fader LFO divisions (toggle — press again to stop)
    { name: 'LFO 1/4',   color: '#ef4444', scratch: 'fader_lfo_1_4' },
    { name: 'LFO 1/8',   color: '#f97316', scratch: 'fader_lfo_1_8' },
    { name: 'LFO 1/16',  color: '#eab308', scratch: 'fader_lfo_1_16' },
    { name: 'LFO 1/32',  color: '#a3e635', scratch: 'fader_lfo_1_32' },
    // Deck FX (real DJ engine effects)
    { name: 'HPF Sweep',  color: '#8b5cf6', fx: 'fx_deck_hpf_sweep' },
    { name: 'LPF Sweep',  color: '#3b82f6', fx: 'fx_deck_lpf_sweep' },
    { name: 'Echo Out',   color: '#22c55e', fx: 'fx_deck_echo_out' },
    { name: 'Brake',      color: '#ef4444', fx: 'fx_deck_brake' },
    { name: 'Stutter 1/8', color: '#f43f5e', fx: 'fx_stutter_8' },
    { name: 'Dub Siren',  color: '#fb923c', fx: 'fx_dub_siren' },
    { name: 'Air Horn',   color: '#fbbf24', fx: 'fx_air_horn' },
    { name: 'Noise Riser', color: '#06b6d4', fx: 'fx_noise_riser' },
  ];

  bankBPads.forEach((bp, i) => {
    const pad = program.pads[16 + i]; // pads 17–32
    pad.name = bp.name;
    pad.color = bp.color;
    if (bp.scratch) pad.scratchAction = bp.scratch;
    if (bp.fx) pad.djFxAction = bp.fx;
    pad.playMode = 'sustain';
  });

  // ── Bank C (pads 33–48): EQ kills + filter + beat jumps + extra FX ─
  const bankCPads: { name: string; color: string; fx: DjFxActionId }[] = [
    { name: 'Kill Lo',    color: '#f97316', fx: 'fx_deck_kill_lo' },
    { name: 'Kill Mid',   color: '#eab308', fx: 'fx_deck_kill_mid' },
    { name: 'Kill Hi',    color: '#06b6d4', fx: 'fx_deck_kill_hi' },
    { name: 'Filt Reset', color: '#14b8a6', fx: 'fx_deck_filter_reset' },
    { name: 'Jump -16',   color: '#8b5cf6', fx: 'fx_deck_jump_m16' },
    { name: 'Jump -4',    color: '#a855f7', fx: 'fx_deck_jump_m4' },
    { name: 'Jump -1',    color: '#c084fc', fx: 'fx_deck_jump_m1' },
    { name: 'Jump +1',    color: '#c084fc', fx: 'fx_deck_jump_p1' },
    { name: 'Jump +4',    color: '#d946ef', fx: 'fx_deck_jump_p4' },
    { name: 'Jump +16',   color: '#ec4899', fx: 'fx_deck_jump_p16' },
    { name: 'Stutter 1/4', color: '#f43f5e', fx: 'fx_stutter_4' },
    { name: 'Stutter 1/16', color: '#fb7185', fx: 'fx_stutter_16' },
    { name: 'Tape Stop',  color: '#78716c', fx: 'fx_tape_stop' },
    { name: 'Half Speed', color: '#a8a29e', fx: 'fx_half_speed' },
    { name: 'Bitcrush',   color: '#84cc16', fx: 'fx_bitcrush' },
    { name: 'Ring Mod',   color: '#22d3ee', fx: 'fx_ring_mod' },
  ];

  bankCPads.forEach((cp, i) => {
    const pad = program.pads[32 + i]; // pads 33–48
    pad.name = cp.name;
    pad.color = cp.color;
    pad.djFxAction = cp.fx;
    pad.playMode = 'sustain';
  });

  return program;
}
