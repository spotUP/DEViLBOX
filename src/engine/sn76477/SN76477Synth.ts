
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';

/**
 * SN76477 Parameter IDs (matching C++ enum)
 */
const SN76477Param = {
  VCO_FREQ: 0,
  SLF_FREQ: 1,
  NOISE_FREQ: 2,
  VCO_DUTY_CYCLE: 3,
  MIXER_MODE: 4,
  ENVELOPE_MODE: 5,
  ATTACK_TIME: 6,
  DECAY_TIME: 7,
  ONE_SHOT_TIME: 8,
  NOISE_FILTER_FREQ: 9,
  AMPLITUDE: 10,
  VCO_MODE: 11,
  ENABLE: 12,
} as const;

/**
 * Mixer mode names (pins 25-27, active low)
 */
export const SN76477MixerMode = {
  VCO: 0,
  SLF: 1,
  NOISE: 2,
  VCO_NOISE: 3,
  SLF_NOISE: 4,
  SLF_VCO_NOISE: 5,
  SLF_VCO: 6,
  INHIBIT: 7,
} as const;

/**
 * Envelope mode names (pins 1, 28)
 */
export const SN76477EnvelopeMode = {
  VCO: 0,
  ONE_SHOT: 1,
  MIXER_ONLY: 2,
  VCO_ALT_POLARITY: 3,
} as const;

/**
 * SN76477 Synthesizer - TI Complex Sound Generator (WASM)
 *
 * Based on MAME's SN76477 emulator by Zsolt Vasvari / Derrick Renaud
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The SN76477 (1978) is a purely analog sound effects generator used in:
 * - Space Invaders (Taito/Midway) - the iconic UFO and laser sounds
 * - Sheriff, Balloon Bomber, Space Fever
 * - Many late-70s/early-80s arcade games
 *
 * Unlike digital synthesizers, the SN76477 is controlled by analog
 * component values (resistors, capacitors, voltages). This implementation
 * provides both raw analog control and musician-friendly parameter setters.
 *
 * Features:
 * - VCO (Voltage Controlled Oscillator) with variable duty cycle
 * - SLF (Super Low Frequency) triangle wave oscillator for modulation
 * - Noise generator (31-bit LFSR) with analog filter
 * - One-shot timer for triggered sounds
 * - Attack/Decay envelope
 * - 8 mixer modes combining VCO, SLF, and Noise
 * - 4 envelope modes (VCO, One-Shot, Mixer Only, VCO Alt)
 * - All formulas derived from real hardware measurements
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class SN76477Synth extends MAMEBaseSynth {
  readonly name = 'SN76477Synth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'SN76477';
  protected readonly workletFile = 'SN76477.worklet.js';
  protected readonly processorName = 'sn76477-processor';

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
  // SN76477-Specific Methods (Musician-friendly)
  // ===========================================================================

  /** Set VCO frequency in Hz */
  setVCOFreq(hz: number): void {
    this.sendMessage('setVCOFreq', hz);
  }

  /** Set SLF (Super Low Frequency) oscillator frequency in Hz */
  setSLFFreq(hz: number): void {
    this.sendMessage('setSLFFreq', hz);
  }

  /** Set noise generator frequency in Hz */
  setNoiseFreq(hz: number): void {
    this.sendMessage('setNoiseFreq', hz);
  }

  /** Set VCO duty cycle (0.18 to 1.0, where 0.5 = square wave) */
  setVCODutyCycle(duty: number): void {
    this.sendMessage('setVCODutyCycle', duty);
  }

  /** Set mixer mode (0-7). Use SN76477MixerMode constants. */
  setMixerMode(mode: number): void {
    this.sendMessage('setMixerMode', mode);
  }

  /** Set envelope mode (0-3). Use SN76477EnvelopeMode constants. */
  setEnvelopeMode(mode: number): void {
    this.sendMessage('setEnvelopeMode', mode);
  }

  /** Set attack time in seconds */
  setAttackTime(seconds: number): void {
    this.sendMessage('setAttackTime', seconds);
  }

  /** Set decay time in seconds */
  setDecayTime(seconds: number): void {
    this.sendMessage('setDecayTime', seconds);
  }

  /** Set one-shot duration in seconds */
  setOneShotTime(seconds: number): void {
    this.sendMessage('setOneShotTime', seconds);
  }

  /** Set noise filter frequency in Hz */
  setNoiseFilterFreq(hz: number): void {
    this.sendMessage('setNoiseFilterFreq', hz);
  }

  /** Set output amplitude (0-1) */
  setAmplitude(amp: number): void {
    this.sendMessage('setAmplitude', amp);
  }

  /** Set VCO mode: 0 = external voltage control, 1 = SLF modulates VCO */
  setVCOMode(mode: number): void {
    this.sendMessage('setVCOMode', mode);
  }

  /** Set enable: 0 = enabled (active low!), 1 = disabled */
  setChipEnable(enabled: boolean): void {
    this.sendMessage('setEnable', enabled ? 0 : 1);
  }

  // ===========================================================================
  // Raw analog parameter setters (for hardware-accurate control)
  // Values in Ohms (resistors) and Farads (capacitors)
  // ===========================================================================

  /** Set VCO resistor value in Ohms */
  setVCORes(ohms: number): void {
    this.sendMessage('setVCORes', ohms);
  }

  /** Set VCO capacitor value in Farads */
  setVCOCap(farads: number): void {
    this.sendMessage('setVCOCap', farads);
  }

  /** Set VCO external voltage (0-5V) */
  setVCOVoltage(volts: number): void {
    this.sendMessage('setVCOVoltage', volts);
  }

  /** Set pitch voltage (0-5V, affects VCO duty cycle) */
  setPitchVoltage(volts: number): void {
    this.sendMessage('setPitchVoltage', volts);
  }

  // ===========================================================================
  // Preset sounds (classic arcade effects)
  // ===========================================================================

  /** Load a preset: 0=UFO, 1=Laser, 2=Explosion, 3=Siren, 4=Engine */
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
  // Static helper: convert common units
  // ===========================================================================

  /** Convert kOhms to Ohms */
  static RES_K(kohms: number): number {
    return kohms * 1e3;
  }

  /** Convert MOhms to Ohms */
  static RES_M(mohms: number): number {
    return mohms * 1e6;
  }

  /** Convert microFarads to Farads */
  static CAP_U(uf: number): number {
    return uf * 1e-6;
  }

  /** Convert nanoFarads to Farads */
  static CAP_N(nf: number): number {
    return nf * 1e-9;
  }

  /** Convert picoFarads to Farads */
  static CAP_P(pf: number): number {
    return pf * 1e-12;
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
      vco_freq: SN76477Param.VCO_FREQ,
      slf_freq: SN76477Param.SLF_FREQ,
      noise_freq: SN76477Param.NOISE_FREQ,
      vco_duty_cycle: SN76477Param.VCO_DUTY_CYCLE,
      mixer_mode: SN76477Param.MIXER_MODE,
      envelope_mode: SN76477Param.ENVELOPE_MODE,
      attack_time: SN76477Param.ATTACK_TIME,
      decay_time: SN76477Param.DECAY_TIME,
      one_shot_time: SN76477Param.ONE_SHOT_TIME,
      noise_filter_freq: SN76477Param.NOISE_FILTER_FREQ,
      amplitude: SN76477Param.AMPLITUDE,
      vco_mode: SN76477Param.VCO_MODE,
      enable: SN76477Param.ENABLE,
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

export default SN76477Synth;
