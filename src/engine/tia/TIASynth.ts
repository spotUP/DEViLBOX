
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';

/**
 * TIA Parameter IDs (matching the C++ enum in mame-wasm/tia)
 */
const TIAParam = {
  VOLUME: 0,
  AUDC_MODE: 1,    // 0-15 waveform/noise select (the AUDCx register)
  AUDF_FINE: 2,    // fine frequency adjustment
  STEREO_WIDTH: 3,
  DETUNE: 4,       // slight detune between the paired channels
  POLY_RESET: 5,   // reset polynomial counters
} as const;

/**
 * TIA (Atari 2600 Television Interface Adaptor) sound - WASM
 *
 * Based on the MAME emulator (Ron Fries' TIASound core), compiled to
 * WebAssembly via Emscripten.
 *
 * Two channels, each with a 4-bit AUDC mode selecting between pure tones,
 * 4/5/9-bit polynomial noise and division modes — the entire sound of the
 * Atari 2600. The famously untempered TIA pitch table is what gives it the
 * lo-fi out-of-tune character.
 *
 * Extends MAMEBaseSynth for macros, tracker effects, velocity scaling and
 * oscilloscope support.
 */
export class TIASynth extends MAMEBaseSynth {
  readonly name = 'TIASynth';

  protected readonly chipName = 'TIA';
  protected readonly workletFile = 'TIA.worklet.js';
  protected readonly processorName = 'tia-processor';

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
    this.workletNode.port.postMessage({ type: 'setFrequency', freq });
  }

  protected writeVolume(volume: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setVolume', value: volume });
  }

  protected writePanning(pan: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setPanning', pan });
  }

  // ===========================================================================
  // TIA-Specific Methods
  // ===========================================================================

  /** Select the AUDC waveform/noise mode (0-15) */
  setMode(mode: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setMode', value: mode });
  }

  controlChange(cc: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'controlChange', cc, value });
  }

  pitchBend(value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'pitchBend', value });
  }

  /** Load an AUDC mode preset */
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
      volume: TIAParam.VOLUME,
      audc_mode: TIAParam.AUDC_MODE,
      audf_fine: TIAParam.AUDF_FINE,
      stereo_width: TIAParam.STEREO_WIDTH,
      detune: TIAParam.DETUNE,
      poly_reset: TIAParam.POLY_RESET,
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }
}

export default TIASynth;
