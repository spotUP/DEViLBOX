/**
 * MU2000Synth - Yamaha MU-2000 XG/GM2 Synthesizer
 * Based on the Yamaha SWP30 rompler/DSP chip from MAME
 *
 * This is a 128-voice wavetable synthesizer with:
 * - 16-bit/44.1kHz sample playback
 * - 4MB wave ROM (requires loading)
 * - 2-pole resonant filters per voice
 * - ADSR envelopes
 * - LFO modulation
 * - Effects (reverb, chorus, variation, insertion)
 *
 * NOTE: Requires wave ROM data to be loaded for audio output.
 * The ROM data can be extracted from an original MU-2000 unit.
 */

import * as Tone from 'tone';
import { MAMEEngine, MAMESynthType } from '../MAMEEngine';

// XG/GM2 Voice categories
export const MU2000Category = {
  PIANO: 0,
  CHROMATIC_PERCUSSION: 1,
  ORGAN: 2,
  GUITAR: 3,
  BASS: 4,
  STRINGS: 5,
  ENSEMBLE: 6,
  BRASS: 7,
  REED: 8,
  PIPE: 9,
  SYNTH_LEAD: 10,
  SYNTH_PAD: 11,
  SYNTH_EFFECTS: 12,
  ETHNIC: 13,
  PERCUSSIVE: 14,
  SOUND_EFFECTS: 15
} as const;
export type MU2000Category = typeof MU2000Category[keyof typeof MU2000Category];

// SWP30 Register offsets (from MAME swp30.h)
const SWP30_REG = {
  // Per-voice registers (offset by voice * 0x40)
  START_H: 0x00,       // Sample start address high
  START_L: 0x02,       // Sample start address low
  LOOP_H: 0x04,        // Loop point high
  LOOP_L: 0x06,        // Loop point low
  ADDRESS_H: 0x08,     // Current address high
  ADDRESS_L: 0x0A,     // Current address low
  PITCH: 0x0C,         // Pitch (fixed point)
  FILTER_1_A: 0x10,    // Filter 1 cutoff/resonance
  LEVEL_1: 0x12,       // Level 1
  FILTER_2_A: 0x14,    // Filter 2 cutoff/resonance
  LEVEL_2: 0x16,       // Level 2
  FILTER_B: 0x18,      // Filter B coefficient
  ATTACK: 0x20,        // Attack time
  DECAY1: 0x22,        // Decay 1 time
  DECAY2: 0x24,        // Decay 2 time (sustain level encoded)
  RELEASE: 0x26,       // Release time
  PAN: 0x30,           // Pan position
  VOLUME: 0x32,        // Voice volume
  // Global registers
  MASTER_VOLUME: 0x1000,
  REVERB_SEND: 0x1002,
  CHORUS_SEND: 0x1004,
};

// Voice allocation state
interface VoiceState {
  note: number;
  velocity: number;
  channel: number;
  active: boolean;
  startTime: number;
}

// MU-2000 Preset
export interface MU2000Preset {
  name: string;
  category: MU2000Category;
  bank: number;     // 0-127
  program: number;  // 0-127
  // Voice parameters
  startAddress?: number;
  loopPoint?: number;
  filter?: {
    cutoff: number;    // 0-127
    resonance: number; // 0-127
    envAmount: number; // -64 to +63
  };
  envelope?: {
    attack: number;   // 0-127
    decay1: number;   // 0-127
    decay2: number;   // 0-127 (sustain)
    release: number;  // 0-127
  };
  lfo?: {
    rate: number;     // 0-127
    pitchDepth: number;
    filterDepth: number;
  };
}

export class MU2000Synth extends Tone.ToneAudioNode {
  readonly name = 'MU2000Synth';
  readonly input: undefined = undefined;
  readonly output: Tone.Gain;

  private mameEngine: MAMEEngine;
  private handle: number = 0;
  private voices: VoiceState[] = [];
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private romLoaded = false;

  // Default clock for SWP30: 33.8688 MHz
  private static readonly CLOCK = 33868800;
  private static readonly NUM_VOICES = 64;

  constructor() {
    super();
    this.output = new Tone.Gain(1);
    this.mameEngine = MAMEEngine.getInstance();

    // Initialize voice states
    for (let i = 0; i < MU2000Synth.NUM_VOICES; i++) {
      this.voices.push({
        note: 0,
        velocity: 0,
        channel: 0,
        active: false,
        startTime: 0
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
    // Initialize MAME engine
    await this.mameEngine.init();

    // Create SWP30 instance
    this.handle = this.mameEngine.createInstance(MAMESynthType.SWP30, MU2000Synth.CLOCK);
    if (this.handle === 0) {
      throw new Error('Failed to create SWP30 instance');
    }

    this.isInitialized = true;
    console.log('[MU2000Synth] Initialized with SWP30 handle:', this.handle);
  }

  /**
   * Load wave ROM data
   * The MU-2000 uses approximately 4MB of wave ROM data
   */
  async loadWaveROM(data: ArrayBuffer): Promise<void> {
    if (!this.isInitialized) await this.init();

    const romData = new Uint8Array(data);
    this.mameEngine.setRom(0, romData);
    this.romLoaded = true;

    console.log(`[MU2000Synth] Wave ROM loaded: ${romData.length} bytes`);
  }

  /**
   * Convert MIDI note to SWP30 pitch value
   * The SWP30 uses a 14-bit pitch value with fixed-point representation
   */
  private midiNoteToPitch(midiNote: number, pitchBend: number = 0): number {
    // Base frequency calculation
    // MIDI note 60 (C4) = 261.63 Hz
    // SWP30 pitch is relative to sample rate and base frequency
    const baseNote = 60;
    const semitones = midiNote - baseNote + (pitchBend / 8192);

    // Pitch value encoding (14-bit)
    // The exact formula depends on sample format and rate
    const pitchMultiplier = Math.pow(2, semitones / 12);
    return Math.floor(0x2000 * pitchMultiplier) & 0xFFFF;
  }

  /**
   * Convert velocity to SWP30 volume
   */
  private velocityToVolume(velocity: number): number {
    // Volume is typically logarithmic
    // SWP30 uses 8-bit volume with exponential curve
    return Math.floor(velocity * 2);
  }

  /**
   * Allocate a voice for a new note
   */
  private allocateVoice(channel: number): number {
    // First, look for an inactive voice
    let voiceIndex = this.voices.findIndex(v => !v.active);

    if (voiceIndex === -1) {
      // Voice stealing: find the oldest voice on the same channel
      let oldestTime = Infinity;
      let oldestIndex = 0;

      for (let i = 0; i < this.voices.length; i++) {
        if (this.voices[i].channel === channel && this.voices[i].startTime < oldestTime) {
          oldestTime = this.voices[i].startTime;
          oldestIndex = i;
        }
      }

      // If no voice on same channel, steal the oldest voice overall
      if (oldestTime === Infinity) {
        for (let i = 0; i < this.voices.length; i++) {
          if (this.voices[i].startTime < oldestTime) {
            oldestTime = this.voices[i].startTime;
            oldestIndex = i;
          }
        }
      }

      voiceIndex = oldestIndex;
    }

    return voiceIndex;
  }

  /**
   * Write a register value
   */
  private writeReg(offset: number, value: number): void {
    if (this.handle === 0) return;
    this.mameEngine.write16(this.handle, offset, value);
  }

  /**
   * Trigger a note on
   */
  triggerAttack(note: string | number, _time?: number, velocity: number = 0.8, channel: number = 0): this {
    if (!this.isInitialized || !this.romLoaded) {
      console.warn('[MU2000Synth] Not ready (initialized:', this.isInitialized, ', ROM:', this.romLoaded, ')');
      return this;
    }

    const midiNote = typeof note === 'string' ? Tone.Frequency(note).toMidi() : note;
    const voiceIndex = this.allocateVoice(channel);
    const voice = this.voices[voiceIndex];

    voice.note = midiNote;
    voice.velocity = Math.floor(velocity * 127);
    voice.channel = channel;
    voice.active = true;
    voice.startTime = performance.now();

    // Calculate voice register base offset
    const voiceBase = voiceIndex * 0x40;

    // Set pitch
    const pitch = this.midiNoteToPitch(midiNote);
    this.writeReg(voiceBase + SWP30_REG.PITCH, pitch);

    // Set volume
    const volume = this.velocityToVolume(voice.velocity);
    this.writeReg(voiceBase + SWP30_REG.VOLUME, volume);

    // Reset envelope (trigger attack phase)
    // The SWP30 auto-starts when sample address is written
    this.writeReg(voiceBase + SWP30_REG.ADDRESS_H, 0);
    this.writeReg(voiceBase + SWP30_REG.ADDRESS_L, 0);

    return this;
  }

  /**
   * Trigger a note off
   */
  triggerRelease(note: string | number, _time?: number): this {
    if (!this.isInitialized) return this;

    const midiNote = typeof note === 'string' ? Tone.Frequency(note).toMidi() : note;

    // Find the voice playing this note
    const voiceIndex = this.voices.findIndex(v => v.active && v.note === midiNote);
    if (voiceIndex === -1) return this;

    const voice = this.voices[voiceIndex];
    voice.active = false;

    // Trigger release phase by writing to release register
    // The envelope will handle the fade-out
    const voiceBase = voiceIndex * 0x40;

    // For now, just set volume to 0 (proper envelope would use release time)
    this.writeReg(voiceBase + SWP30_REG.VOLUME, 0);

    return this;
  }

  /**
   * Send MIDI event (for SysEx patches, etc.)
   */
  sendMidi(data: Uint8Array): void {
    if (this.handle === 0) return;
    this.mameEngine.addMidiEvent(this.handle, data);
  }

  /**
   * Set master volume
   */
  setMasterVolume(volume: number): void {
    this.writeReg(SWP30_REG.MASTER_VOLUME, Math.floor(volume * 255));
  }

  /**
   * Get current status
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

// GM2 Preset bank (partial - first 16 programs per category)
export const MU2000_GM2_PRESETS: MU2000Preset[] = [
  // Pianos
  { name: 'Grand Piano', category: MU2000Category.PIANO, bank: 0, program: 0 },
  { name: 'Bright Piano', category: MU2000Category.PIANO, bank: 0, program: 1 },
  { name: 'Electric Grand', category: MU2000Category.PIANO, bank: 0, program: 2 },
  { name: 'Honky-tonk', category: MU2000Category.PIANO, bank: 0, program: 3 },
  { name: 'Electric Piano 1', category: MU2000Category.PIANO, bank: 0, program: 4 },
  { name: 'Electric Piano 2', category: MU2000Category.PIANO, bank: 0, program: 5 },
  { name: 'Harpsichord', category: MU2000Category.PIANO, bank: 0, program: 6 },
  { name: 'Clavinet', category: MU2000Category.PIANO, bank: 0, program: 7 },

  // Chromatic Percussion
  { name: 'Celesta', category: MU2000Category.CHROMATIC_PERCUSSION, bank: 0, program: 8 },
  { name: 'Glockenspiel', category: MU2000Category.CHROMATIC_PERCUSSION, bank: 0, program: 9 },
  { name: 'Music Box', category: MU2000Category.CHROMATIC_PERCUSSION, bank: 0, program: 10 },
  { name: 'Vibraphone', category: MU2000Category.CHROMATIC_PERCUSSION, bank: 0, program: 11 },
  { name: 'Marimba', category: MU2000Category.CHROMATIC_PERCUSSION, bank: 0, program: 12 },
  { name: 'Xylophone', category: MU2000Category.CHROMATIC_PERCUSSION, bank: 0, program: 13 },
  { name: 'Tubular Bells', category: MU2000Category.CHROMATIC_PERCUSSION, bank: 0, program: 14 },
  { name: 'Dulcimer', category: MU2000Category.CHROMATIC_PERCUSSION, bank: 0, program: 15 },

  // Organs
  { name: 'Drawbar Organ', category: MU2000Category.ORGAN, bank: 0, program: 16 },
  { name: 'Percussive Organ', category: MU2000Category.ORGAN, bank: 0, program: 17 },
  { name: 'Rock Organ', category: MU2000Category.ORGAN, bank: 0, program: 18 },
  { name: 'Church Organ', category: MU2000Category.ORGAN, bank: 0, program: 19 },
  { name: 'Reed Organ', category: MU2000Category.ORGAN, bank: 0, program: 20 },
  { name: 'Accordion', category: MU2000Category.ORGAN, bank: 0, program: 21 },
  { name: 'Harmonica', category: MU2000Category.ORGAN, bank: 0, program: 22 },
  { name: 'Tango Accordion', category: MU2000Category.ORGAN, bank: 0, program: 23 },

  // Synth Leads
  { name: 'Lead 1 (Square)', category: MU2000Category.SYNTH_LEAD, bank: 0, program: 80 },
  { name: 'Lead 2 (Sawtooth)', category: MU2000Category.SYNTH_LEAD, bank: 0, program: 81 },
  { name: 'Lead 3 (Calliope)', category: MU2000Category.SYNTH_LEAD, bank: 0, program: 82 },
  { name: 'Lead 4 (Chiff)', category: MU2000Category.SYNTH_LEAD, bank: 0, program: 83 },
  { name: 'Lead 5 (Charang)', category: MU2000Category.SYNTH_LEAD, bank: 0, program: 84 },
  { name: 'Lead 6 (Voice)', category: MU2000Category.SYNTH_LEAD, bank: 0, program: 85 },
  { name: 'Lead 7 (Fifths)', category: MU2000Category.SYNTH_LEAD, bank: 0, program: 86 },
  { name: 'Lead 8 (Bass+Lead)', category: MU2000Category.SYNTH_LEAD, bank: 0, program: 87 },

  // Synth Pads
  { name: 'Pad 1 (New Age)', category: MU2000Category.SYNTH_PAD, bank: 0, program: 88 },
  { name: 'Pad 2 (Warm)', category: MU2000Category.SYNTH_PAD, bank: 0, program: 89 },
  { name: 'Pad 3 (Polysynth)', category: MU2000Category.SYNTH_PAD, bank: 0, program: 90 },
  { name: 'Pad 4 (Choir)', category: MU2000Category.SYNTH_PAD, bank: 0, program: 91 },
  { name: 'Pad 5 (Bowed)', category: MU2000Category.SYNTH_PAD, bank: 0, program: 92 },
  { name: 'Pad 6 (Metallic)', category: MU2000Category.SYNTH_PAD, bank: 0, program: 93 },
  { name: 'Pad 7 (Halo)', category: MU2000Category.SYNTH_PAD, bank: 0, program: 94 },
  { name: 'Pad 8 (Sweep)', category: MU2000Category.SYNTH_PAD, bank: 0, program: 95 },
];

export default MU2000Synth;
