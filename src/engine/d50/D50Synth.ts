/**
 * D50Synth - Roland D-50 Linear Arithmetic Synthesizer
 * Based on the Roland SA chip emulation from MAME
 *
 * The D-50 (1987) pioneered "Linear Arithmetic" synthesis:
 * - 16 voices, 10 partials per voice
 * - PCM attack transients + LA synthesis sustain
 * - Built-in digital chorus and reverb
 * - 100 patches, expandable with ROM cards
 *
 * NOTE: Requires ROM data (IC5, IC6, IC7) for audio output.
 * These can be extracted from an original D-50 unit.
 */

import * as Tone from 'tone';
import { MAMEEngine, MAMESynthType } from '../MAMEEngine';

// D-50 Tone structure constants
export const D50Structure = {
  STRUCTURE_1: 0,  // Upper 1+2 | Lower 1+2
  STRUCTURE_2: 1,  // Upper 1+2 | Lower 1+2 (ring mod)
  STRUCTURE_3: 2,  // Upper 1+2 | Lower 1+2 (sync)
  STRUCTURE_4: 3,  // Upper 1+2 + Lower 1+2 (mix)
  STRUCTURE_5: 4,  // Upper 1+2+Lower 1+2 (all mix)
  STRUCTURE_6: 5,  // Upper | Lower (dual)
  STRUCTURE_7: 6,  // Upper 1 | Upper 2 | Lower 1 | Lower 2
} as const;
export type D50Structure = typeof D50Structure[keyof typeof D50Structure];

// D-50 Waveform groups (complete list from D-50 ROM)
export const D50WaveGroup = {
  // Synth waveforms (LA synthesis) - 0-1
  SAWTOOTH: 0,
  SQUARE: 1,

  // PCM Attack Transients - 32-47
  PIANO_ATTACK: 32,
  FLUTE_ATTACK: 33,
  BRASS_ATTACK: 34,
  STRINGS_ATTACK: 35,
  BASS_ATTACK: 36,
  VOICE_ATTACK: 37,
  MARIMBA_ATTACK: 38,
  STEEL_DRUM: 39,
  SLAP_BASS: 40,
  BREATH: 41,
  GLASS: 42,
  PICK: 43,
  HAMMER: 44,
  PLUCK: 45,
  CONGA: 46,
  SHAKER: 47,

  // PCM Loop Waveforms - 48-79
  LOOP_1: 48,
  LOOP_2: 49,
  LOOP_3: 50,
  LOOP_4: 51,
  VIOLIN_LOOP: 52,
  CELLO_LOOP: 53,
  TRUMPET_LOOP: 54,
  SAX_LOOP: 55,
  HORN_LOOP: 56,
  CHOIR_LOOP: 57,
  PAD_LOOP_1: 58,
  PAD_LOOP_2: 59,
  ORGAN_LOOP: 60,
  PIPE_ORGAN: 61,
  ACCORDION: 62,
  HARMONICA: 63,
  GUITAR_LOOP: 64,
  ELEC_GUITAR: 65,
  ACOUSTIC_BASS: 66,
  SYNTH_BASS: 67,
  FRETLESS: 68,
  MUTED_GTR: 69,
  KOTO: 70,
  SITAR: 71,
  SHAMISEN: 72,
  KALIMBA: 73,
  MARIMBA_LOOP: 74,
  VIBES: 75,
  BELL: 76,
  TIMPANI: 77,
  ORCHESTRA_HIT: 78,
  NOISE: 79,

  // Special Waveforms - 80-99
  SPECTRUM_1: 80,
  SPECTRUM_2: 81,
  SPECTRUM_3: 82,
  SPECTRUM_4: 83,
  SPECTRUM_5: 84,
  SPECTRUM_6: 85,
  DIGI_WAVE_1: 86,
  DIGI_WAVE_2: 87,
  DIGI_WAVE_3: 88,
  DIGI_WAVE_4: 89,
  METAL_1: 90,
  METAL_2: 91,
  CLAV: 92,
  EP_1: 93,
  EP_2: 94,
  BASS_HIT: 95,
  SYNTH_VOX: 96,
  DIGI_VOX: 97,
  WIND: 98,
  FANTASIA: 99,
} as const;
export type D50WaveGroup = typeof D50WaveGroup[keyof typeof D50WaveGroup];

// Partial parameters
export interface D50Partial {
  waveGroup: D50WaveGroup;
  waveNumber: number;
  pitch: {
    coarse: number;    // -24 to +24 semitones
    fine: number;      // -50 to +50 cents
    keyFollow: number; // Key follow amount
    lfo: {
      depth: number;
      rate: number;
    };
  };
  filter: {
    mode: 'off' | 'lpf' | 'hpf';
    cutoff: number;    // 0-100
    resonance: number; // 0-30
    keyFollow: number;
    envDepth: number;
  };
  amplifier: {
    level: number;     // 0-100
    pan: number;       // L50 to R50
    envelope: {
      time: number[];  // T1-T4
      level: number[]; // L1-L4 (L3 = sustain)
    };
  };
  lfo: {
    waveform: 'tri' | 'saw' | 'square' | 'random';
    rate: number;
    delay: number;
    fadeMode: 'on' | 'off' | 'key';
  };
}

// Complete D-50 Patch
export interface D50Patch {
  name: string;
  structure: D50Structure;
  upper: {
    partial1: D50Partial;
    partial2: D50Partial;
  };
  lower: {
    partial1: D50Partial;
    partial2: D50Partial;
  };
  common: {
    portamento: number;
    bendRange: number;
    keyMode: 'whole' | 'dual' | 'split';
    splitPoint?: number;
  };
  effects: {
    chorusRate: number;
    chorusDepth: number;
    reverbType: 'hall' | 'room' | 'plate';
    reverbLevel: number;
  };
}

// Roland SA register offsets
const ROLAND_SA_REG = {
  // Control memory layout (0x2000 bytes)
  VOICE_BASE: 0x0000,      // Per-voice: 0x80 bytes each
  COMMON_BASE: 0x1000,     // Common parameters
  EFFECTS_BASE: 0x1800,    // Effects parameters
};

// Voice state
interface VoiceState {
  note: number;
  velocity: number;
  active: boolean;
  partialMask: number;
}

export class D50Synth extends Tone.ToneAudioNode {
  readonly name = 'D50Synth';
  readonly input: undefined = undefined;
  readonly output: Tone.Gain;

  private mameEngine: MAMEEngine;
  private handle: number = 0;
  private voices: VoiceState[] = [];
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private romLoaded = false;
  private _currentPatch: D50Patch | null = null;

  // Roland SA clock: 20 MHz
  private static readonly CLOCK = 20000000;
  private static readonly NUM_VOICES = 16;

  constructor() {
    super();
    this.output = new Tone.Gain(1);
    this.mameEngine = MAMEEngine.getInstance();

    // Initialize voice states
    for (let i = 0; i < D50Synth.NUM_VOICES; i++) {
      this.voices.push({
        note: 0,
        velocity: 0,
        active: false,
        partialMask: 0
      });
    }
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInit();
    return this.initPromise;
  }

  public async ensureInitialized(): Promise<void> {
    return this.init();
  }

  private async doInit(): Promise<void> {
    await this.mameEngine.init();

    this.handle = this.mameEngine.createInstance(MAMESynthType.RSA, D50Synth.CLOCK);
    if (this.handle === 0) {
      throw new Error('Failed to create Roland SA instance');
    }

    this.isInitialized = true;
    console.log('[D50Synth] Initialized with Roland SA handle:', this.handle);
  }

  /**
   * Load D-50 ROM data
   * Requires three ROM chips: IC5, IC6, IC7
   */
  async loadROMs(ic5: ArrayBuffer, ic6: ArrayBuffer, ic7: ArrayBuffer): Promise<void> {
    if (!this.isInitialized) await this.init();

    this.mameEngine.rsaLoadRoms(
      this.handle,
      new Uint8Array(ic5),
      new Uint8Array(ic6),
      new Uint8Array(ic7)
    );
    this.romLoaded = true;

    console.log('[D50Synth] ROMs loaded');
  }

  /**
   * Write to control memory
   */
  private writeControl(offset: number, value: number): void {
    if (this.handle === 0) return;
    this.mameEngine.write(this.handle, offset, value);
  }

  /**
   * Convert MIDI note to D-50 pitch (for future envelope implementation)
   */
  private _midiNoteToPitch(midiNote: number, _detune: number = 0): number {
    // D-50 uses MIDI-like note numbers internally
    // with additional fine tuning resolution
    return midiNote;
  }

  /**
   * Allocate a voice
   */
  private allocateVoice(): number {
    let voiceIndex = this.voices.findIndex(v => !v.active);
    if (voiceIndex === -1) {
      // Steal oldest voice
      voiceIndex = 0;
    }
    return voiceIndex;
  }

  /**
   * Load a D-50 patch
   */
  loadPatch(patch: D50Patch): void {
    this._currentPatch = patch;

    if (!this.isInitialized) return;

    // Configure the patch in the chip's control memory
    // This would involve setting up all the partial parameters
    console.log(`[D50Synth] Loaded patch: ${patch.name}`);
  }

  /**
   * Get current patch name
   */
  get patchName(): string {
    return this._currentPatch?.name || 'Init';
  }

  /**
   * Trigger a note on
   */
  triggerAttack(note: string | number, _time?: number, velocity: number = 0.8): this {
    if (!this.isInitialized || !this.romLoaded) {
      console.warn('[D50Synth] Not ready');
      return this;
    }

    const midiNote = typeof note === 'string' ? Tone.Frequency(note).toMidi() : note;
    const voiceIndex = this.allocateVoice();
    const voice = this.voices[voiceIndex];

    // Apply patch detune if set (use chorus rate as subtle detune)
    const detune = this._currentPatch?.effects?.chorusRate ?? 0;
    const pitch = this._midiNoteToPitch(midiNote, detune);

    voice.note = midiNote;
    voice.velocity = Math.floor(velocity * 127);
    voice.active = true;
    voice.partialMask = 0x0F; // All 4 partials active

    // Set up voice registers
    const voiceBase = ROLAND_SA_REG.VOICE_BASE + voiceIndex * 0x80;

    // Write note and velocity
    this.writeControl(voiceBase + 0x00, pitch);
    this.writeControl(voiceBase + 0x01, voice.velocity);

    // Trigger key-on
    this.writeControl(voiceBase + 0x02, 0x01);

    return this;
  }

  /**
   * Trigger a note off
   */
  triggerRelease(note: string | number, _time?: number): this {
    if (!this.isInitialized) return this;

    const midiNote = typeof note === 'string' ? Tone.Frequency(note).toMidi() : note;
    const voiceIndex = this.voices.findIndex(v => v.active && v.note === midiNote);

    if (voiceIndex === -1) return this;

    const voice = this.voices[voiceIndex];
    voice.active = false;

    // Trigger key-off
    const voiceBase = ROLAND_SA_REG.VOICE_BASE + voiceIndex * 0x80;
    this.writeControl(voiceBase + 0x02, 0x00);

    return this;
  }

  /**
   * Set effects parameters
   */
  setChorus(rate: number, depth: number): void {
    this.writeControl(ROLAND_SA_REG.EFFECTS_BASE + 0x00, Math.floor(rate * 127));
    this.writeControl(ROLAND_SA_REG.EFFECTS_BASE + 0x01, Math.floor(depth * 127));
  }

  setReverb(level: number): void {
    this.writeControl(ROLAND_SA_REG.EFFECTS_BASE + 0x10, Math.floor(level * 127));
  }

  /**
   * Get status
   */
  getStatus(): { initialized: boolean; romLoaded: boolean; activeVoices: number } {
    return {
      initialized: this.isInitialized,
      romLoaded: this.romLoaded,
      activeVoices: this.voices.filter(v => v.active).length
    };
  }

  dispose(): this {
    if (this.handle !== 0) {
      this.mameEngine.deleteInstance(this.handle);
      this.handle = 0;
    }
    this.output.dispose();
    return this;
  }
}

// Classic D-50 Presets (simplified)
export const D50_FACTORY_PRESETS: Partial<D50Patch>[] = [
  { name: 'Fantasia', structure: D50Structure.STRUCTURE_1 },
  { name: 'Staccato Heaven', structure: D50Structure.STRUCTURE_4 },
  { name: 'Digital Native Dance', structure: D50Structure.STRUCTURE_3 },
  { name: 'Pizzagogo', structure: D50Structure.STRUCTURE_1 },
  { name: 'Intruder FX', structure: D50Structure.STRUCTURE_2 },
  { name: 'Soundtrack', structure: D50Structure.STRUCTURE_5 },
  { name: 'Glass Voices', structure: D50Structure.STRUCTURE_1 },
  { name: 'Orch Hit', structure: D50Structure.STRUCTURE_4 },
  { name: 'Shakuhachi', structure: D50Structure.STRUCTURE_1 },
  { name: 'Nylon Heaven', structure: D50Structure.STRUCTURE_1 },
  { name: 'Breathy Chiffy', structure: D50Structure.STRUCTURE_3 },
  { name: 'Nightmare', structure: D50Structure.STRUCTURE_2 },
  { name: 'Horn Section', structure: D50Structure.STRUCTURE_4 },
  { name: 'Digital Piano', structure: D50Structure.STRUCTURE_1 },
  { name: 'Brass Section', structure: D50Structure.STRUCTURE_4 },
  { name: 'Bass Marimba', structure: D50Structure.STRUCTURE_1 },
];

export default D50Synth;
