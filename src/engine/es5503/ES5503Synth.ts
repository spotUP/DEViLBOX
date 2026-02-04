import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

/**
 * ES5503 Parameter IDs (matching C++ enum)
 */
const ES5503Param = {
  WAVEFORM: 0,
  WAVE_SIZE: 1,
  RESOLUTION: 2,
  OSC_MODE: 3,
  VOLUME: 4,
  NUM_OSCILLATORS: 5,
  ATTACK_TIME: 6,
  RELEASE_TIME: 7,
} as const;

/**
 * Built-in waveform indices
 */
export const ES5503Waveform = {
  SINE: 0,
  SAWTOOTH: 1,
  SQUARE: 2,
  TRIANGLE: 3,
  NOISE: 4,
  PULSE_25: 5,
  PULSE_12: 6,
  ORGAN: 7,
} as const;

/**
 * Wave table size options (number of samples)
 */
export const ES5503WaveSize = {
  SIZE_256: 0,
  SIZE_512: 1,
  SIZE_1024: 2,
  SIZE_2048: 3,
  SIZE_4096: 4,
  SIZE_8192: 5,
  SIZE_16384: 6,
  SIZE_32768: 7,
} as const;

/**
 * Oscillator modes
 */
export const ES5503OscMode = {
  FREE_RUN: 0,   // Loop continuously
  ONE_SHOT: 1,   // Play once and stop
  SYNC_AM: 2,    // Sync/AM with partner oscillator
  SWAP: 3,       // Switch to partner when done
} as const;

/**
 * ES5503 Synthesizer - Ensoniq DOC 32-Voice Wavetable (WASM)
 *
 * Based on MAME's ES5503 emulator v2.4 by R. Belmont
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The ES5503 (1986) was designed by Bob Yannes (creator of the C64 SID chip).
 * It's a 32-voice wavetable synthesizer used in:
 * - Apple IIgs (main sound chip)
 * - Ensoniq Mirage (first affordable pro sampler)
 * - Ensoniq ESQ-1/SQ-80 synthesizers
 *
 * Features:
 * - 32 independent oscillators with wavetable playback
 * - 128KB wave memory with 8 built-in waveforms
 * - Variable wave table sizes (256 to 32768 samples)
 * - 4 oscillator modes (Free-run, One-shot, Sync/AM, Swap)
 * - Per-oscillator volume (8-bit)
 * - Paired oscillator interactions for sync and AM
 * - Custom wave data loading for sample-based synthesis
 */
export class ES5503Synth extends Tone.ToneAudioNode {
  readonly name = 'ES5503Synth';
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
      await ES5503Synth.ensureInitialized(context);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[ES5503] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!this.isWorkletLoaded) {
        try {
          await context.audioWorklet.addModule(`${baseUrl}mame/ES5503.worklet.js`);
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

    this.workletNode = toneCreateAudioWorkletNode(rawContext, 'es5503-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: rawContext.sampleRate,
      },
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[ES5503] WASM node ready');
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
      waveform: ES5503Param.WAVEFORM,
      wave_size: ES5503Param.WAVE_SIZE,
      resolution: ES5503Param.RESOLUTION,
      osc_mode: ES5503Param.OSC_MODE,
      volume: ES5503Param.VOLUME,
      num_oscillators: ES5503Param.NUM_OSCILLATORS,
      attack_time: ES5503Param.ATTACK_TIME,
      release_time: ES5503Param.RELEASE_TIME,
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  // ========================================================================
  // Convenience setters
  // ========================================================================

  /** Select built-in waveform (0-7). Use ES5503Waveform constants. */
  setWaveform(index: number): void {
    this.sendMessage('setWaveform', index);
  }

  /** Set wave table size (0-7). Use ES5503WaveSize constants. */
  setWaveSize(index: number): void {
    this.sendMessage('setWaveSize', index);
  }

  /** Set resolution (0-7, affects frequency precision) */
  setResolution(index: number): void {
    this.sendMessage('setResolution', index);
  }

  /** Set attack time in seconds */
  setAttackTime(seconds: number): void {
    this.sendMessage('setAttackTime', seconds);
  }

  /** Set release time in seconds */
  setReleaseTime(seconds: number): void {
    this.sendMessage('setReleaseTime', seconds);
  }

  /** Set output amplitude (0-1) */
  setAmplitude(amp: number): void {
    this.sendMessage('setAmplitude', amp);
  }

  /** Set number of enabled oscillators (1-32). More oscillators = lower per-oscillator sample rate. */
  setNumOscillators(num: number): void {
    this.sendMessage('setNumOscillators', num);
  }

  // ========================================================================
  // Wave data loading
  // ========================================================================

  /**
   * Load custom wave data into the ES5503's wave memory.
   * Data should be Uint8Array of unsigned 8-bit samples (0x80 = center).
   * Note: 0x00 is reserved as the end-of-sample marker.
   *
   * @param data - Unsigned 8-bit sample data
   * @param offset - Byte offset in wave memory (0-131071)
   */
  loadWaveData(data: Uint8Array, offset: number = 0): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'loadWaveData',
      waveData: data.buffer,
      offset,
    });
  }

  /**
   * Load wave data into a specific page (256-byte boundary).
   * Pages 0-7 contain built-in waveforms by default.
   * Use pages 8+ for custom wave data.
   */
  loadWavePage(data: Uint8Array, page: number): void {
    this.loadWaveData(data.slice(0, 256), page * 256);
  }

  // ========================================================================
  // Register-level access (for advanced/hardware-accurate use)
  // ========================================================================

  /** Write a value to an ES5503 register */
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

  /** Select preset waveform via program change */
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

export default ES5503Synth;
