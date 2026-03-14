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

// ES5506 byte-write register dispatch offsets.
// Each register occupies 4 bytes; dispatch fires at offset (reg * 4 + 3).
// For a 16-bit value v: write(reg*4+2, v>>8); write(reg*4+3, v&0xFF).
// Low page (PAGE 0x00-0x1F): CONTROL, FC, LVOL, LVRAMP, RVOL, RVRAMP, ECOUNT, K2, K2RAMP, K1, K1RAMP, ACTV, MODE, PAR, IRQV, PAGE
// High page (PAGE 0x20-0x3F): CONTROL, START, END, ACCUM, ...
const ES5506_DISPATCH = {
  CONTROL:  3,   // reg 0: dispatch at 0*4+3=3
  FC:       7,   // reg 1: dispatch at 1*4+3=7
  LVOL:     11,  // reg 2: dispatch at 2*4+3=11
  LVRAMP:   15,  // reg 3: dispatch at 3*4+3=15
  RVOL:     19,  // reg 4: dispatch at 4*4+3=19
  RVRAMP:   23,  // reg 5: dispatch at 5*4+3=23
  K2:       31,  // reg 7: dispatch at 7*4+3=31 (filter resonance)
  K1:       39,  // reg 9: dispatch at 9*4+3=39 (filter cutoff)
  PAGE:     63,  // reg 15: dispatch at 15*4+3=63
  // High page (set PAGE = voice + 0x20 first)
  HP_START: 7,   // reg 1 in high page
  HP_END:   11,  // reg 2 in high page
  HP_ACCUM: 15,  // reg 3 in high page
} as const;

// ES5506 CONTROL register bits
const ES5506_CTRL = {
  STOP0:  0x0001,  // Stop bit 0
  STOP1:  0x0002,  // Stop bit 1
  LEI:    0x0004,  // Loop end interrupt enable
  LPE:    0x0008,  // Loop enable (forward looping)
  BLE:    0x0010,  // Bidirectional loop enable
  IRQE:   0x0020,  // IRQ enable
  DIR:    0x0040,  // Playback direction (reverse)
  IRQ:    0x0080,  // IRQ pending
  LP3:    0x0100,  // Filter pole 3 mode bit
  LP4:    0x0200,  // Filter pole 4 mode bit
  STOP:   0x0003,  // Both stop bits
  // LP3|LP4 = 0x0300: all 4 poles are lowpass (K1, K1, K1, K2)
  // LP4 only = 0x0200: pole3=HP(K2), pole4=LP(K1)
  // LP3 only = 0x0100: pole3=LP(K1), pole4=HP(K2)
  // Neither = 0x0000: poles 3+4 are highpass using K2
  ALL_LP:  0x0300,  // Use all-lowpass 4-pole mode
} as const;

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

    // Start audio rendering before ROM load so the ScriptProcessor is connected
    this.startRendering();

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
   * Connect a ScriptProcessorNode to render MAME ES5506 audio into the output GainNode.
   * Called once after WASM init. ScriptProcessor is deprecated but works for non-worklet synths.
   */
  private startRendering(): void {
    const bufferSize = 512;
    if (!this.audioContext.createScriptProcessor) {
      console.warn('[VFXSynth] ScriptProcessorNode not available');
      return;
    }
    const processor = this.audioContext.createScriptProcessor(bufferSize, 0, 2);
    processor.onaudioprocess = (e: AudioProcessingEvent) => {
      if (!this.isInitialized || this.handle === 0) return;
      const outL = e.outputBuffer.getChannelData(0);
      const outR = e.outputBuffer.getChannelData(1);
      const { left, right } = this.mameEngine.render(this.handle, bufferSize);
      outL.set(left);
      outR.set(right);
    };
    processor.connect(this.output);
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
   * Low-level byte write to ES5506. Dispatch fires when (offset & 3) === 3.
   */
  private w(offset: number, data: number): void {
    this.mameEngine.write(this.handle, offset, data & 0xFF);
  }

  /**
   * Set the PAGE register (selects voice for subsequent reg writes).
   * Low page 0x00-0x1F: CONTROL, FC, VOL, etc.
   * High page 0x20-0x3F: START, END, ACCUM.
   */
  private setPage(page: number): void {
    this.w(ES5506_DISPATCH.PAGE, page & 0x7F);
  }

  /**
   * Write a 16-bit value to a register (by its dispatch offset).
   * The dispatch byte is at dispatchOffset; the high byte is at dispatchOffset-1.
   */
  private writeReg16(dispatchOffset: number, value: number): void {
    this.w(dispatchOffset - 1, (value >> 8) & 0xFF);
    this.w(dispatchOffset, value & 0xFF);
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
   * Trigger a note on.
   *
   * ES5506 byte-write interface: each 32-bit register needs 4 byte writes.
   * The 4th byte (offset & 3 == 3) triggers dispatch; reg index = offset / 4.
   * Latch big-endian: byte@offset+0 = bits[31:24], ..., byte@offset+3 = bits[7:0].
   * For 16-bit register value v: write(dispatchOffset-1, v>>8); write(dispatchOffset, v&0xFF).
   * PAGE register (reg 15) selects the active voice; dispatch at offset 63.
   * Low page (PAGE=voiceIdx): CONTROL, FC, LVOL, RVOL.
   * High page (PAGE=voiceIdx+0x20): START, END.
   */
  triggerAttack(note: string | number, _time?: number, velocity: number = 0.8): void {
    if (!this.isInitialized) {
      console.warn('[VFXSynth] Not ready');
      return;
    }

    const midiNote = typeof note === 'string' ? noteToMidi(note) : note;
    const voiceIndex = this.allocateVoice();
    const voice = this.voices[voiceIndex];

    voice.note = midiNote;
    voice.velocity = Math.floor(velocity * 127);
    voice.active = true;

    // Chip sample rate: clock / (16 * num_voices) = 16MHz / 512 = 31250 Hz
    const chipSr = VFXSynth.CLOCK / (16 * VFXSynth.NUM_VOICES);
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    // freqcount = accumulator increment per chip sample; integer addr = accum >> 11
    const freqCount = Math.round(freq * 2048 / chipSr);
    const vol = this.velocityToVolume(voice.velocity);

    // Low page: select voice for CONTROL, FC, LVOL, RVOL
    this.setPage(voiceIndex);

    // Stop voice: CONTROL = STOP1|STOP0 = 0x0003
    this.writeReg16(ES5506_DISPATCH.CONTROL, ES5506_CTRL.STOP);

    // Set freqcount (FC reg, 17-bit). Dispatch at offset 7.
    // Bits [16]: offset 5 (latch[23:16])
    // Bits [15:8]: offset 6 (latch[15:8])
    // Bits [7:0]: offset 7 (latch[7:0]) — triggers dispatch
    if ((freqCount >> 16) & 0x01) this.w(5, (freqCount >> 16) & 0x01);
    this.w(6, (freqCount >> 8) & 0xFF);
    this.w(7, freqCount & 0xFF);

    // Set volume: LVOL (reg 2, dispatch at 11) and RVOL (reg 4, dispatch at 19)
    this.writeReg16(ES5506_DISPATCH.LVOL, vol);
    this.writeReg16(ES5506_DISPATCH.RVOL, vol);

    // Open filter: K1=0xFFFF (cutoff, reg 9, dispatch at 39) — default K1=0 blocks all audio
    // K2=0xFFFF (resonance, reg 7, dispatch at 31)
    this.writeReg16(ES5506_DISPATCH.K2, 0xFFFF);
    this.writeReg16(ES5506_DISPATCH.K1, 0xFFFF);

    // High page: set voice START and END addresses
    this.setPage(voiceIndex + 0x20);

    // START = 0 (beginning of ROM bank 0). Reg 1 in high page, dispatch at 7.
    this.w(ES5506_DISPATCH.HP_START, 0x00);

    // END = first 4096 samples. Integer addr 0x1000 → raw = 0x1000 << 11 = 0x800000.
    // END data = raw & 0xffffff80. Dispatch at offset 11.
    this.w(8, 0x00); this.w(9, 0x80); this.w(10, 0x00); this.w(11, 0x00);

    // Return to low page and start playback with looping
    this.setPage(voiceIndex);

    // CONTROL = LPE | ALL_LP: loop enable + all-lowpass filter mode, STOP bits cleared
    this.writeReg16(ES5506_DISPATCH.CONTROL, ES5506_CTRL.LPE | ES5506_CTRL.ALL_LP);
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
  triggerRelease(note: string | number, time?: number): void {
    void time;
    if (!this.isInitialized) return;

    const midiNote = typeof note === 'string' ? noteToMidi(note) : note;
    const voiceIndex = this.voices.findIndex(v => v.active && v.note === midiNote);

    if (voiceIndex === -1) return;

    const voice = this.voices[voiceIndex];
    voice.active = false;

    this.setPage(voiceIndex);
    // Stop voice immediately
    this.writeReg16(ES5506_DISPATCH.CONTROL, ES5506_CTRL.STOP);
  }

  /**
   * Release all active voices (panic button, song stop, etc.)
   */
  releaseAll(): void {
    if (!this.isInitialized) return;
    for (const voice of this.voices.filter(v => v.active)) {
      this.triggerRelease(voice.note);
    }
  }

  /**
   * Set filter parameters (K1=cutoff, K2=resonance, both 0-1 normalized)
   */
  setFilter(voice: number, cutoff: number, resonance: number): void {
    // K2 is reg 7 (dispatch at 31), K1 is reg 9 (dispatch at 39)
    this.setPage(voice);
    this.writeReg16(31, Math.floor(cutoff * 0xFFFF));    // K2
    this.writeReg16(39, Math.floor(resonance * 0xFFFF)); // K1
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
