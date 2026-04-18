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
export type PlayMode = 'oneshot' | 'sustain' | 'toggle';
export type DecayMode = 'start' | 'end';  // Decay from note-on or sample-end
export type PadBank = 'A' | 'B';

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

/**
 * Dub action IDs — pad-fired "King Tubby moves" that route DJ deck audio
 * into the shared Dub Bus. Behaviors:
 *
 *   dub_throw_*     — momentary one-shot: press grabs a slice of the deck
 *                     into the echo, then releases on its own after ~1 beat.
 *                     Dry deck audio never mutes.
 *   dub_hold_*      — press-and-hold: deck audio feeds the bus while held,
 *                     closes on release. Longer captures.
 *   dub_mute_*      — "the drop": mutes dry deck + opens bus at full while
 *                     held. The echo tail becomes the only audible deck.
 *   dub_siren       — ramps bus feedback to near-unity → self-oscillating
 *                     echo siren. Release ramps back down.
 *   dub_filter_drop — sweeps bus LPF from open to muffled while held, opens
 *                     back up on release.
 */
export type DubActionId =
  // ── Auto-select: resolves the currently-loudest playing deck at press ──
  // Recommended primary layout. One pad per gesture regardless of which
  // deck is playing — the kit follows the DJ's crossfader moves.
  | 'dub_throw' | 'dub_hold' | 'dub_mute'
  // Quick single-slap variant — tiny grab, almost no tail. "Delay FX burst".
  | 'dub_slap_back'
  // ── Broadcast: hit every playing deck at once ──
  | 'dub_throw_all' | 'dub_hold_all'
  // ── Explicit targeting: power-user pads that lock to a specific deck ──
  | 'dub_throw_a' | 'dub_throw_b' | 'dub_throw_c'
  | 'dub_hold_a' | 'dub_hold_b' | 'dub_hold_c'
  | 'dub_mute_a' | 'dub_mute_b' | 'dub_mute_c'
  // ── Bus FX: no deck source needed ──
  | 'dub_siren'
  | 'dub_filter_drop';

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
  id: number;              // 1-16
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

  // Dub action (optional — routes DJ deck audio into the shared Dub Bus on
  // press). Throws run their own timeline; hold/mute/siren/filter engage on
  // press and release on pad release.
  dubAction?: DubActionId;

  // Vocoder push-to-talk (optional — hold pad to talk, release to stop)
  pttAction?: boolean;

  // Effects chain for sample playback (separate from synthConfig.effects)
  // Applied by DrumPadEngine as send effects (reverb, delay, saturation, etc.)
  effects?: EffectConfig[];

  // Dub send: post-fader send to the shared Dub Bus (one SpringReverb + one
  // SpaceEcho for the whole DrumPadEngine). 0 = dry, 1 = equal dry + wet.
  // This is how real dub/sound-system engineers work: one echo unit for the
  // whole kit, each channel sends a controlled amount. Avoids stacking 16
  // SpaceEcho instances with runaway feedback tails.
  dubSend?: number;
}

/** Dub Bus — shared send FX for all drumpads. Settings apply engine-wide. */
export interface DubBusSettings {
  enabled: boolean;
  // Return gain for the whole bus (0-1). 1 = full wet.
  returnGain: number;
  // HPF cutoff on the bus input — rolls bass off the send so the echo/reverb
  // doesn't muddy the low end (classic dub trick). Default 180 Hz.
  hpfCutoff: number;
  // Spring reverb amount in the bus chain (0-1).
  springWet: number;
  // Space Echo intensity (feedback) — one shared delay, so this can run
  // higher than a per-pad chain could. 0-0.85 sensible range.
  echoIntensity: number;
  // Space Echo wet amount (0-1).
  echoWet: number;
  // Space Echo rate in ms (shorter = tighter repeats, longer = more spaced).
  echoRateMs: number;
  // Sidechain-style duck on the bus return. When loud input hits the bus,
  // the return briefly ducks so transients cut through the tail (the
  // "pumping dub" effect). 0 = no duck, 1 = full duck.
  sidechainAmount: number;
  // How much of a deck's audio is injected into the bus when a dub-action
  // pad fires (throw / hold / mute). 0-1; typical 0.85-1.0.
  deckTapAmount: number;
  // Throw duration in beats — how long the tap stays open for a
  // dub_throw_* action before it begins releasing. 0.5 = eighth note.
  throwBeats: number;
  // Siren feedback target (0-0.95) — how hot the self-oscillation runs
  // when a dub_siren pad is held. Above ~0.9 gets screaming.
  sirenFeedback: number;
  // Filter drop target in Hz — where the bus LPF drops to while a
  // dub_filter_drop pad is held. 80-600 Hz is the classic muffle range.
  filterDropHz: number;
}

export const DEFAULT_DUB_BUS: DubBusSettings = {
  enabled: false,
  returnGain: 0.8,
  hpfCutoff: 180,
  springWet: 0.4,
  echoIntensity: 0.55,
  echoWet: 0.5,
  echoRateMs: 300,
  sidechainAmount: 0.4,
  deckTapAmount: 0.9,
  throwBeats: 0.5,
  sirenFeedback: 0.85,
  filterDropHz: 220,
};

export interface DrumProgram {
  id: string;              // 'A-01' to 'Z-99'
  name: string;
  pads: DrumPad[];         // 16 pads (2 banks of 8) — matches Akai MPK mini's 8 physical pads × 2 banks per program
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
    dubSend: 0,
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

/** Base ID for pad-owned instruments in ToneEngine (50000 + padId) */
export const PAD_INSTRUMENT_BASE = 50000;

/** How many named slots map 1:1 to an Akai MPK Mini's 8 programs. */
export const MPK_SLOT_COUNT = 8;
/** Canonical id for MPK slot N (1-based). */
export const mpkSlotId = (n: number): string => `mpk-${n}`;
/** Default display name for MPK slot N. */
export const mpkSlotName = (n: number): string => `Program ${n}`;

/**
 * Default FX chain for every drumpad — Jamaican Sound System.
 * Warm bass EQ → tape saturation → Space Echo (RE-201 style, ~6s tail)
 * → spring tank. Signal path mirrors a real dub mixing chain.
 * Returns fresh array with unique IDs each call.
 */
export function createDefaultPadFX(): EffectConfig[] {
  const ts = Date.now();
  return [
    {
      // Warm dub EQ — bass lift, slight mid scoop, soften the highs.
      id: `pad-fx-eq-${ts}`,
      category: 'tonejs',
      type: 'EQ3',
      enabled: true,
      wet: 100,
      parameters: { low: 3, mid: -1, high: -1.5 },
    },
    {
      // Tape saturation — that warm vintage console / Studer glue.
      id: `pad-fx-tape-${ts}`,
      category: 'tonejs',
      type: 'TapeSaturation',
      enabled: true,
      wet: 45,
      parameters: { drive: 45, frequency: 1400 },
    },
    {
      // Roland RE-201 Space Echo — the iconic dub delay.
      // intensity 0.45 at rate 375ms (dotted 1/8 @ 120 BPM) → ~2s tail.
      // Mode 4 = tape heads + built-in spring reverb for that classic RE-201 smear.
      id: `pad-fx-echo-${ts}`,
      category: 'tonejs',
      type: 'SpaceEcho',
      enabled: true,
      wet: 45,
      parameters: { mode: 4, rate: 375, intensity: 0.45, echoVolume: 0.45, reverbVolume: 0.2, bpmSync: 1, syncDivision: '1/4' },
    },
    {
      // Spring reverb tank — sound system ambience with pronounced drip/boing.
      id: `pad-fx-spring-${ts}`,
      category: 'wasm',
      type: 'SpringReverb',
      enabled: true,
      wet: 35,
      parameters: { decay: 0.75, damping: 0.3, tension: 0.45, mix: 0.45, drip: 0.7, diffusion: 0.75 },
    },
  ] as EffectConfig[];
}

/** Get the bank letter for a pad ID (1-16) */
export function getPadBank(padId: number): PadBank {
  return padId <= 8 ? 'A' : 'B';
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

/** Get the 8 pads for a given bank */
export function getBankPads(pads: DrumPad[], bank: PadBank): DrumPad[] {
  const bankIndex = { A: 0, B: 1 }[bank];
  return pads.slice(bankIndex * 8, (bankIndex + 1) * 8);
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

  // mode per pad: sustain = hold to engage, toggle = click on / click off,
  // oneshot = fire once and let the effect run its own timeline.
  const fxPads: { name: string; color: string; action: DjFxActionId; mode: PlayMode }[] = [
    // Row 1: Deck filter & echo
    { name: 'HPF Sweep',    color: '#3b82f6', action: 'fx_deck_hpf_sweep',    mode: 'sustain' },
    { name: 'LPF Sweep',    color: '#6366f1', action: 'fx_deck_lpf_sweep',    mode: 'sustain' },
    { name: 'Echo Out',     color: '#22c55e', action: 'fx_deck_echo_out',     mode: 'toggle'  },
    { name: 'Brake',        color: '#ef4444', action: 'fx_deck_brake',        mode: 'toggle'  },
    // Row 2: EQ kills (hold) + filter reset (oneshot)
    { name: 'Kill Lo',      color: '#f97316', action: 'fx_deck_kill_lo',      mode: 'sustain' },
    { name: 'Kill Mid',     color: '#eab308', action: 'fx_deck_kill_mid',     mode: 'sustain' },
    { name: 'Kill Hi',      color: '#a3e635', action: 'fx_deck_kill_hi',      mode: 'sustain' },
    { name: 'Filt Reset',   color: '#14b8a6', action: 'fx_deck_filter_reset', mode: 'oneshot' },
    // Row 3: Beat jumps — instant
    { name: 'Jump −16',     color: '#8b5cf6', action: 'fx_deck_jump_m16',     mode: 'oneshot' },
    { name: 'Jump −4',      color: '#a855f7', action: 'fx_deck_jump_m4',      mode: 'oneshot' },
    { name: 'Jump +4',      color: '#d946ef', action: 'fx_deck_jump_p4',      mode: 'oneshot' },
    { name: 'Jump +16',     color: '#ec4899', action: 'fx_deck_jump_p16',     mode: 'oneshot' },
    // Row 4: Performance FX — hold for stutter, toggle for sounds that should cut
    { name: 'Stutter 1/8',  color: '#f43f5e', action: 'fx_stutter_8',         mode: 'sustain' },
    { name: 'Dub Siren',    color: '#fb923c', action: 'fx_dub_siren',         mode: 'toggle'  },
    { name: 'Air Horn',     color: '#fbbf24', action: 'fx_air_horn',          mode: 'oneshot' },
    { name: 'Noise Riser',  color: '#06b6d4', action: 'fx_noise_riser',       mode: 'toggle'  },
  ];

  fxPads.forEach((fx, i) => {
    const pad = program.pads[i];
    pad.name = fx.name;
    pad.color = fx.color;
    pad.djFxAction = fx.action;
    pad.playMode = fx.mode;
  });

  return program;
}

/**
 * Factory preset: DJ Complete — top 8 scratch patterns + deck FX, sized for
 * 8 physical pads × 2 banks = 16 total.
 * Bank A (pads 1–8): 8 essential scratch patterns
 * Bank B (pads 9–16): 4 deck FX + 4 performance FX
 */
export function createDJCompleteProgram(): DrumProgram {
  const program = createEmptyProgram('D-01', 'DJ Complete');

  // ── Bank A (pads 1–8): essential scratch patterns ─────────────────
  const scratchPads: { name: string; color: string; action: ScratchActionId }[] = [
    { name: 'Baby',   color: '#3b82f6', action: 'scratch_baby' },
    { name: 'Trans',  color: '#ef4444', action: 'scratch_trans' },
    { name: 'Flare',  color: '#f97316', action: 'scratch_flare' },
    { name: 'Crab',   color: '#8b5cf6', action: 'scratch_crab' },
    { name: 'Chirp',  color: '#eab308', action: 'scratch_chirp' },
    { name: 'Stab',   color: '#ec4899', action: 'scratch_stab' },
    { name: 'Tear',   color: '#f43f5e', action: 'scratch_tear' },
    { name: 'STOP',   color: '#991b1b', action: 'scratch_stop' },
  ];

  scratchPads.forEach((sp, i) => {
    const pad = program.pads[i]; // pads 1–8 (bank A)
    pad.name = sp.name;
    pad.color = sp.color;
    pad.scratchAction = sp.action;
    pad.playMode = 'sustain'; // Hold to scratch
  });

  // ── Bank B (pads 9–16): deck FX + performance FX ──────────────────
  const bankBPads: { name: string; color: string; fx: DjFxActionId }[] = [
    { name: 'HPF Sweep',   color: '#8b5cf6', fx: 'fx_deck_hpf_sweep' },
    { name: 'LPF Sweep',   color: '#3b82f6', fx: 'fx_deck_lpf_sweep' },
    { name: 'Echo Out',    color: '#22c55e', fx: 'fx_deck_echo_out' },
    { name: 'Brake',       color: '#ef4444', fx: 'fx_deck_brake' },
    { name: 'Stutter 1/8', color: '#f43f5e', fx: 'fx_stutter_8' },
    { name: 'Dub Siren',   color: '#fb923c', fx: 'fx_dub_siren' },
    { name: 'Air Horn',    color: '#fbbf24', fx: 'fx_air_horn' },
    { name: 'Noise Riser', color: '#06b6d4', fx: 'fx_noise_riser' },
  ];

  bankBPads.forEach((bp, i) => {
    const pad = program.pads[8 + i]; // pads 9–16 (bank B)
    pad.name = bp.name;
    pad.color = bp.color;
    pad.djFxAction = bp.fx;
    pad.playMode = 'sustain';
  });

  return program;
}
