import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

/**
 * MSM5232 Parameter IDs (matching C++ enum)
 */
const MSM5232Param = {
  VOLUME: 0,
  FEET_MIX: 1,
  ATTACK_RATE: 2,
  DECAY_RATE: 3,
  NOISE_ENABLE: 4,
  STEREO_WIDTH: 5,
  REVERB: 6,
  ARM_MODE: 7,
} as const;

/**
 * Feet mix modes
 */
export const MSM5232FeetMix = {
  ALL_FEET: 0,    // 2' + 4' + 8' + 16' mixed
  FEET_8_16: 1,   // 8' + 16' only
  FEET_8: 2,      // 8' only
  FEET_16: 3,     // 16' only
} as const;

/**
 * Preset names
 */
export const MSM5232Preset = {
  FULL_ORGAN: 0,
  FLUTE_8: 1,
  PRINCIPAL_16: 2,
  PICCOLO: 3,
  PERCUSSIVE: 4,
  STRINGS: 5,
  NOISE_PERC: 6,
  BASS_16: 7,
} as const;

/**
 * MSM5232 Synthesizer - OKI MSM5232RS 8-Channel Tone Generator (WASM)
 *
 * Based on MAME emulator by Jarek Burczynski / Hiromitsu Shioya
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The MSM5232 is an 8-channel tone generator used in many classic
 * arcade games (Irem M52/M62, Jaleco, etc). It generates organ-style
 * square wave tones with 4 "feet" outputs per channel (2', 4', 8', 16'),
 * producing rich harmonic content through octave layering.
 *
 * Features:
 * - 8 polyphonic channels in 2 groups of 4
 * - 4 organ stops per channel: 16', 8', 4', 2'
 * - 88-entry ROM table for pitch-to-counter conversion
 * - RC time-constant envelope (attack / decay1 / decay2 / release)
 * - 17-bit LFSR noise generator
 * - Stereo output with configurable width
 * - 8 built-in presets: Organ, Flute, Principal, Piccolo, Percussive, Strings, Noise, Bass
 */
export class MSM5232Synth extends Tone.ToneAudioNode {
  readonly name = 'MSM5232Synth';
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
      await MSM5232Synth.ensureInitialized(context);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[MSM5232] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!this.isWorkletLoaded) {
        try {
          await context.audioWorklet.addModule(`${baseUrl}mame/MSM5232.worklet.js`);
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

    this.workletNode = toneCreateAudioWorkletNode(rawContext, 'msm5232-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: rawContext.sampleRate,
      },
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[MSM5232] WASM node ready');
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
      volume: MSM5232Param.VOLUME,
      feet_mix: MSM5232Param.FEET_MIX,
      attack_rate: MSM5232Param.ATTACK_RATE,
      decay_rate: MSM5232Param.DECAY_RATE,
      noise_enable: MSM5232Param.NOISE_ENABLE,
      stereo_width: MSM5232Param.STEREO_WIDTH,
      reverb: MSM5232Param.REVERB,
      arm_mode: MSM5232Param.ARM_MODE,
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

  /** Set feet mix mode (0=all, 1=8'+16', 2=8' only, 3=16' only) */
  setFeetMix(value: number): void {
    this.sendMessage('setFeetMix', value);
  }

  /** Set attack rate (0-7, higher = faster) */
  setAttackRate(value: number): void {
    this.sendMessage('setAttackRate', value);
  }

  /** Set decay rate (0-15, higher = slower) */
  setDecayRate(value: number): void {
    this.sendMessage('setDecayRate', value);
  }

  // ========================================================================
  // Register-level access
  // ========================================================================

  /** Write a value to an MSM5232 register */
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

export default MSM5232Synth;
