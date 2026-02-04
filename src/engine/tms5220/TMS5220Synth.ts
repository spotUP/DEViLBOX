import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

/**
 * TMS5220 Parameter IDs (matching C++ enum)
 */
const TMS5220Param = {
  VOLUME: 0,
  CHIRP_TYPE: 1,
  K1_INDEX: 2,
  K2_INDEX: 3,
  K3_INDEX: 4,
  ENERGY_INDEX: 5,
  PITCH_INDEX: 6,
  NOISE_MODE: 7,
  STEREO_WIDTH: 8,
  BRIGHTNESS: 9,
} as const;

/**
 * Phoneme presets (vowel sounds)
 */
export const TMS5220Preset = {
  AH: 0,   // "father"
  EE: 1,   // "meet"
  IH: 2,   // "bit"
  OH: 3,   // "boat"
  OO: 4,   // "boot"
  AE: 5,   // "bat"
  UH: 6,   // "but"
  SH: 7,   // "shh" (unvoiced)
} as const;

/**
 * Chirp type selection
 */
export const TMS5220ChirpType = {
  ORIGINAL_SPEAK_AND_SPELL: 0,  // 1978-79 patent chirp
  LATER_TMS5220: 1,             // Later arcade/TMS5110A chirp
} as const;

/**
 * TMS5220 (Texas Instruments) - LPC Speech Synthesizer (WASM)
 *
 * Based on MAME emulator by Frank Palazzolo, Aaron Giles,
 * Jonathan Gevaryahu, Raphael Nabet, Couriersud, Michael Zapf
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The TMS5220 is the famous "Speak & Spell" chip - a Linear Predictive
 * Coding (LPC) speech synthesizer that generates sound by exciting a
 * 10-pole digital lattice filter with either a chirp waveform (voiced)
 * or pseudo-random noise (unvoiced).
 *
 * Features:
 * - 4-voice polyphony (4 independent TMS5220 LPC engines)
 * - 10-pole digital lattice filter (faithful from MAME)
 * - Chirp excitation for voiced sounds (52-element ROM table)
 * - 13-bit LFSR noise for unvoiced sounds (20 updates per sample)
 * - Frame-based parameter interpolation (25ms frames, 8 IPs)
 * - Two chirp ROM variants (original Speak & Spell + later TMS5220)
 * - 8 phoneme presets (7 vowels + 1 unvoiced fricative)
 * - Real-time K1/K2/K3 formant control via MIDI CC
 * - Internal 8kHz processing rate (authentic)
 *
 * Used in: TI Speak & Spell (1978), arcade games (Berzerk, Star Wars,
 * Bagman, Blue Wizard Is About To Die), Atari games
 */
export class TMS5220Synth extends Tone.ToneAudioNode {
  readonly name = 'TMS5220Synth';
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
      await TMS5220Synth.ensureInitialized(context);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[TMS5220] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!this.isWorkletLoaded) {
        try {
          await context.audioWorklet.addModule(`${baseUrl}mame/TMS5220.worklet.js`);
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

    this.workletNode = toneCreateAudioWorkletNode(rawContext, 'tms5220-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: rawContext.sampleRate,
      },
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[TMS5220] WASM node ready');
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
      volume: TMS5220Param.VOLUME,
      chirp_type: TMS5220Param.CHIRP_TYPE,
      k1_index: TMS5220Param.K1_INDEX,
      k2_index: TMS5220Param.K2_INDEX,
      k3_index: TMS5220Param.K3_INDEX,
      energy_index: TMS5220Param.ENERGY_INDEX,
      pitch_index: TMS5220Param.PITCH_INDEX,
      noise_mode: TMS5220Param.NOISE_MODE,
      stereo_width: TMS5220Param.STEREO_WIDTH,
      brightness: TMS5220Param.BRIGHTNESS,
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

  /** Set K1/K2/K3 formant filter indices.
   * k1: 0-31 (low=closed, high=open vowel)
   * k2: 0-31 (low=back, high=front vowel)
   * k3: 0-15 */
  setFormants(k1: number, k2: number, k3: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setFormants', k1, k2, k3 });
  }

  /** Set noise mode (true=unvoiced fricative, false=voiced) */
  setNoiseMode(noise: boolean): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setNoiseMode', value: noise });
  }

  /** Set chirp ROM type (0=original Speak & Spell, 1=later TMS5220) */
  setChirpType(type: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setChirpType', value: type });
  }

  /** Set energy level index (0-15, controls excitation amplitude) */
  setEnergy(index: number): void {
    this.setParameterById(TMS5220Param.ENERGY_INDEX, index);
  }

  /** Set brightness (0-2, scales higher K coefficients) */
  setBrightness(value: number): void {
    this.setParameterById(TMS5220Param.BRIGHTNESS, value);
  }

  /** Load a phoneme preset (0-7). Use TMS5220Preset constants. */
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

export default TMS5220Synth;
