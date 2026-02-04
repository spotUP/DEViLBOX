import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

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
 */
export class SNKWaveSynth extends Tone.ToneAudioNode {
  readonly name = 'SNKWaveSynth';
  readonly input: undefined;
  readonly output: Tone.Gain;

  private workletNode: AudioWorkletNode | null = null;
  private static isWorkletLoaded: boolean = false;
  private static initializationPromise: Promise<void> | null = null;

  public config: Record<string, unknown> = {};
  public audioContext: AudioContext;
  private _disposed: boolean = false;
  private _initPromise!: Promise<void>;
  private _pendingCalls: Array<{ method: string; args: any[] }> = [];
  private _isReady = false;

  constructor() {
    super();
    this.audioContext = getNativeContext(this.context);
    this.output = new Tone.Gain(1);
    this._initPromise = this.initialize();
  }

  public async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      const context = getNativeContext(this.context);
      await SNKWaveSynth.ensureInitialized(context);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[SNKWave] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!this.isWorkletLoaded) {
        try {
          await context.audioWorklet.addModule(`${baseUrl}mame/SNKWave.worklet.js`);
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

    this.workletNode = toneCreateAudioWorkletNode(rawContext, 'snkwave-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: rawContext.sampleRate,
      },
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[SNKWave] WASM node ready');
        this._isReady = true;
        for (const call of this._pendingCalls) {
          if (call.method === 'setParam') this.setParam(call.args[0], call.args[1]);
          else if (call.method === 'loadPreset') this.loadPreset(call.args[0]);
        }
        this._pendingCalls = [];
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

  // ========================================================================
  // Convenience setters
  // ========================================================================

  /** Set output volume (0-1) */
  setVolume(value: number): void {
    this.sendMessage('setVolume', value);
  }

  /** Set waveform preset (0-7). Use SNKWavePreset constants. */
  setWaveform(value: number): void {
    this.sendMessage('setWaveform', value);
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

  // ========================================================================
  // Register-level access
  // ========================================================================

  /** Write a value to an SNKWave register (0-5) */
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

  /** Load a preset waveform by program number (0-7) */
  loadPreset(program: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'loadPreset', args: [program] });
      return;
    }
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

export default SNKWaveSynth;
