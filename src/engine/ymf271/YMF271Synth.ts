import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { freqToYMF271 } from '@engine/mame/MAMEPitchUtils';

/**
 * YMF271 Parameter IDs (matching C++ enum)
 */
const YMF271Param = {
  MASTER_VOLUME: 0,
  ALGORITHM: 1,
  FEEDBACK: 2,
  WAVEFORM: 3,
  TL: 4,          // Total Level
  AR: 5,          // Attack Rate
  D1R: 6,         // Decay 1 Rate
  D2R: 7,         // Decay 2 Rate
  RR: 8,          // Release Rate
  D1L: 9,         // Decay 1 Level
  MULTIPLE: 10,
  DETUNE: 11,
  LFO_FREQ: 12,
  LFO_WAVE: 13,
  PMS: 14,        // Pitch Modulation Sensitivity
  AMS: 15         // Amplitude Modulation Sensitivity
} as const;

// FM Algorithms (0-15)
const YMF271Algorithm = {
  ALG0: 0,   // S1->S3->S2->S4 (serial)
  ALG1: 1,
  ALG2: 2,
  ALG3: 3,
  ALG4: 4,
  ALG5: 5,
  ALG6: 6,
  ALG7: 7,
  ALG8: 8,
  ALG9: 9,
  ALG10: 10,
  ALG11: 11,
  ALG12: 12,
  ALG13: 13,
  ALG14: 14,
  ALG15: 15  // All carriers (parallel)
} as const;

// Waveforms
const YMF271Waveform = {
  SINE: 0,
  SINE_SQUARED: 1,
  SINE_RECTIFIED: 2,
  HALF_SINE: 3,
  DOUBLE_FREQ_HALF_SINE: 4,
  ABS_DOUBLE_FREQ_HALF_SINE: 5,
  DC: 6
} as const;

/**
 * YMF271 Synthesizer - Yamaha OPX 4-Operator FM (WASM)
 *
 * Based on MAME's YMF271 emulator by R. Belmont, O. Galibert, and hap
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The YMF271 is a 4-operator FM synthesizer used in:
 * - Various Jaleco arcade games
 * - Seta/Allumer arcade boards
 *
 * Features:
 * - 48 slots (12 groups × 4 operators)
 * - 4-operator FM synthesis with 16 algorithms
 * - 8 waveforms (sine, sine squared, half-sine, etc.)
 * - ADSR envelope (Attack, Decay1, Decay2, Release)
 * - LFO with pitch and amplitude modulation
 * - PCM playback mode
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, pitch, panning, FM params)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Per-operator control (TL, AR, DR, RR, MULT, DT)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class YMF271Synth extends MAMEBaseSynth {
  readonly name = 'YMF271Synth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'YMF271';
  protected readonly workletFile = 'YMF271.worklet.js';
  protected readonly processorName = 'ymf271-processor';

  // YMF271-specific state
  private currentGroup: number = 0;
  private currentAlgorithm: number = 0;

  constructor() {
    super();
    this.initSynth();
  }

  // ===========================================================================
  // MAMEBaseSynth Abstract Method Implementations
  // ===========================================================================

  /**
   * Write key-on to YMF271
   */
  protected writeKeyOn(note: number, velocity: number): void {
    if (!this.workletNode || this._disposed) return;

    this.workletNode.port.postMessage({
      type: 'noteOn',
      note,
      velocity: Math.floor(velocity * 127),
      group: this.currentGroup,
    });
  }

  /**
   * Write key-off to YMF271
   */
  protected writeKeyOff(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'noteOff',
      note: 0,
      group: this.currentGroup,
    });
  }

  /**
   * Write frequency to YMF271 using Block+Fnum
   */
  protected writeFrequency(freq: number): void {
    if (!this.workletNode || this._disposed) return;

    const pitch = freqToYMF271(freq);

    this.workletNode.port.postMessage({
      type: 'setFrequency',
      block: pitch.block,
      fnum: pitch.fnum,
      group: this.currentGroup,
    });
  }

  /**
   * Write volume to YMF271 (applies to carrier operators)
   */
  protected writeVolume(volume: number): void {
    if (!this.workletNode || this._disposed) return;

    // Get carrier operators for current algorithm
    const carriers = this.getCarrierOperators();

    // TL: 0 = max, 127 = min
    const tl = Math.round((1 - volume) * 127);

    for (const op of carriers) {
      this.workletNode.port.postMessage({
        type: 'setOperatorParam',
        group: this.currentGroup,
        op,
        param: 'tl',
        value: tl,
      });
    }
  }

  /**
   * Write panning to YMF271 (0-255, 128 = center)
   */
  protected writePanning(pan: number): void {
    if (!this.workletNode || this._disposed) return;

    // YMF271 uses L/R enable bits
    // For simplicity, map to balance
    this.workletNode.port.postMessage({
      type: 'setPanning',
      pan,
      group: this.currentGroup,
    });
  }

  /**
   * Get carrier operators based on algorithm
   */
  private getCarrierOperators(): number[] {
    // YMF271 algorithm carrier map (simplified)
    // Algorithm determines which operators output to DAC
    const carrierMaps: Record<number, number[]> = {
      0: [3],           // Serial: only OP4 outputs
      1: [2, 3],
      2: [2, 3],
      3: [1, 3],
      4: [1, 3],
      5: [0, 2, 3],
      6: [0, 2, 3],
      7: [0, 1, 2, 3],  // All operators output
      // 8-15 similar patterns
    };
    return carrierMaps[this.currentAlgorithm % 8] || [3];
  }

  // ===========================================================================
  // FM-Specific Override Methods
  // ===========================================================================

  /**
   * Set FM algorithm
   */
  protected setFMAlgorithm(alg: number): void {
    this.currentAlgorithm = alg;
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setParameter',
      paramId: YMF271Param.ALGORITHM,
      value: alg / 15.0,
    });
  }

  /**
   * Set FM feedback
   */
  protected setFMFeedback(fb: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setParameter',
      paramId: YMF271Param.FEEDBACK,
      value: fb / 7.0,
    });
  }

  /**
   * Set FM sensitivity (PMS)
   */
  protected setFMSensitivity(fms: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setParameter',
      paramId: YMF271Param.PMS,
      value: fms / 7.0,
    });
  }

  /**
   * Set AM sensitivity (AMS)
   */
  protected setAMSensitivity(ams: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setParameter',
      paramId: YMF271Param.AMS,
      value: ams / 3.0,
    });
  }

  // ===========================================================================
  // Per-Operator Control
  // ===========================================================================

  /**
   * Set operator Total Level
   */
  setOperatorTL(op: number, tl: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setOperatorParam',
      group: this.currentGroup,
      op,
      param: 'tl',
      value: tl,
    });
  }

  /**
   * Set operator Attack Rate
   */
  setOperatorAR(op: number, ar: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setOperatorParam',
      group: this.currentGroup,
      op,
      param: 'ar',
      value: ar,
    });
  }

  /**
   * Set operator Decay1 Rate
   */
  setOperatorDR(op: number, dr: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setOperatorParam',
      group: this.currentGroup,
      op,
      param: 'd1r',
      value: dr,
    });
  }

  /**
   * Set operator Decay2 Rate
   */
  setOperatorD2R(op: number, d2r: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setOperatorParam',
      group: this.currentGroup,
      op,
      param: 'd2r',
      value: d2r,
    });
  }

  /**
   * Set operator Release Rate
   */
  setOperatorRR(op: number, rr: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setOperatorParam',
      group: this.currentGroup,
      op,
      param: 'rr',
      value: rr,
    });
  }

  /**
   * Set operator Multiplier
   */
  setOperatorMult(op: number, mult: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setOperatorParam',
      group: this.currentGroup,
      op,
      param: 'mult',
      value: mult,
    });
  }

  /**
   * Set operator Detune
   */
  setOperatorDetune(op: number, dt: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setOperatorParam',
      group: this.currentGroup,
      op,
      param: 'dt',
      value: dt,
    });
  }

  /**
   * Set operator Waveform
   */
  setOperatorWaveform(op: number, wave: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setOperatorParam',
      group: this.currentGroup,
      op,
      param: 'waveform',
      value: wave,
    });
  }

  // ===========================================================================
  // YMF271-Specific Methods
  // ===========================================================================

  /**
   * Select which group to control
   */
  setGroup(group: number): void {
    this.currentGroup = Math.max(0, Math.min(11, group));
  }

  /**
   * Set LFO frequency
   */
  setLFOFrequency(freq: number): void {
    this.setParameterById(YMF271Param.LFO_FREQ, freq / 255.0);
  }

  /**
   * Set LFO waveform (0-3)
   */
  setLFOWaveform(wave: number): void {
    this.setParameterById(YMF271Param.LFO_WAVE, wave / 3.0);
  }

  // ===========================================================================
  // Parameter Interface
  // ===========================================================================

  private setParameterById(paramId: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setParameter',
      paramId,
      value
    });
  }

  setParam(param: string, value: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'setParam', args: [param, value] });
      return;
    }
    const paramMap: Record<string, number> = {
      'master_volume': YMF271Param.MASTER_VOLUME,
      'volume': YMF271Param.MASTER_VOLUME,
      'algorithm': YMF271Param.ALGORITHM,
      'feedback': YMF271Param.FEEDBACK,
      'waveform': YMF271Param.WAVEFORM,
      'tl': YMF271Param.TL,
      'total_level': YMF271Param.TL,
      'ar': YMF271Param.AR,
      'attack': YMF271Param.AR,
      'd1r': YMF271Param.D1R,
      'decay1': YMF271Param.D1R,
      'd2r': YMF271Param.D2R,
      'decay2': YMF271Param.D2R,
      'rr': YMF271Param.RR,
      'release': YMF271Param.RR,
      'd1l': YMF271Param.D1L,
      'decay1_level': YMF271Param.D1L,
      'multiple': YMF271Param.MULTIPLE,
      'detune': YMF271Param.DETUNE,
      'lfo_freq': YMF271Param.LFO_FREQ,
      'lfo_wave': YMF271Param.LFO_WAVE,
      'pms': YMF271Param.PMS,
      'ams': YMF271Param.AMS
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  // Convenience methods for FM parameters
  setAlgorithm(alg: number): void {
    this.setFMAlgorithm(alg);
  }

  setFeedback(fb: number): void {
    this.setFMFeedback(fb);
  }

  setWaveform(wave: number): void {
    this.setParameterById(YMF271Param.WAVEFORM, wave / 6.0);
  }

  setAttackRate(ar: number): void {
    this.setParameterById(YMF271Param.AR, ar / 31.0);
  }

  setDecay1Rate(d1r: number): void {
    this.setParameterById(YMF271Param.D1R, d1r / 31.0);
  }

  setDecay2Rate(d2r: number): void {
    this.setParameterById(YMF271Param.D2R, d2r / 31.0);
  }

  setReleaseRate(rr: number): void {
    this.setParameterById(YMF271Param.RR, rr / 15.0);
  }

  setTotalLevel(tl: number): void {
    this.setParameterById(YMF271Param.TL, tl / 127.0);
  }

  setMultiple(mul: number): void {
    this.setParameterById(YMF271Param.MULTIPLE, mul / 15.0);
  }

  setMasterVolume(val: number): void {
    this.setParameterById(YMF271Param.MASTER_VOLUME, val);
  }
}

// Export constants
export { YMF271Param, YMF271Algorithm, YMF271Waveform };

export default YMF271Synth;
