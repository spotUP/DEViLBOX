
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';

/**
 * TMS36XX Parameter IDs (matching C++ enum)
 */
const TMS36XXParam = {
  VOLUME: 0,
  STOP_ENABLE: 1,
  DECAY_RATE: 2,
  OCTAVE: 3,
  STEREO_WIDTH: 4,
  DETUNE: 5,
} as const;

/**
 * Organ registration presets
 */
export const TMS36XXPreset = {
  FULL_ORGAN: 0,
  FLUTE_8: 1,
  PRINCIPAL: 2,
  MIXTURE: 3,
  FOUNDATION: 4,
  BRIGHT: 5,
  DIAPASON: 6,
  PERCUSSIVE: 7,
} as const;

/**
 * TMS36XX Organ Stop Flags (for stop enable mask)
 */
export const TMS36XXStop = {
  STOP_16: 0x01,    // 16' (fundamental)
  STOP_8: 0x02,     // 8' (octave)
  STOP_5_13: 0x04,  // 5 1/3' (twelfth)
  STOP_4: 0x08,     // 4' (fifteenth)
  STOP_2_23: 0x10,  // 2 2/3' (seventeenth)
  STOP_2: 0x20,     // 2' (nineteenth)
  ALL: 0x3F,
} as const;

/**
 * TMS36XX (TMS3615/TMS3617) Tone Matrix Synthesizer - WASM
 *
 * Based on MAME emulator by Juergen Buchmueller
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The TMS36XX family are organ-like tone generator ICs producing
 * square waves at musical intervals (organ "feet"):
 *   16' (1x), 8' (2x), 5 1/3' (3x), 4' (4x), 2 2/3' (6x), 2' (8x)
 *
 * Features:
 * - 6-note polyphony (each with 6 organ stop harmonics)
 * - 8 organ registration presets
 * - Configurable stop enable mask
 * - Per-stop decay rates
 * - Stereo output with voice panning
 *
 * Used in: Phoenix, Naughty Boy, Pleiads, Monster Bash
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class TMS36XXSynth extends MAMEBaseSynth {
  readonly name = 'TMS36XXSynth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'TMS36XX';
  protected readonly workletFile = 'TMS36XX.worklet.js';
  protected readonly processorName = 'tms36xx-processor';

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
  // TMS36XX-Specific Methods
  // ===========================================================================

  /** Set output volume (0-1) */
  setVolume(value: number): void {
    this.sendMessage('setVolume', value);
  }

  /** Set organ stop enable mask (6-bit, use TMS36XXStop constants) */
  setStopEnable(mask: number): void {
    this.sendMessage('setStopEnable', mask);
  }

  /** Set octave shift (-2 to +2) */
  setOctave(octave: number): void {
    this.sendMessage('setOctave', octave);
  }

  /** Set decay rate multiplier */
  setDecayRate(value: number): void {
    this.setParameterById(TMS36XXParam.DECAY_RATE, value);
  }

  /** Set per-stop detune amount (0-1) */
  setDetune(value: number): void {
    this.setParameterById(TMS36XXParam.DETUNE, value);
  }

  /** Write a register value */
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

  /** Load an organ registration preset (0-7) */
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
      volume: TMS36XXParam.VOLUME,
      stop_enable: TMS36XXParam.STOP_ENABLE,
      decay_rate: TMS36XXParam.DECAY_RATE,
      octave: TMS36XXParam.OCTAVE,
      stereo_width: TMS36XXParam.STEREO_WIDTH,
      detune: TMS36XXParam.DETUNE,
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

export default TMS36XXSynth;
