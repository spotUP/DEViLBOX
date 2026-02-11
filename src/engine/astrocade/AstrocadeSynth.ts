
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';

/**
 * Astrocade Parameter IDs (matching C++ enum)
 */
const AstrocadeParam = {
  VOLUME: 0,
  VIBRATO_SPEED: 1,
  VIBRATO_DEPTH: 2,
  NOISE_AM: 3,
  NOISE_MOD: 4,
  NOISE_VOL: 5,
  MASTER_FREQ: 6,
  STEREO_WIDTH: 7,
} as const;

/**
 * Preset names
 */
export const AstrocadePreset = {
  CLEAN_SQUARE: 0,
  VIBRATO_SQUARE: 1,
  WIDE_VIBRATO: 2,
  FAST_VIBRATO: 3,
  NOISE_TONE: 4,
  NOISE_MODULATED: 5,
  ARCADE_SIREN: 6,
  PURE_NOISE: 7,
} as const;

/**
 * Astrocade Synthesizer - Bally Astrocade Custom I/O Sound Chip (WASM)
 *
 * Based on MAME emulator by Aaron Giles / Frank Palazzolo
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The Astrocade Custom I/O chip (~1977) is a sound generator used in
 * the Bally Astrocade console and arcade games like Gorf, Wizard of Wor,
 * and Robby Roto.
 *
 * Features:
 * - 3 square wave tone generators (A, B, C) with 4-bit volume each
 * - Master oscillator with configurable frequency
 * - Hardware vibrato with adjustable speed (4 rates) and depth (64 levels)
 * - 15-bit LFSR noise generator
 * - Noise can modulate master oscillator frequency (AM effect)
 * - Noise AM enable for amplitude modulation
 * - Adaptive frequency mapping for MIDI note input
 * - 8 built-in presets: Clean, Vibrato, Wide Vibrato, Fast Vibrato,
 *   Noise+Tone, Noise Mod, Arcade Siren, Pure Noise
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class AstrocadeSynth extends MAMEBaseSynth {
  readonly name = 'AstrocadeSynth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'Astrocade';
  protected readonly workletFile = 'Astrocade.worklet.js';
  protected readonly processorName = 'astrocade-processor';

  constructor() {
    super();
    this.initSynth();
  }

  // ===========================================================================
  // MAMEBaseSynth Abstract Method Implementations
  // ===========================================================================

  protected writeKeyOn(note: number, velocity: number): void {
    if (!this.workletNode || this._disposed) return;

    this.workletNode.port.postMessage({
      type: 'noteOn',
      note,
      velocity: Math.floor(velocity * 127),
    });
  }

  protected writeKeyOff(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'noteOff', note: this.currentNote });
  }

  protected writeFrequency(freq: number): void {
    if (!this.workletNode || this._disposed) return;

    this.workletNode.port.postMessage({
      type: 'setFrequency',
      freq,
    });
  }

  protected writeVolume(volume: number): void {
    if (!this.workletNode || this._disposed) return;

    this.workletNode.port.postMessage({
      type: 'setVolume',
      value: volume,
    });
  }

  protected writePanning(pan: number): void {
    if (!this.workletNode || this._disposed) return;

    this.workletNode.port.postMessage({
      type: 'setPanning',
      pan,
    });
  }

  // ===========================================================================
  // Astrocade-Specific Methods
  // ===========================================================================

  /** Set output volume (0-1) */
  setVolume(value: number): void {
    this.sendMessage('setVolume', value);
  }

  /** Set vibrato speed (0-3, 0=fastest) */
  setVibratoSpeed(value: number): void {
    this.sendMessage('setVibratoSpeed', value);
  }

  /** Set vibrato depth (0-63) */
  setVibratoDepth(value: number): void {
    this.sendMessage('setVibratoDepth', value);
  }

  /** Set noise volume (0-255) */
  setNoiseVolume(value: number): void {
    this.sendMessage('setNoiseVolume', value);
  }

  /** Write a value to an Astrocade register (0-7) */
  writeRegister(offset: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'writeRegister', offset, value });
  }

  // ===========================================================================
  // MIDI CC and pitch bend
  // ===========================================================================

  controlChange(cc: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'controlChange', cc, value });
  }

  pitchBend(value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'pitchBend', value });
  }

  /** Load a preset patch by program number (0-7) */
  loadPreset(program: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'loadPreset', args: [program] });
      return;
    }
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'programChange', program });
  }

  // ===========================================================================
  // Parameter Interface
  // ===========================================================================

  private setParameterById(paramId: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setParameter', paramId, value });
  }

  setParam(param: string, value: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'setParam', args: [param, value] });
      return;
    }
    const paramMap: Record<string, number> = {
      volume: AstrocadeParam.VOLUME,
      vibrato_speed: AstrocadeParam.VIBRATO_SPEED,
      vibrato_depth: AstrocadeParam.VIBRATO_DEPTH,
      noise_am: AstrocadeParam.NOISE_AM,
      noise_mod: AstrocadeParam.NOISE_MOD,
      noise_vol: AstrocadeParam.NOISE_VOL,
      master_freq: AstrocadeParam.MASTER_FREQ,
      stereo_width: AstrocadeParam.STEREO_WIDTH,
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  private sendMessage(type: string, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type, value });
  }
}

export default AstrocadeSynth;
