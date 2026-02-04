import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

/**
 * Astrocade Parameter IDs (matching C++ enum)
 */
const AstrocadeParam = {
  VOLUME: 0,
  VIBRATO_SPEED: 1,
  VIBRATO_DEPTH: 2,
  NOISE_AM: 3,
  NOISE_MOD: 4,
  NOISE_VOL: 5,
  MASTER_FREQ: 6,
  STEREO_WIDTH: 7,
} as const;

/**
 * Preset names
 */
export const AstrocadePreset = {
  CLEAN_SQUARE: 0,
  VIBRATO_SQUARE: 1,
  WIDE_VIBRATO: 2,
  FAST_VIBRATO: 3,
  NOISE_TONE: 4,
  NOISE_MODULATED: 5,
  ARCADE_SIREN: 6,
  PURE_NOISE: 7,
} as const;

/**
 * Astrocade Synthesizer - Bally Astrocade Custom I/O Sound Chip (WASM)
 *
 * Based on MAME emulator by Aaron Giles / Frank Palazzolo
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The Astrocade Custom I/O chip (~1977) is a sound generator used in
 * the Bally Astrocade console and arcade games like Gorf, Wizard of Wor,
 * and Robby Roto.
 *
 * Features:
 * - 3 square wave tone generators (A, B, C) with 4-bit volume each
 * - Master oscillator with configurable frequency
 * - Hardware vibrato with adjustable speed (4 rates) and depth (64 levels)
 * - 15-bit LFSR noise generator
 * - Noise can modulate master oscillator frequency (AM effect)
 * - Noise AM enable for amplitude modulation
 * - Adaptive frequency mapping for MIDI note input
 * - 8 built-in presets: Clean, Vibrato, Wide Vibrato, Fast Vibrato,
 *   Noise+Tone, Noise Mod, Arcade Siren, Pure Noise
 */
export class AstrocadeSynth extends Tone.ToneAudioNode {
  readonly name = 'AstrocadeSynth';
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
      await AstrocadeSynth.ensureInitialized(context);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[Astrocade] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!this.isWorkletLoaded) {
        try {
          await context.audioWorklet.addModule(`${baseUrl}mame/Astrocade.worklet.js`);
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

    this.workletNode = toneCreateAudioWorkletNode(rawContext, 'astrocade-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: rawContext.sampleRate,
      },
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[Astrocade] WASM node ready');
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
      volume: AstrocadeParam.VOLUME,
      vibrato_speed: AstrocadeParam.VIBRATO_SPEED,
      vibrato_depth: AstrocadeParam.VIBRATO_DEPTH,
      noise_am: AstrocadeParam.NOISE_AM,
      noise_mod: AstrocadeParam.NOISE_MOD,
      noise_vol: AstrocadeParam.NOISE_VOL,
      master_freq: AstrocadeParam.MASTER_FREQ,
      stereo_width: AstrocadeParam.STEREO_WIDTH,
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

  /** Set vibrato speed (0-3, 0=fastest) */
  setVibratoSpeed(value: number): void {
    this.sendMessage('setVibratoSpeed', value);
  }

  /** Set vibrato depth (0-63) */
  setVibratoDepth(value: number): void {
    this.sendMessage('setVibratoDepth', value);
  }

  /** Set noise volume (0-255) */
  setNoiseVolume(value: number): void {
    this.sendMessage('setNoiseVolume', value);
  }

  // ========================================================================
  // Register-level access
  // ========================================================================

  /** Write a value to an Astrocade register (0-7) */
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

export default AstrocadeSynth;
