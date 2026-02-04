import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

/**
 * MEA8000 Parameter IDs (matching C++ enum)
 */
const MEA8000Param = {
  VOLUME: 0,
  NOISE_MODE: 1,
  F1_INDEX: 2,
  F2_INDEX: 3,
  F3_INDEX: 4,
  BW_INDEX: 5,
  AMPLITUDE: 6,
  STEREO_WIDTH: 7,
  INTERP_TIME: 8,
} as const;

/**
 * Vowel presets
 */
export const MEA8000Preset = {
  AH: 0,   // "father"
  EE: 1,   // "meet"
  IH: 2,   // "bit"
  OH: 3,   // "boat"
  OO: 4,   // "boot"
  AE: 5,   // "bat"
  UH: 6,   // "but"
  ER: 7,   // "bird"
} as const;

/**
 * Bandwidth settings
 */
export const MEA8000Bandwidth = {
  WIDE: 0,     // 726 Hz
  MEDIUM: 1,   // 309 Hz
  NARROW: 2,   // 125 Hz
  VERY_NARROW: 3, // 50 Hz
} as const;

/**
 * MEA8000 (Philips/Signetics) - 4-Formant Speech Synthesizer (WASM)
 *
 * Based on MAME emulator by Antoine Mine
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The MEA 8000 is a vocoder-style speech synthesis chip that generates
 * sound by passing an excitation signal (sawtooth or noise) through
 * a cascade of 4 second-order digital filters with programmable
 * frequency and bandwidth.
 *
 * Features:
 * - 4-voice polyphony (4 independent MEA8000 engines)
 * - 4 cascade formant filters (F1-F4)
 * - Sawtooth or noise excitation
 * - 8 vowel presets (AH, EE, IH, OH, OO, AE, UH, ER)
 * - Real-time F1/F2/F3 control with smooth interpolation
 * - 4 bandwidth settings (wide to very narrow)
 * - Internal 8kHz processing rate (authentic)
 *
 * Used in: Thomson MO5/TO7, Amstrad CPC, Oric (French speech extensions)
 */
export class MEA8000Synth extends Tone.ToneAudioNode {
  readonly name = 'MEA8000Synth';
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
      await MEA8000Synth.ensureInitialized(context);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[MEA8000] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!this.isWorkletLoaded) {
        try {
          await context.audioWorklet.addModule(`${baseUrl}mame/MEA8000.worklet.js`);
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

    this.workletNode = toneCreateAudioWorkletNode(rawContext, 'mea8000-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: rawContext.sampleRate,
      },
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[MEA8000] WASM node ready');
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
      volume: MEA8000Param.VOLUME,
      noise_mode: MEA8000Param.NOISE_MODE,
      f1_index: MEA8000Param.F1_INDEX,
      f2_index: MEA8000Param.F2_INDEX,
      f3_index: MEA8000Param.F3_INDEX,
      bw_index: MEA8000Param.BW_INDEX,
      amplitude: MEA8000Param.AMPLITUDE,
      stereo_width: MEA8000Param.STEREO_WIDTH,
      interp_time: MEA8000Param.INTERP_TIME,
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  // ========================================================================
  // Convenience setters
  // ========================================================================

  /** Set output volume (0-1) */
  setVolume(value: number): void {
    this.sendMessage('setVolume', value);
  }

  /** Set formant frequencies by table indices.
   * f1: 0-31 (150-1047 Hz), f2: 0-31 (440-3400 Hz), f3: 0-7 (1179-3400 Hz) */
  setFormants(f1: number, f2: number, f3: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setFormants', f1, f2, f3 });
  }

  /** Set noise mode (true=noise excitation, false=sawtooth voiced) */
  setNoiseMode(noise: boolean): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setNoiseMode', value: noise });
  }

  /** Set filter bandwidth (0-3, use MEA8000Bandwidth constants) */
  setBandwidth(bwIndex: number): void {
    this.setParameterById(MEA8000Param.BW_INDEX, bwIndex);
  }

  /** Set interpolation time multiplier (0.1-10.0) */
  setInterpTime(value: number): void {
    this.setParameterById(MEA8000Param.INTERP_TIME, value);
  }

  // ========================================================================
  // Hardware-level access
  // ========================================================================

  /** Write a register value (0=F1, 1=F2, 2=F3, 3=BW) */
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

  /** Load a vowel preset (0-7). Use MEA8000Preset constants. */
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

export default MEA8000Synth;
