
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';

/**
 * SP0250 Parameter IDs (matching C++ enum)
 */
const SP0250Param = {
  VOLUME: 0,
  VOWEL: 1,
  VOICED: 2,
  BRIGHTNESS: 3,
  STEREO_WIDTH: 4,
  FILTER_MIX: 5,
} as const;

/**
 * Vowel presets
 */
export const SP0250Preset = {
  AH: 0,       // /a/ (father) - open vowel
  EE: 1,       // /e/ (beet) - front close
  IH: 2,       // /i/ (bit) - front open
  OH: 3,       // /o/ (boat) - back rounded
  OO: 4,       // /u/ (boot) - back close
  NN: 5,       // Nasal /n/
  ZZ: 6,       // Buzz (unvoiced noise)
  HH: 7,       // Breathy
} as const;

/**
 * SP0250 Synthesizer - GI SP0250 Digital LPC Sound Synthesizer (WASM)
 *
 * Based on MAME emulator by Olivier Galibert
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The SP0250 is a digital formant/LPC (Linear Predictive Coding)
 * synthesizer that generates speech and vocal sounds through:
 * - Voiced excitation (pitch pulse train) or unvoiced (15-bit LFSR noise)
 * - 6 cascaded second-order lattice filters shaping the spectral envelope
 * - 8-bit amplitude control with mantissa+exponent encoding
 *
 * Features:
 * - 4-voice polyphony (extended from original single voice)
 * - 8 built-in vowel/formant presets: AH, EE, IH, OH, OO, NN, ZZ, HH
 * - Direct coefficient control for filter shaping
 * - 15-byte FIFO hardware-compatible interface
 * - Internal 128-entry coefficient ROM (from MAME)
 * - LPC runs at ~10kHz (authentic) with interpolated upsampling
 * - MIDI pitch mapping with pitch bend support
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class SP0250Synth extends MAMEBaseSynth {
  readonly name = 'SP0250Synth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'SP0250';
  protected readonly workletFile = 'SP0250.worklet.js';
  protected readonly processorName = 'sp0250-processor';

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
  // SP0250-Specific Methods
  // ===========================================================================

  /** Set output volume (0-1) */
  setVolume(value: number): void {
    this.sendMessage('setVolume', value);
  }

  /** Set vowel preset (0-7). Use SP0250Preset constants. */
  setVowel(value: number): void {
    this.sendMessage('setVowel', value);
  }

  /** Set voiced excitation (true) or noise excitation (false) */
  setVoiced(voiced: boolean): void {
    this.setParameterById(SP0250Param.VOICED, voiced ? 1.0 : 0.0);
  }

  /** Set brightness / upper formant emphasis (0-1) */
  setBrightness(value: number): void {
    this.setParameterById(SP0250Param.BRIGHTNESS, value);
  }

  /** Write a value to the SP0250 FIFO (index 0-14) */
  writeFIFO(index: number, data: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'writeFIFO', index, data });
  }

  /** Set individual filter coefficient (filterIdx 0-5, isB: false=F/true=B, value 0-255) */
  setFilterCoeff(filterIdx: number, isB: boolean, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setFilterCoeff', filterIdx, isB, value });
  }

  /** Write a value to an SP0250 register */
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

  /** Load a vowel preset by program number (0-7) */
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
      volume: SP0250Param.VOLUME,
      vowel: SP0250Param.VOWEL,
      voiced: SP0250Param.VOICED,
      brightness: SP0250Param.BRIGHTNESS,
      stereo_width: SP0250Param.STEREO_WIDTH,
      filter_mix: SP0250Param.FILTER_MIX,
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

export default SP0250Synth;
