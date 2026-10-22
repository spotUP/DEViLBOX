/**
 * FluidSynthSynth.ts - FluidSynth SF2 instrument for DEViLBOX
 *
 * Each instrument is a facade over one MIDI channel ("slot") of the shared
 * FluidSynthHost worklet: one WASM synth and one SoundFont per AudioContext.
 * Program and bank are per slot; reverb, chorus, gain and polyphony are
 * synth-wide (last writer wins). Transpose is applied to the key here.
 */

import type { DevilboxSynth } from '@/types/synth';
import { noteToMidi } from '@/utils/audio-context';
import { FluidSynthHost } from './FluidSynthHost';

export const FluidSynthParam = {
  REVERB_ROOM_SIZE: 0, REVERB_DAMPING: 1, REVERB_WIDTH: 2, REVERB_LEVEL: 3,
  CHORUS_VOICES: 4, CHORUS_LEVEL: 5, CHORUS_SPEED: 6, CHORUS_DEPTH: 7,
  CHORUS_TYPE: 8,
  GAIN: 9, POLYPHONY: 10,
  PROGRAM: 11, BANK: 12,
  TUNING: 13, TRANSPOSE: 14,
} as const;

export const FLUIDSYNTH_PARAM_NAMES: Record<number, string> = {
  0: 'Reverb Room Size', 1: 'Reverb Damping', 2: 'Reverb Width', 3: 'Reverb Level',
  4: 'Chorus Voices', 5: 'Chorus Level', 6: 'Chorus Speed', 7: 'Chorus Depth',
  8: 'Chorus Type',
  9: 'Gain', 10: 'Polyphony',
  11: 'Program', 12: 'Bank',
  13: 'Tuning', 14: 'Transpose',
};

export interface FluidSynthConfig {
  reverbRoomSize?: number;  // 0-1.2
  reverbDamping?: number;   // 0-1
  reverbWidth?: number;     // 0-100
  reverbLevel?: number;     // 0-1
  chorusVoices?: number;    // 0-99
  chorusLevel?: number;     // 0-10
  chorusSpeed?: number;     // 0.1-5
  chorusDepth?: number;     // 0-21
  chorusType?: number;      // 0=sine, 1=triangle
  gain?: number;            // 0-10
  polyphony?: number;       // 1-256
  program?: number;         // 0-127
  bank?: number;            // 0-128
  tuning?: number;          // 430-450 Hz
  transpose?: number;       // -24 to 24
  /** 'gm' stacks the General MIDI SoundFont (GeneralUser GS) on the shared synth. */
  soundFont?: 'default' | 'gm';
}

export const DEFAULT_FLUIDSYNTH: FluidSynthConfig = {
  reverbRoomSize: 0.2,
  reverbDamping: 0.0,
  reverbWidth: 0.5,
  reverbLevel: 0.9,
  chorusVoices: 3,
  chorusLevel: 2.0,
  chorusSpeed: 0.3,
  chorusDepth: 8.0,
  chorusType: 0,
  gain: 0.4,
  polyphony: 64,
  program: 0,
  bank: 0,
  tuning: 440,
  transpose: 0,
};

export const FLUIDSYNTH_PRESETS: Record<string, FluidSynthConfig> = {
  'Grand Piano': {
    ...DEFAULT_FLUIDSYNTH,
    program: 0, bank: 0,
    reverbRoomSize: 0.6, reverbLevel: 0.7,
  },
  'Electric Piano': {
    ...DEFAULT_FLUIDSYNTH,
    program: 4, bank: 0,
    chorusVoices: 5, chorusLevel: 3.0, chorusDepth: 10,
  },
  'Strings': {
    ...DEFAULT_FLUIDSYNTH,
    program: 48, bank: 0,
    reverbRoomSize: 0.8, reverbLevel: 0.9,
    chorusVoices: 6, chorusDepth: 12,
  },
  'Choir': {
    ...DEFAULT_FLUIDSYNTH,
    program: 52, bank: 0,
    reverbRoomSize: 0.9, reverbLevel: 0.8,
    chorusVoices: 8, chorusLevel: 4.0,
  },
  'Organ': {
    ...DEFAULT_FLUIDSYNTH,
    program: 19, bank: 0,
    reverbRoomSize: 0.7, reverbLevel: 0.5,
    chorusVoices: 4, chorusSpeed: 0.5,
  },
  'Acoustic Guitar': {
    ...DEFAULT_FLUIDSYNTH,
    program: 25, bank: 0,
    reverbRoomSize: 0.4, reverbLevel: 0.5, reverbDamping: 0.4,
    chorusVoices: 2, chorusLevel: 1.5, chorusDepth: 4,
  },
  'Brass Ensemble': {
    ...DEFAULT_FLUIDSYNTH,
    program: 61, bank: 0,
    reverbRoomSize: 0.7, reverbLevel: 0.6,
    chorusVoices: 3, chorusLevel: 2.0, chorusDepth: 6,
  },
  'Alto Sax': {
    ...DEFAULT_FLUIDSYNTH,
    program: 65, bank: 0,
    reverbRoomSize: 0.5, reverbLevel: 0.55, reverbDamping: 0.3,
    chorusVoices: 2, chorusLevel: 1.0, chorusDepth: 3,
  },
  'Acoustic Bass': {
    ...DEFAULT_FLUIDSYNTH,
    program: 32, bank: 0,
    reverbRoomSize: 0.3, reverbLevel: 0.35,
    chorusVoices: 0, chorusLevel: 0,
  },
  'Flute': {
    ...DEFAULT_FLUIDSYNTH,
    program: 73, bank: 0,
    reverbRoomSize: 0.55, reverbLevel: 0.6, reverbDamping: 0.25,
    chorusVoices: 3, chorusLevel: 2.0, chorusDepth: 5, chorusSpeed: 0.4,
  },
};

type NumericKey = Exclude<keyof FluidSynthConfig, 'soundFont'>;

/** Bridge setParam ids 0-10, applied to every channel of the synth. */
const SYNTH_WIDE_KEYS: NumericKey[] = [
  'reverbRoomSize', 'reverbDamping', 'reverbWidth', 'reverbLevel',
  'chorusVoices', 'chorusLevel', 'chorusSpeed', 'chorusDepth', 'chorusType',
  'gain', 'polyphony',
];

const DRUM_BANK = 128;

const toMidiKey = (frequency: number | string): number =>
  typeof frequency === 'string' ? noteToMidi(frequency) : Math.round(12 * Math.log2(frequency / 440) + 69);

export class FluidSynthSynthEngine implements DevilboxSynth {
  readonly name = 'FluidSynthSynthEngine';
  readonly output: GainNode;

  protected config: FluidSynthConfig;
  private host: FluidSynthHost | null;
  /** MIDI channel and audio group of the shared synth this instrument plays on. */
  readonly slot: number;
  private readonly slotOut: GainNode;
  private drum: boolean;
  /** Sounding key per played MIDI note, so a transpose change cannot strand a note. */
  private readonly held = new Map<number, number>();

  constructor(config: Partial<FluidSynthConfig> = {}) {
    this.config = { ...DEFAULT_FLUIDSYNTH, ...config };
    const host = FluidSynthHost.acquire();
    this.host = host;
    this.output = host.ctx.createGain();
    this.drum = this.config.bank === DRUM_BANK;
    this.slot = host.allocSlot(this.drum);
    this.slotOut = host.slotOutput(this.slot);
    this.slotOut.connect(this.output);
    if (this.config.soundFont === 'gm') host.requestGMSoundFont();
    this.sendConfig();
  }

  public async ensureInitialized(): Promise<void> {
    // Hold the host across the awaits: dispose() during a song load nulls this.host.
    const host = this.host;
    if (!host) return;
    await host.ready;
    // A note before the SoundFont is in is held by the host, not lost.
    await host.sfReady;
  }

  /** Post the whole config. The host holds it until the SoundFont is in. */
  private sendConfig(): void {
    for (let i = 0; i < SYNTH_WIDE_KEYS.length; i++) {
      const value = this.config[SYNTH_WIDE_KEYS[i]];
      if (value !== undefined) this.host?.post({ type: 'setParam', index: i, value });
    }
    this.sendProgram();
  }

  /** Bank then program on this slot; a move to or from the drum bank switches the channel type. */
  private sendProgram(): void {
    const host = this.host;
    if (!host) return;
    const bank = this.config.bank ?? 0;
    const drum = bank === DRUM_BANK;
    if (drum !== this.drum) {
      this.drum = drum;
      host.post({ type: 'setChannelType', channel: this.slot, channelType: drum ? 1 : 0 });
    }
    host.post({ type: 'bankSelect', channel: this.slot, bank });
    host.post({ type: 'programChange', channel: this.slot, program: this.config.program ?? 0 });
  }

  /** The GM SoundFont stays loaded host-wide once requested; 'default' does not unload it. */
  protected useGMSoundFont(): void {
    this.config.soundFont = 'gm';
    this.host?.requestGMSoundFont();
  }

  loadSF2(data: ArrayBuffer | Uint8Array, filename?: string): void {
    this.host?.loadSoundFont(data, filename);
  }

  triggerAttack(frequency: number | string, _time?: number, velocity?: number): this {
    if (!this.host) return this;
    const note = toMidiKey(frequency);
    const key = Math.max(0, Math.min(127, note + (this.config.transpose ?? 0)));
    this.held.set(note, key);
    this.host.post({ type: 'noteOn', channel: this.slot, key, velocity: Math.round((velocity ?? 0.8) * 127) });
    return this;
  }

  triggerRelease(frequency?: number | string, _time?: number): this {
    if (!this.host) return this;
    if (frequency === undefined) {
      this.held.clear();
      this.host.post({ type: 'allNotesOff', channel: this.slot });
      return this;
    }
    const note = toMidiKey(frequency);
    const key = this.held.get(note) ?? Math.max(0, Math.min(127, note + (this.config.transpose ?? 0)));
    this.held.delete(note);
    this.host.post({ type: 'noteOff', channel: this.slot, key });
    return this;
  }

  set(param: string, value: number): void {
    if (!(param in DEFAULT_FLUIDSYNTH)) return;
    const key = param as NumericKey;
    this.config[key] = value;
    const index = SYNTH_WIDE_KEYS.indexOf(key);
    if (index >= 0) {
      this.host?.post({ type: 'setParam', index, value });
    } else if (key === 'program' || key === 'bank') {
      this.sendProgram();
    }
    // transpose is read at note time; tuning has no bridge support.
  }

  get(param: string): number | undefined {
    return this.config[param as NumericKey];
  }

  setPreset(name: string): void {
    const preset = FLUIDSYNTH_PRESETS[name];
    if (preset) {
      this.config = { ...preset };
      this.sendConfig();
    }
  }

  dispose(): void {
    const host = this.host;
    if (!host) return;
    this.host = null;
    host.post({ type: 'allNotesOff', channel: this.slot });
    try { this.slotOut.disconnect(this.output); } catch { /* not connected */ }
    host.freeSlot(this.slot);
    host.release();
  }
}

export class FluidSynthSynthImpl extends FluidSynthSynthEngine {
  async init(): Promise<void> {
    return this.ensureInitialized();
  }

  applyConfig(config: Partial<FluidSynthConfig>): void {
    if (config.soundFont === 'gm') this.useGMSoundFont();
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'number' && value !== this.get(key)) {
        this.set(key, value);
      }
    }
  }
}
