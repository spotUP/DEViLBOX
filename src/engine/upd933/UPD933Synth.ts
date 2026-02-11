
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';

/**
 * uPD933 Parameter IDs (matching C++ enum)
 */
const UPD933Param = {
  VOLUME: 0,
  WAVEFORM1: 1,
  WAVEFORM2: 2,
  WINDOW: 3,
  DCW_DEPTH: 4,
  DCA_RATE: 5,
  DCW_RATE: 6,
  DCO_RATE: 7,
  DCO_DEPTH: 8,
  RING_MOD: 9,
  STEREO_WIDTH: 10,
} as const;

/**
 * CZ-style waveforms (phase distortion transfer functions)
 */
export const UPD933Waveform = {
  SAWTOOTH: 0,
  SQUARE: 1,
  PULSE: 2,
  SILENT: 3,
  DOUBLE_SINE: 4,
  SAW_PULSE: 5,
  RESONANCE: 6,
  DOUBLE_PULSE: 7,
} as const;

/**
 * Window functions
 */
export const UPD933Window = {
  NONE: 0,
  SAWTOOTH: 1,
  TRIANGLE: 2,
  TRAPEZOID: 3,
  PULSE: 4,
  DOUBLE_SAW: 5,
} as const;

/**
 * CZ-style presets
 */
export const UPD933Preset = {
  BRASS: 0,
  STRINGS: 1,
  EPIANO: 2,
  BASS: 3,
  ORGAN: 4,
  PAD: 5,
  LEAD: 6,
  BELL: 7,
} as const;

/**
 * uPD933 (NEC/Casio) - Phase Distortion Synthesis Chip (WASM)
 *
 * Based on MAME emulator by Devin Acker
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The uPD933 is the heart of the Casio CZ series synthesizers.
 * It implements Casio's proprietary "Phase Distortion" (PD) synthesis,
 * which distorts the phase of a cosine wave using various transfer
 * functions to create harmonically rich timbres without FM synthesis.
 *
 * Features:
 * - 8-voice polyphony (matching CZ hardware)
 * - 8 PD waveform types (sawtooth, square, pulse, double sine,
 *   saw pulse, resonance, double pulse, silent)
 * - 6 window functions for waveshaping
 * - 3 envelope generators per voice: DCA, DCW, DCO
 * - Ring modulation between voice pairs
 * - Pitch modulation (voice cross-mod or noise)
 * - Cosine-based output with phase distortion
 * - 8 CZ-style presets (brass, strings, e.piano, bass, organ, pad, lead, bell)
 *
 * Used in: Casio CZ-101, CZ-1000, CZ-1, CZ-3000, CZ-5000
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class UPD933Synth extends MAMEBaseSynth {
  readonly name = 'UPD933Synth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'UPD933';
  protected readonly workletFile = 'UPD933.worklet.js';
  protected readonly processorName = 'upd933-processor';

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
  // UPD933-Specific Methods
  // ===========================================================================

  /** Set output volume (0-1) */
  setVolume(value: number): void {
    this.sendMessage('setVolume', value);
  }

  /** Set PD waveform types. Use UPD933Waveform constants.
   * wave1: first half waveform (0-7), wave2: second half waveform (0-7) */
  setWaveform(wave1: number, wave2: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setWaveform', wave1, wave2 });
  }

  /** Set window function (0-5). Use UPD933Window constants. */
  setWindow(win: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setWindow', value: win });
  }

  /** Set DCW (waveform distortion) depth (0-127) */
  setDCWDepth(depth: number): void {
    this.setParameterById(UPD933Param.DCW_DEPTH, depth);
  }

  /** Set DCA (amplitude envelope) rate (0-127, higher=faster) */
  setDCARate(rate: number): void {
    this.setParameterById(UPD933Param.DCA_RATE, rate);
  }

  /** Set DCW (waveform envelope) rate (0-127, higher=faster) */
  setDCWRate(rate: number): void {
    this.setParameterById(UPD933Param.DCW_RATE, rate);
  }

  /** Set DCO (pitch envelope) depth (0-63 semitones) */
  setDCODepth(depth: number): void {
    this.setParameterById(UPD933Param.DCO_DEPTH, depth);
  }

  /** Set ring modulation enable (true/false) */
  setRingMod(enabled: boolean): void {
    this.setParameterById(UPD933Param.RING_MOD, enabled ? 1 : 0);
  }

  /** Load a CZ-style preset (0-7). Use UPD933Preset constants. */
  loadPreset(program: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'loadPreset', args: [program] });
      return;
    }
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'programChange', program });
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
      volume: UPD933Param.VOLUME,
      waveform1: UPD933Param.WAVEFORM1,
      waveform2: UPD933Param.WAVEFORM2,
      window: UPD933Param.WINDOW,
      dcw_depth: UPD933Param.DCW_DEPTH,
      dca_rate: UPD933Param.DCA_RATE,
      dcw_rate: UPD933Param.DCW_RATE,
      dco_rate: UPD933Param.DCO_RATE,
      dco_depth: UPD933Param.DCO_DEPTH,
      ring_mod: UPD933Param.RING_MOD,
      stereo_width: UPD933Param.STEREO_WIDTH,
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

export default UPD933Synth;
