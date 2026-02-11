
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';

/**
 * SNKWave Parameter IDs (matching C++ enum)
 */
const SNKWaveParam = {
  VOLUME: 0,
  WAVEFORM: 1,
  STEREO_WIDTH: 2,
  DETUNE: 3,
} as const;

/**
 * Waveform presets
 */
export const SNKWavePreset = {
  SINE: 0,
  SAWTOOTH: 1,
  SQUARE: 2,
  TRIANGLE: 3,
  PULSE_25: 4,
  ORGAN: 5,
  BUZZ: 6,
  SOFT_BELL: 7,
} as const;

/**
 * SNKWave Synthesizer - SNK Wave Programmable Waveform Generator (WASM)
 *
 * Based on MAME emulator by Nicola Salmoria
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The SNK Wave chip is a simple programmable waveform generator used in
 * early SNK arcade games (Vanguard, Fantasy, Sasuke vs Commander).
 *
 * Features:
 * - 8-voice polyphony (extended from original single voice)
 * - Programmable 16-sample wavetable with 3-bit resolution
 * - Ping-pong playback: forward with bit3=1, backward with bit3=0
 * - 12-bit frequency control per voice
 * - 8 built-in waveform presets: Sine, Saw, Square, Triangle,
 *   Pulse 25%, Organ, Buzz, Soft Bell
 * - Custom waveform upload (4 bytes = 8 x 3-bit samples)
 * - Per-voice stereo panning with configurable width
 * - Voice detuning for unison/chorus effects
 * - Simple attack/release envelope per voice
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, wavetable, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class SNKWaveSynth extends MAMEBaseSynth {
  readonly name = 'SNKWaveSynth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'SNKWave';
  protected readonly workletFile = 'SNKWave.worklet.js';
  protected readonly processorName = 'snkwave-processor';

  // SNKWave-specific state

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

  protected writeWavetableSelect(index: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setWaveform',
      value: index,
    });
  }

  // ===========================================================================
  // SNKWave-Specific Methods
  // ===========================================================================

  /** Set output volume (0-1) */
  setVolume(value: number): void {
    this.sendMessage('setVolume', value);
  }

  /** Set waveform preset (0-7). Use SNKWavePreset constants. */
  setWaveform(value: number): void {
    this.writeWavetableSelect(value);
  }

  /**
   * Set a custom waveform (4 bytes, each containing two 3-bit samples).
   * Byte format: high nibble bits 6-4 = sample A (0-7), low bits 2-0 = sample B (0-7)
   * The 8 forward samples are automatically mirrored for ping-pong playback.
   */
  setCustomWaveform(b0: number, b1: number, b2: number, b3: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setCustomWaveform',
      b0, b1, b2, b3,
    });
  }

  /** Write a value to an SNKWave register (0-5) */
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

  /** Load a preset waveform by program number (0-7) */
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
      volume: SNKWaveParam.VOLUME,
      waveform: SNKWaveParam.WAVEFORM,
      stereo_width: SNKWaveParam.STEREO_WIDTH,
      detune: SNKWaveParam.DETUNE,
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

export default SNKWaveSynth;
