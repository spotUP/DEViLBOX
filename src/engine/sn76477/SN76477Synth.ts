import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

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
 */
export class SN76477Synth extends Tone.ToneAudioNode {
  readonly name = 'SN76477Synth';
  readonly input: undefined;
  readonly output: Tone.Gain;

  private workletNode: AudioWorkletNode | null = null;
  private static isWorkletLoaded: boolean = false;
  private static initializationPromise: Promise<void> | null = null;

  public config: Record<string, unknown> = {};
  public audioContext: AudioContext;
  private _disposed: boolean = false;

  constructor() {
    super();
    this.audioContext = getNativeContext(this.context);
    this.output = new Tone.Gain(1);
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      const context = getNativeContext(this.context);
      await SN76477Synth.ensureInitialized(context);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[SN76477] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!this.isWorkletLoaded) {
        try {
          await context.audioWorklet.addModule(`${baseUrl}mame/SN76477.worklet.js`);
        } catch (_e) {
          // Module might already be added
        }
        this.isWorkletLoaded = true;
      }
    })();

    return this.initializationPromise;
  }

  private createNode(): void {
    if (this._disposed) return;

    const toneContext = this.context as any;
    const rawContext = toneContext.rawContext || toneContext._context;

    this.workletNode = toneCreateAudioWorkletNode(rawContext, 'sn76477-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: rawContext.sampleRate,
      },
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[SN76477] WASM node ready');
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: rawContext.sampleRate,
    });

    // Connect worklet to Tone.js output
    const targetNode = this.output.input as AudioNode;
    this.workletNode.connect(targetNode);

    // CRITICAL: Connect through silent keepalive to destination to force process() calls
    try {
      const keepalive = rawContext.createGain();
      keepalive.gain.value = 0;
      this.workletNode.connect(keepalive);
      keepalive.connect(rawContext.destination);
    } catch (_e) { /* keepalive failed */ }
  }

  // ========================================================================
  // MIDI-style note interface
  // ========================================================================

  triggerAttack(note: string | number, _time?: number, velocity: number = 1): void {
    if (!this.workletNode || this._disposed) return;

    const midiNote =
      typeof note === 'string'
        ? Tone.Frequency(note).toMidi()
        : Math.round(12 * Math.log2(note / 440) + 69);

    this.workletNode.port.postMessage({
      type: 'noteOn',
      note: midiNote,
      velocity: Math.floor(velocity * 127),
    });
  }

  triggerRelease(_time?: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'noteOff',
      note: 0,
    });
  }

  releaseAll(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'allNotesOff' });
  }

  triggerAttackRelease(
    note: string | number,
    duration: string | number,
    time?: number,
    velocity?: number
  ): void {
    if (this._disposed) return;
    this.triggerAttack(note, time, velocity || 1);

    const d = Tone.Time(duration).toSeconds();
    setTimeout(() => {
      if (!this._disposed) {
        this.triggerRelease();
      }
    }, d * 1000);
  }

  // ========================================================================
  // Generic parameter interface
  // ========================================================================

  private setParameterById(paramId: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setParameter',
      paramId,
      value,
    });
  }

  setParam(param: string, value: number): void {
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

  // ========================================================================
  // Musician-friendly convenience setters
  // ========================================================================

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

  // ========================================================================
  // Raw analog parameter setters (for hardware-accurate control)
  // Values in Ohms (resistors) and Farads (capacitors)
  // ========================================================================

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

  // ========================================================================
  // Preset sounds (classic arcade effects)
  // ========================================================================

  /** Load a preset: 0=UFO, 1=Laser, 2=Explosion, 3=Siren, 4=Engine */
  loadPreset(program: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'programChange', program });
  }

  // ========================================================================
  // MIDI CC and pitch bend
  // ========================================================================

  controlChange(cc: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'controlChange', cc, value });
  }

  pitchBend(value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'pitchBend', value });
  }

  // ========================================================================
  // Static helper: convert common units
  // ========================================================================

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

  // ========================================================================
  // Internal helpers
  // ========================================================================

  private sendMessage(type: string, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type, value });
  }

  dispose(): this {
    this._disposed = true;
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'dispose' });
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.output.dispose();
    super.dispose();
    return this;
  }
}

export default SN76477Synth;
