import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

/**
 * SP0250 Parameter IDs (matching C++ enum)
 */
const SP0250Param = {
  VOLUME: 0,
  VOWEL: 1,
  VOICED: 2,
  BRIGHTNESS: 3,
  STEREO_WIDTH: 4,
  FILTER_MIX: 5,
} as const;

/**
 * Vowel presets
 */
export const SP0250Preset = {
  AH: 0,       // /a/ (father) - open vowel
  EE: 1,       // /e/ (beet) - front close
  IH: 2,       // /i/ (bit) - front open
  OH: 3,       // /o/ (boat) - back rounded
  OO: 4,       // /u/ (boot) - back close
  NN: 5,       // Nasal /n/
  ZZ: 6,       // Buzz (unvoiced noise)
  HH: 7,       // Breathy
} as const;

/**
 * SP0250 Synthesizer - GI SP0250 Digital LPC Sound Synthesizer (WASM)
 *
 * Based on MAME emulator by Olivier Galibert
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The SP0250 is a digital formant/LPC (Linear Predictive Coding)
 * synthesizer that generates speech and vocal sounds through:
 * - Voiced excitation (pitch pulse train) or unvoiced (15-bit LFSR noise)
 * - 6 cascaded second-order lattice filters shaping the spectral envelope
 * - 8-bit amplitude control with mantissa+exponent encoding
 *
 * Features:
 * - 4-voice polyphony (extended from original single voice)
 * - 8 built-in vowel/formant presets: AH, EE, IH, OH, OO, NN, ZZ, HH
 * - Direct coefficient control for filter shaping
 * - 15-byte FIFO hardware-compatible interface
 * - Internal 128-entry coefficient ROM (from MAME)
 * - LPC runs at ~10kHz (authentic) with interpolated upsampling
 * - MIDI pitch mapping with pitch bend support
 */
export class SP0250Synth extends Tone.ToneAudioNode {
  readonly name = 'SP0250Synth';
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
      await SP0250Synth.ensureInitialized(context);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[SP0250] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!this.isWorkletLoaded) {
        try {
          await context.audioWorklet.addModule(`${baseUrl}mame/SP0250.worklet.js`);
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

    this.workletNode = toneCreateAudioWorkletNode(rawContext, 'sp0250-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: rawContext.sampleRate,
      },
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[SP0250] WASM node ready');
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
      volume: SP0250Param.VOLUME,
      vowel: SP0250Param.VOWEL,
      voiced: SP0250Param.VOICED,
      brightness: SP0250Param.BRIGHTNESS,
      stereo_width: SP0250Param.STEREO_WIDTH,
      filter_mix: SP0250Param.FILTER_MIX,
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

  /** Set vowel preset (0-7). Use SP0250Preset constants. */
  setVowel(value: number): void {
    this.sendMessage('setVowel', value);
  }

  /** Set voiced excitation (true) or noise excitation (false) */
  setVoiced(voiced: boolean): void {
    this.setParameterById(SP0250Param.VOICED, voiced ? 1.0 : 0.0);
  }

  /** Set brightness / upper formant emphasis (0-1) */
  setBrightness(value: number): void {
    this.setParameterById(SP0250Param.BRIGHTNESS, value);
  }

  // ========================================================================
  // Hardware-level access
  // ========================================================================

  /** Write a value to the SP0250 FIFO (index 0-14) */
  writeFIFO(index: number, data: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'writeFIFO', index, data });
  }

  /** Set individual filter coefficient (filterIdx 0-5, isB: false=F/true=B, value 0-255) */
  setFilterCoeff(filterIdx: number, isB: boolean, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setFilterCoeff', filterIdx, isB, value });
  }

  /** Write a value to an SP0250 register */
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

  /** Load a vowel preset by program number (0-7) */
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

export default SP0250Synth;
