/**
 * VFXSynth - Ensoniq VFX/TS-10/SD-1 Wavetable Synthesizer
 * Based on the Ensoniq ES5506 chip emulation from MAME
 *
 * The ES5506 (1989) is a 32-voice wavetable synthesizer with:
 * - 32 voices at 44.1kHz
 * - 16-bit samples with interpolation
 * - 2-pole resonant filters per voice
 * - Stereo output with panning
 * - Volume and filter envelope ramping
 * - Up to 4 memory banks (8MB total sample RAM)
 *
 * Used in:
 * - Ensoniq VFX, VFX-sd (1989)
 * - Ensoniq SD-1 (1990)
 * - Ensoniq TS-10, TS-12 (1993)
 * - Ensoniq EPS-16+, ASR-10 (samplers)
 * - Many arcade games (Taito F3, Namco System 22, etc.)
 *
 * NOTE: Requires wave ROM data for audio output.
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi, timeToSeconds } from '@/utils/audio-context';
import { MAMEEngine, MAMESynthType } from '../MAMEEngine';
import { loadVFXROMs } from '@engine/mame/MAMEROMLoader';

// ES5506 Voice control bits
export const ES5506Control = {
  LOOP_ENABLE: 0x0001,
  BIDIRECTIONAL: 0x0002,
  IRQ_ENABLE: 0x0004,
  IRQ_PENDING: 0x0008,
  DIRECTION: 0x0010,
  LOOP_TYPE: 0x0060,  // 00=off, 01=loop, 10=bidirectional, 11=reverse
  STOP: 0x0080,
  LP3_ENABLE: 0x0100,
  LP4_ENABLE: 0x0200,
  LP_MASK: 0x0300,
  FILTER_MODE: 0x0C00,
  CA_MASK: 0x7000,
  BANK_MASK: 0x8000,
} as const;
export type ES5506Control = typeof ES5506Control[keyof typeof ES5506Control];

// Filter modes
export const ES5506FilterMode = {
  LP2: 0,    // 2-pole lowpass
  LP2_LP3: 1, // 2-pole + 3-pole cascade
  LP2_LP4: 2, // 2-pole + 4-pole cascade
  LP2_LP3_LP4: 3, // All poles
} as const;
export type ES5506FilterMode = typeof ES5506FilterMode[keyof typeof ES5506FilterMode];

// VFX Transwave categories
export const VFXTranswave = {
  // Acoustic instruments
  PIANO: 0,
  ELECTRIC_PIANO: 1,
  ORGAN: 2,
  GUITAR: 3,
  BASS: 4,
  STRINGS: 5,
  BRASS: 6,
  WOODWIND: 7,

  // Synthesizer waves
  ANALOG_SAW: 16,
  ANALOG_SQUARE: 17,
  ANALOG_PULSE: 18,
  DIGITAL_WAVE: 19,
  BELL: 20,
  MALLET: 21,

  // Drum samples
  KICK: 32,
  SNARE: 33,
  HIHAT: 34,
  TOM: 35,
  CYMBAL: 36,
  PERCUSSION: 37,
} as const;
export type VFXTranswave = typeof VFXTranswave[keyof typeof VFXTranswave];

// ES5506 register offsets
const ES5506_REG = {
  // Page 0 registers (per voice)
  CONTROL: 0x00,
  FREQCOUNT: 0x01,
  START: 0x02,
  LVOL: 0x03,
  END: 0x04,
  LVRAMP: 0x05,
  ACCUM: 0x06,
  RVOL: 0x07,
  RVRAMP: 0x08,
  ECOUNT: 0x09,
  K2: 0x0A,
  K2RAMP: 0x0B,
  K1: 0x0C,
  K1RAMP: 0x0D,

  // Page 1 registers
  IRQV: 0x80,
  PAGE: 0x81,
  ACTIVE: 0x82,
  MODE: 0x83,
};

// Voice state
interface VoiceState {
  note: number;
  velocity: number;
  active: boolean;
  looping: boolean;
}

// VFX Patch structure
export interface VFXPatch {
  name: string;
  voices: VFXVoice[];
  effects?: {
    reverb: number;
    chorus: number;
  };
}

export interface VFXVoice {
  transwave: VFXTranswave;
  sampleStart: number;
  sampleEnd: number;
  loopStart?: number;
  loopEnd?: number;
  loopType: 'off' | 'forward' | 'bidirectional' | 'reverse';
  pitch: {
    coarse: number;  // Semitones
    fine: number;    // Cents
    keyTrack: number; // Key tracking amount
  };
  filter: {
    mode: ES5506FilterMode;
    cutoff: number;   // K1 value (0-65535)
    resonance: number; // K2 value (0-65535)
    envAmount: number;
  };
  amplitude: {
    level: number;    // 0-65535
    pan: number;      // -100 to +100
    envAttack: number;
    envDecay: number;
    envSustain: number;
    envRelease: number;
  };
}

export class VFXSynth implements DevilboxSynth {
  readonly name = 'VFXSynth';
  readonly output: GainNode;
  private audioContext: AudioContext;

  private mameEngine: MAMEEngine;
  private handle: number = 0;
  private voices: VoiceState[] = [];
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private romLoaded = false;
  private _currentPatch: VFXPatch | null = null;

  // ES5506 runs at approximately 16MHz for VFX
  private static readonly CLOCK = 16000000;
  private static readonly NUM_VOICES = 32;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this.mameEngine = MAMEEngine.getInstance();

    // Initialize voice states
    for (let i = 0; i < VFXSynth.NUM_VOICES; i++) {
      this.voices.push({
        note: 0,
        velocity: 0,
        active: false,
        looping: false
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

    this.handle = this.mameEngine.createInstance(MAMESynthType.VFX, VFXSynth.CLOCK);
    if (this.handle === 0) {
      throw new Error('Failed to create ES5506 instance');
    }

    this.isInitialized = true;
    console.log('[VFXSynth] Initialized with ES5506 handle:', this.handle);

    // Auto-load sample ROM banks
    try {
      const banks = await loadVFXROMs();
      for (let i = 0; i < banks.length; i++) {
        await this.loadSampleROM(i, banks[i].buffer as ArrayBuffer);
      }
      console.log('[VFXSynth] ROMs loaded successfully');
    } catch (error) {
      console.error('[VFXSynth] ROM loading failed:', error);
      console.error('Place ROM files in /public/roms/vfx/ - see /public/roms/README.md');
      // Continue anyway - synth will initialize but won't produce sound without ROMs
    }
  }

  /**
   * Load sample ROM data
   * The VFX uses multiple ROM banks
   */
  async loadSampleROM(bank: number, data: ArrayBuffer): Promise<void> {
    if (!this.isInitialized) await this.init();

    this.mameEngine.setRom(bank, new Uint8Array(data));
    this.romLoaded = true;

    console.log(`[VFXSynth] Sample ROM bank ${bank} loaded: ${data.byteLength} bytes`);
  }

  /**
   * Write to voice register
   */
  private writeVoiceReg(voice: number, reg: number, value: number): void {
    if (this.handle === 0) return;

    // ES5506 uses page-based register access
    // Each voice has 14 registers
    const offset = (voice * 0x10) + reg;
    this.mameEngine.write16(this.handle, offset, value);
  }

  /**
   * Convert MIDI note to ES5506 frequency count
   */
  private midiNoteToFreqCount(midiNote: number, sampleRate: number = 44100): number {
    // ES5506 frequency count is a 32-bit fixed-point value
    // Frequency = (freqcount * sampleRate) / 2^32
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const freqCount = Math.floor((freq * Math.pow(2, 32)) / sampleRate);
    return freqCount & 0xFFFFFFFF;
  }

  /**
   * Convert velocity to ES5506 volume
   */
  private velocityToVolume(velocity: number): number {
    // ES5506 uses 16-bit volume with exponential curve
    const linear = velocity / 127;
    const exponential = Math.pow(linear, 2);
    return Math.floor(exponential * 0xFFFF);
  }

  /**
   * Allocate a voice
   */
  private allocateVoice(): number {
    let voiceIndex = this.voices.findIndex(v => !v.active);
    if (voiceIndex === -1) {
      voiceIndex = 0;
    }
    return voiceIndex;
  }

  /**
   * Load a VFX patch
   */
  loadPatch(patch: VFXPatch): void {
    this._currentPatch = patch;
    console.log(`[VFXSynth] Loaded patch: ${patch.name}`);
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
  triggerAttack(note: string | number, _time?: number, velocity: number = 0.8): void {
    if (!this.isInitialized || !this.romLoaded) {
      console.warn('[VFXSynth] Not ready');
      return;
    }

    const midiNote = typeof note === 'string' ? noteToMidi(note) : note;
    const voiceIndex = this.allocateVoice();
    const voice = this.voices[voiceIndex];

    voice.note = midiNote;
    voice.velocity = Math.floor(velocity * 127);
    voice.active = true;

    // Set frequency
    const freqCount = this.midiNoteToFreqCount(midiNote);
    this.writeVoiceReg(voiceIndex, ES5506_REG.FREQCOUNT, freqCount >>> 16);
    this.writeVoiceReg(voiceIndex, ES5506_REG.FREQCOUNT + 1, freqCount & 0xFFFF);

    // Set volume (left and right)
    const volume = this.velocityToVolume(voice.velocity);
    this.writeVoiceReg(voiceIndex, ES5506_REG.LVOL, volume);
    this.writeVoiceReg(voiceIndex, ES5506_REG.RVOL, volume);

    // Reset accumulator to start sample
    this.writeVoiceReg(voiceIndex, ES5506_REG.ACCUM, 0);

    // Start playing (clear stop bit)
    let control = ES5506Control.LOOP_ENABLE;
    this.writeVoiceReg(voiceIndex, ES5506_REG.CONTROL, control);
  }

  /**
   * Trigger a note with automatic release
   */
  triggerAttackRelease(note: string | number, duration: string | number = 0.5, _time?: number, velocity: number = 0.8): void {
    this.triggerAttack(note, _time, velocity);

    // Schedule release
    const durationSeconds = typeof duration === 'string' ? timeToSeconds(duration) : duration;
    setTimeout(() => {
      this.triggerRelease(note);
    }, durationSeconds * 1000);
  }

  /**
   * Trigger a note off
   */
  triggerRelease(note: string | number, _time?: number): void {
    if (!this.isInitialized) return;

    const midiNote = typeof note === 'string' ? noteToMidi(note) : note;
    const voiceIndex = this.voices.findIndex(v => v.active && v.note === midiNote);

    if (voiceIndex === -1) return;

    const voice = this.voices[voiceIndex];
    voice.active = false;

    // Set volume ramp to fade out
    this.writeVoiceReg(voiceIndex, ES5506_REG.LVRAMP, 0x80); // Fast decay
    this.writeVoiceReg(voiceIndex, ES5506_REG.RVRAMP, 0x80);

    // Or immediately stop
    // this.writeVoiceReg(voiceIndex, ES5506_REG.CONTROL, ES5506Control.STOP);
  }

  /**
   * Set filter parameters
   */
  setFilter(voice: number, cutoff: number, resonance: number): void {
    // K1 = cutoff, K2 = resonance (both 16-bit)
    this.writeVoiceReg(voice, ES5506_REG.K1, Math.floor(cutoff * 0xFFFF));
    this.writeVoiceReg(voice, ES5506_REG.K2, Math.floor(resonance * 0xFFFF));
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

  dispose(): void {
    if (this.handle !== 0) {
      this.mameEngine.deleteInstance(this.handle);
      this.handle = 0;
    }
    this.output.disconnect();
  }
}

// VFX Factory Presets (simplified)
export const VFX_FACTORY_PRESETS: VFXPatch[] = [
  { name: 'Piano', voices: [] },
  { name: 'VeloStrings', voices: [] },
  { name: 'BrassSection', voices: [] },
  { name: 'DigitalSaw', voices: [] },
  { name: 'BellPad', voices: [] },
  { name: 'SynthBass', voices: [] },
  { name: 'OrganLayer', voices: [] },
  { name: 'TransWave', voices: [] },
];

export default VFXSynth;
