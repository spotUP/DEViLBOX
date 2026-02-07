
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';

/**
 * CEM3394 Parameter IDs (matching C++ enum)
 */
const CEM3394Param = {
  VCO_FREQUENCY: 0,
  MODULATION_AMOUNT: 1,
  WAVE_SELECT: 2,
  PULSE_WIDTH: 3,
  MIXER_BALANCE: 4,
  FILTER_RESONANCE: 5,
  FILTER_FREQUENCY: 6,
  FINAL_GAIN: 7
} as const;

// Waveform flags
const CEM3394Wave = {
  TRIANGLE: 1,
  SAWTOOTH: 2,
  PULSE: 4
} as const;

/**
 * CEM3394 Synthesizer - Curtis Electromusic Analog Voice (WASM)
 *
 * Based on MAME's CEM3394 emulator by Aaron Giles
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The CEM3394 (1984) is a complete analog synth voice chip used in:
 * - Sequential Circuits Prophet VS, Matrix-6, Prelude
 * - Ensoniq ESQ-1, SQ-80
 * - Oberheim Matrix-1000
 *
 * Features:
 * - VCO with Triangle, Sawtooth, and Pulse waveforms
 * - Resonant lowpass VCF with state-variable filter
 * - VCA with exponential response
 * - Filter FM from VCO (modulation)
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class CEM3394Synth extends MAMEBaseSynth {
  readonly name = 'CEM3394Synth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'CEM3394';
  protected readonly workletFile = 'CEM3394.worklet.js';
  protected readonly processorName = 'cem3394-processor';

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
    this.workletNode.port.postMessage({
      type: 'noteOff',
      note: 0,
    });
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
  // CEM3394-Specific Methods
  // ===========================================================================

  setCutoff(hz: number): void {
    this.setParameterById(CEM3394Param.FILTER_FREQUENCY, hz);
  }

  setResonance(val: number): void {
    this.setParameterById(CEM3394Param.FILTER_RESONANCE, val);
  }

  setFilterModulation(val: number): void {
    this.setParameterById(CEM3394Param.MODULATION_AMOUNT, val);
  }

  setPulseWidth(val: number): void {
    this.setParameterById(CEM3394Param.PULSE_WIDTH, val);
  }

  setWaveform(waves: number | string): void {
    let val = CEM3394Wave.SAWTOOTH | CEM3394Wave.PULSE;
    if (typeof waves === 'string') {
      switch (waves.toLowerCase()) {
        case 'triangle': val = CEM3394Wave.TRIANGLE; break;
        case 'sawtooth': case 'saw': val = CEM3394Wave.SAWTOOTH; break;
        case 'pulse': case 'square': val = CEM3394Wave.PULSE; break;
        case 'all': val = CEM3394Wave.TRIANGLE | CEM3394Wave.SAWTOOTH | CEM3394Wave.PULSE; break;
      }
    } else {
      val = waves;
    }
    this.setParameterById(CEM3394Param.WAVE_SELECT, val);
  }

  setVolume(db: number): void {
    this.setParameterById(CEM3394Param.FINAL_GAIN, db);
  }

  // ===========================================================================
  // Parameter Interface
  // ===========================================================================

  private setParameterById(paramId: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setParameter',
      paramId,
      value,
    });
  }

  setParam(param: string, value: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'setParam', args: [param, value] });
      return;
    }
    const paramMap: Record<string, number> = {
      'vco_frequency': CEM3394Param.VCO_FREQUENCY,
      'modulation': CEM3394Param.MODULATION_AMOUNT,
      'wave_select': CEM3394Param.WAVE_SELECT,
      'pulse_width': CEM3394Param.PULSE_WIDTH,
      'mixer_balance': CEM3394Param.MIXER_BALANCE,
      'resonance': CEM3394Param.FILTER_RESONANCE,
      'cutoff': CEM3394Param.FILTER_FREQUENCY,
      'volume': CEM3394Param.FINAL_GAIN,
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }
}

export default CEM3394Synth;
