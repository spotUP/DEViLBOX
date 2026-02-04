import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

/**
 * Votrax Parameter IDs (matching C++ enum)
 */
const VotraxParam = {
  VOLUME: 0,
  PHONEME: 1,
  INFLECTION: 2,
  F1_OVERRIDE: 3,
  F2_OVERRIDE: 4,
  F3_OVERRIDE: 5,
  STEREO_WIDTH: 6,
} as const;

/**
 * Votrax SC-01 Phoneme codes (64 phonemes)
 */
export const VotraxPhoneme = {
  EH3: 0, EH2: 1, EH1: 2, PA0: 3, DT: 4, A1: 5, A2: 6, ZH: 7,
  AH2: 8, I3: 9, I2: 10, I1: 11, M: 12, N: 13, B: 14, V: 15,
  CH: 16, SH: 17, Z: 18, AW1: 19, NG: 20, AH1: 21, OO1: 22, OO: 23,
  L: 24, K: 25, J: 26, H: 27, G: 28, F: 29, D: 30, S: 31,
  A: 32, AY: 33, Y1: 34, UH3: 35, AH: 36, P: 37, O: 38, I: 39,
  U: 40, Y: 41, T: 42, R: 43, E: 44, W: 45, AE: 46, AE1: 47,
  AW2: 48, UH2: 49, UH1: 50, UH: 51, O2: 52, O1: 53, IU: 54, U1: 55,
  THV: 56, TH: 57, ER: 58, EH: 59, E1: 60, AW: 61, PA1: 62, STOP: 63,
} as const;

/**
 * Votrax SC-01 Synthesizer - Formant Speech Synthesizer (WASM)
 *
 * Based on MAME emulator by Olivier Galibert
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The Votrax SC-01 is a formant speech synthesizer IC that generates
 * 64 phonemes through:
 * - Glottal pulse train (9-element waveform) for voiced sounds
 * - 15-bit LFSR white noise for unvoiced/fricative sounds
 * - 4 formant filters (F1-F4) using bilinear-transformed analog circuits
 * - Noise shaping filter
 * - Glottal closure amplitude modulation
 * - Parameter interpolation between phoneme transitions
 *
 * Features:
 * - 4-voice polyphony (extended from original single voice)
 * - 64 phonemes selectable in real-time
 * - MIDI pitch control with pitch bend
 * - Real-time formant override (F1, F2, F3)
 * - 2-bit inflection for subtle pitch variation
 * - Internal 40kHz processing rate (authentic)
 */
export class VotraxSynth extends Tone.ToneAudioNode {
  readonly name = 'VotraxSynth';
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
      await VotraxSynth.ensureInitialized(context);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[Votrax] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!this.isWorkletLoaded) {
        try {
          await context.audioWorklet.addModule(`${baseUrl}mame/Votrax.worklet.js`);
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

    this.workletNode = toneCreateAudioWorkletNode(rawContext, 'votrax-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: rawContext.sampleRate,
      },
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[Votrax] WASM node ready');
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
      volume: VotraxParam.VOLUME,
      phoneme: VotraxParam.PHONEME,
      inflection: VotraxParam.INFLECTION,
      f1_override: VotraxParam.F1_OVERRIDE,
      f2_override: VotraxParam.F2_OVERRIDE,
      f3_override: VotraxParam.F3_OVERRIDE,
      stereo_width: VotraxParam.STEREO_WIDTH,
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

  /** Set phoneme (0-63). Use VotraxPhoneme constants. */
  setPhoneme(value: number): void {
    this.sendMessage('setPhoneme', value);
  }

  /** Set inflection (0-3) for subtle pitch variation */
  setInflection(value: number): void {
    this.setParameterById(VotraxParam.INFLECTION, value);
  }

  /** Override F1 formant (0-15, or -1 to use phoneme default) */
  setF1Override(value: number): void {
    this.setParameterById(VotraxParam.F1_OVERRIDE, value);
  }

  /** Override F2 formant (0-15, or -1 to use phoneme default) */
  setF2Override(value: number): void {
    this.setParameterById(VotraxParam.F2_OVERRIDE, value);
  }

  /** Override F3 formant (0-15, or -1 to use phoneme default) */
  setF3Override(value: number): void {
    this.setParameterById(VotraxParam.F3_OVERRIDE, value);
  }

  // ========================================================================
  // Hardware-level access
  // ========================================================================

  /** Write a phone code (0-63) directly */
  writePhone(phone: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'writePhone', value: phone });
  }

  /** Write inflection bits (0-3) directly */
  writeInflection(inflection: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'writeInflection', value: inflection });
  }

  /** Write a register value */
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

  /** Load a phoneme by program number (0-63) */
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

export default VotraxSynth;
