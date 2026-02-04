import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

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
  // opIndex 1-4, so param 110 = op1 TL, 210 = op2 TL, etc.
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
 */
export class YMOPQSynth extends Tone.ToneAudioNode {
  readonly name = 'YMOPQSynth';
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
      await YMOPQSynth.ensureInitialized(context);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[YMOPQ] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!this.isWorkletLoaded) {
        try {
          await context.audioWorklet.addModule(`${baseUrl}mame/YMOPQ.worklet.js`);
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

    this.workletNode = toneCreateAudioWorkletNode(rawContext, 'ymopq-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: rawContext.sampleRate,
      },
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[YMOPQ] WASM node ready');
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: rawContext.sampleRate,
    });

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
    this.workletNode.port.postMessage({ type: 'noteOff', note: 0 });
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
  // Parameter interface
  // ========================================================================

  private setParameterById(paramId: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setParameter', paramId, value });
  }

  setParam(param: string, value: number): void {
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

  /**
   * Set a per-operator parameter.
   * @param opIndex - Operator index (1-4)
   * @param param - Parameter name
   * @param value - Parameter value
   */
  setOperatorParam(opIndex: number, param: string, value: number): void {
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

  // ========================================================================
  // Convenience setters
  // ========================================================================

  /** Set FM algorithm (0-7). Use YMOPQAlgorithm constants. */
  setAlgorithm(value: number): void {
    this.sendMessage('setAlgorithm', value);
  }

  /** Set operator 1 feedback level (0-7) */
  setFeedback(value: number): void {
    this.sendMessage('setFeedback', value);
  }

  /** Set LFO rate (0-7, ~4Hz to ~47Hz) */
  setLFORate(value: number): void {
    this.sendMessage('setLFORate', value);
  }

  /** Set output volume (0-1) */
  setVolume(value: number): void {
    this.sendMessage('setVolume', value);
  }

  // ========================================================================
  // Register-level access (for hardware-accurate use)
  // ========================================================================

  /** Write a value to a YM3806 register */
  writeRegister(offset: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'writeRegister', offset, value });
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

  /** Load a preset patch by program number (0-7) */
  loadPreset(program: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'programChange', program });
  }

  // ========================================================================
  // Internal
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

export default YMOPQSynth;
