import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { freqToYMOPQ } from '@engine/mame/MAMEPitchUtils';

/**
 * YMOPQ Parameter IDs (matching C++ enum)
 */
const YMOPQParam = {
  ALGORITHM: 0,
  FEEDBACK: 1,
  LFO_RATE: 2,
  LFO_PM_SENS: 3,
  LFO_AM_SENS: 4,
  REVERB: 5,
  VOLUME: 6,
  // Per-operator params: base + opIndex * 100
  OP_TOTAL_LEVEL: 10,
  OP_ATTACK_RATE: 11,
  OP_DECAY_RATE: 12,
  OP_SUSTAIN_RATE: 13,
  OP_SUSTAIN_LEVEL: 14,
  OP_RELEASE_RATE: 15,
  OP_MULTIPLE: 16,
  OP_DETUNE: 17,
  OP_WAVEFORM: 18,
  OP_KSR: 19,
  OP_AM_ENABLE: 20,
} as const;

/**
 * FM Algorithm constants (operator connection topologies)
 */
export const YMOPQAlgorithm = {
  ALG_0: 0, // 1->2->3->4->out (serial)
  ALG_1: 1, // (1+2)->3->4->out
  ALG_2: 2, // (1+(2->3))->4->out
  ALG_3: 3, // ((1->2)+3)->4->out
  ALG_4: 4, // ((1->2)+(3->4))->out (dual serial)
  ALG_5: 5, // ((1->2)+(1->3)+(1->4))->out (branching)
  ALG_6: 6, // ((1->2)+3+4)->out
  ALG_7: 7, // (1+2+3+4)->out (all carriers)
} as const;

/**
 * Preset names
 */
export const YMOPQPreset = {
  E_PIANO: 0,
  BRASS: 1,
  STRINGS: 2,
  BASS: 3,
  ORGAN: 4,
  LEAD: 5,
  PAD: 6,
  BELL: 7,
} as const;

/**
 * YMOPQ Synthesizer - Yamaha YM3806 4-Operator FM (WASM)
 *
 * Based on Aaron Giles' ymfm library (BSD-3-Clause)
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The YM3806 (OPQ, ~1985) is a 4-operator FM synthesizer that
 * combines features from the OPM (DX21/TX81Z) and OPN (YM2612) families.
 * Used in Yamaha PSR-70 and related keyboards.
 *
 * Features:
 * - 8 polyphonic FM channels with 4 operators each
 * - 8 FM algorithms (standard Yamaha topology set)
 * - 7 feedback levels for operator 1
 * - 2 waveforms per operator (sine, half-sine)
 * - LFO with AM/PM modulation
 * - Faux reverb envelope stage
 * - Per-channel stereo panning (L/R)
 * - 6-bit detune range (wider than other FM chips)
 * - 8 built-in presets: E.Piano, Brass, Strings, Bass, Organ, Lead, Pad, Bell
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, pitch, panning, FM params)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Per-operator control (TL, AR, DR, SR, RR, MULT, DT)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class YMOPQSynth extends MAMEBaseSynth {
  readonly name = 'YMOPQSynth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'YMOPQ';
  protected readonly workletFile = 'YMOPQ.worklet.js';
  protected readonly processorName = 'ymopq-processor';

  // YMOPQ-specific state
  private currentChannel: number = 0;
  private currentAlgorithm: number = 0;

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
      channel: this.currentChannel,
    });
  }

  protected writeKeyOff(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'noteOff',
      note: 0,
      channel: this.currentChannel,
    });
  }

  protected writeFrequency(freq: number): void {
    if (!this.workletNode || this._disposed) return;

    const pitch = freqToYMOPQ(freq);

    this.workletNode.port.postMessage({
      type: 'setFrequency',
      kc: pitch.kc,
      kf: pitch.kf,
      channel: this.currentChannel,
    });
  }

  protected writeVolume(volume: number): void {
    if (!this.workletNode || this._disposed) return;

    // Apply to carrier operators based on algorithm
    const carriers = this.getCarrierOperators();

    // TL: 0 = max, 127 = min
    const tl = Math.round((1 - volume) * 127);

    for (const op of carriers) {
      this.workletNode.port.postMessage({
        type: 'setOperatorParam',
        channel: this.currentChannel,
        op,
        param: 'tl',
        value: tl,
      });
    }
  }

  protected writePanning(pan: number): void {
    if (!this.workletNode || this._disposed) return;

    // YMOPQ has L/R enable bits
    this.workletNode.port.postMessage({
      type: 'setPanning',
      pan,
      channel: this.currentChannel,
    });
  }

  /**
   * Get carrier operators based on algorithm
   */
  private getCarrierOperators(): number[] {
    const carrierMaps: Record<number, number[]> = {
      0: [3],           // Serial: only OP4 outputs
      1: [3],
      2: [3],
      3: [3],
      4: [1, 3],        // Dual serial: OP2 and OP4
      5: [1, 2, 3],     // Branching
      6: [1, 2, 3],
      7: [0, 1, 2, 3],  // All operators output
    };
    return carrierMaps[this.currentAlgorithm] || [3];
  }

  // ===========================================================================
  // FM-Specific Override Methods
  // ===========================================================================

  protected setFMAlgorithm(alg: number): void {
    this.currentAlgorithm = alg;
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setAlgorithm',
      value: alg,
    });
  }

  protected setFMFeedback(fb: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setFeedback',
      value: fb,
    });
  }

  protected setFMSensitivity(fms: number): void {
    if (!this.workletNode || this._disposed) return;
    this.setParameterById(YMOPQParam.LFO_PM_SENS, fms / 7.0);
  }

  protected setAMSensitivity(ams: number): void {
    if (!this.workletNode || this._disposed) return;
    this.setParameterById(YMOPQParam.LFO_AM_SENS, ams / 3.0);
  }

  // ===========================================================================
  // Per-Operator Control
  // ===========================================================================

  setOperatorTL(op: number, tl: number): void {
    if (!this.workletNode || this._disposed) return;
    this.setParameterById((op + 1) * 100 + YMOPQParam.OP_TOTAL_LEVEL, tl / 127);
  }

  setOperatorAR(op: number, ar: number): void {
    if (!this.workletNode || this._disposed) return;
    this.setParameterById((op + 1) * 100 + YMOPQParam.OP_ATTACK_RATE, ar / 31);
  }

  setOperatorDR(op: number, dr: number): void {
    if (!this.workletNode || this._disposed) return;
    this.setParameterById((op + 1) * 100 + YMOPQParam.OP_DECAY_RATE, dr / 31);
  }

  setOperatorSL(op: number, sl: number): void {
    if (!this.workletNode || this._disposed) return;
    this.setParameterById((op + 1) * 100 + YMOPQParam.OP_SUSTAIN_LEVEL, sl / 15);
  }

  setOperatorRR(op: number, rr: number): void {
    if (!this.workletNode || this._disposed) return;
    this.setParameterById((op + 1) * 100 + YMOPQParam.OP_RELEASE_RATE, rr / 15);
  }

  setOperatorMult(op: number, mult: number): void {
    if (!this.workletNode || this._disposed) return;
    this.setParameterById((op + 1) * 100 + YMOPQParam.OP_MULTIPLE, mult / 15);
  }

  setOperatorDetune(op: number, dt: number): void {
    if (!this.workletNode || this._disposed) return;
    this.setParameterById((op + 1) * 100 + YMOPQParam.OP_DETUNE, dt / 7);
  }

  // ===========================================================================
  // YMOPQ-Specific Methods
  // ===========================================================================

  setChannel(channel: number): void {
    this.currentChannel = Math.max(0, Math.min(7, channel));
  }

  setAlgorithm(value: number): void {
    this.setFMAlgorithm(value);
  }

  setFeedback(value: number): void {
    this.setFMFeedback(value);
  }

  setLFORate(value: number): void {
    this.sendMessage('setLFORate', value);
  }

  setVolume(value: number): void {
    this.sendMessage('setVolume', value);
  }

  /** Write a value to a YM3806 register */
  writeRegister(offset: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'writeRegister', offset, value });
  }

  controlChange(cc: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'controlChange', cc, value });
  }

  pitchBend(value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'pitchBend', value });
  }

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
    // Handle composite operator keys: op1_total_level, op2_attack_rate, etc.
    const opMatch = param.match(/^op(\d+)_(.+)$/);
    if (opMatch) {
      this.setOperatorParamByName(parseInt(opMatch[1]), opMatch[2], value);
      return;
    }

    const paramMap: Record<string, number> = {
      algorithm: YMOPQParam.ALGORITHM,
      feedback: YMOPQParam.FEEDBACK,
      lfo_rate: YMOPQParam.LFO_RATE,
      lfo_pm_sens: YMOPQParam.LFO_PM_SENS,
      lfo_am_sens: YMOPQParam.LFO_AM_SENS,
      reverb: YMOPQParam.REVERB,
      volume: YMOPQParam.VOLUME,
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  private setOperatorParamByName(opIndex: number, param: string, value: number): void {
    const opParamMap: Record<string, number> = {
      total_level: YMOPQParam.OP_TOTAL_LEVEL,
      attack_rate: YMOPQParam.OP_ATTACK_RATE,
      decay_rate: YMOPQParam.OP_DECAY_RATE,
      sustain_rate: YMOPQParam.OP_SUSTAIN_RATE,
      sustain_level: YMOPQParam.OP_SUSTAIN_LEVEL,
      release_rate: YMOPQParam.OP_RELEASE_RATE,
      multiple: YMOPQParam.OP_MULTIPLE,
      detune: YMOPQParam.OP_DETUNE,
      waveform: YMOPQParam.OP_WAVEFORM,
      ksr: YMOPQParam.OP_KSR,
      am_enable: YMOPQParam.OP_AM_ENABLE,
    };

    const baseParam = opParamMap[param];
    if (baseParam !== undefined && opIndex >= 1 && opIndex <= 4) {
      this.setParameterById(opIndex * 100 + baseParam, value);
    }
  }

  private sendMessage(type: string, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type, value });
  }
}

export default YMOPQSynth;
