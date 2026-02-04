import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

/**
 * TIA Parameter IDs (matching C++ enum)
 */
const TIAParam = {
  VOLUME: 0,
  AUDC_MODE: 1,
  AUDF_FINE: 2,
  STEREO_WIDTH: 3,
  DETUNE: 4,
  POLY_RESET: 5,
} as const;

/**
 * TIA Audio Control Modes (AUDC register)
 * Each mode creates a distinct timbre by combining polynomial counters
 */
export const TIAMode = {
  SET_TO_1: 0,       // Constant output
  POLY4: 1,          // 4-bit polynomial (buzzy metallic)
  DIV31_POLY4: 2,    // Div31+Poly4 (low rumble)
  POLY5_POLY4: 3,    // Poly5+Poly4 (complex noise)
  PURE: 4,           // Pure square wave
  PURE2: 5,          // Pure square variant
  DIV31_PURE: 6,     // Div31+Pure (bass/explosion)
  POLY5_2: 7,        // Poly5 variant (engine rumble)
  POLY9: 8,          // 9-bit polynomial (white noise)
  POLY5: 9,          // 5-bit polynomial (pink-ish noise)
  DIV31_POLY5: 10,   // Div31+Poly5 (low noise)
  POLY5_POLY5: 11,   // Volume only
  DIV3_PURE: 12,     // Div3+Pure (bass square)
  DIV3_PURE2: 13,    // Div3+Pure variant
  DIV93_PURE: 14,    // Div93+Pure (very low bass)
  POLY5_DIV3: 15,    // Poly5+Div3 (complex bass)
} as const;

/**
 * TIA (Atari) - Television Interface Adaptor Sound Synthesizer (WASM)
 *
 * Polynomial counter-based synthesis from the Atari 2600 (1977).
 * Compiled to WebAssembly for authentic lo-fi Atari sound.
 *
 * The TIA chip creates sound using a unique combination of polynomial
 * counters (4-bit, 5-bit, 9-bit), divide-by-N frequency dividers,
 * and pure tone generation. This approach produces the distinctive
 * buzzy, crunchy "Atari sound" unlike any other synthesis method.
 *
 * Features:
 * - 4-voice polyphony (4 independent TIA channel pairs)
 * - 16 audio control modes (AUDC) for distinct timbres
 * - 3 polynomial counters: POLY4 (15-step), POLY5 (31-step), POLY9 (511-step)
 * - Pure tone, noise, and hybrid synthesis modes
 * - MIDI note quantization to TIA frequency grid
 * - ADSR envelope per voice
 * - Channel detuning for thickness
 *
 * Used in: Atari 2600 - Pitfall!, Space Invaders, Adventure, Combat,
 * Yars' Revenge, River Raid, Missile Command, and 400+ other games
 */
export class TIASynth extends Tone.ToneAudioNode {
  readonly name = 'TIASynth';
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
      await TIASynth.ensureInitialized(context);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[TIA] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!this.isWorkletLoaded) {
        try {
          await context.audioWorklet.addModule(`${baseUrl}mame/TIA.worklet.js`);
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

    this.workletNode = toneCreateAudioWorkletNode(rawContext, 'tia-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: rawContext.sampleRate,
      },
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[TIA] WASM node ready');
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
      volume: TIAParam.VOLUME,
      audc_mode: TIAParam.AUDC_MODE,
      audf_fine: TIAParam.AUDF_FINE,
      stereo_width: TIAParam.STEREO_WIDTH,
      detune: TIAParam.DETUNE,
      poly_reset: TIAParam.POLY_RESET,
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

  /** Set AUDC audio control mode (0-15). Use TIAMode constants.
   * Each mode creates a distinct timbre using polynomial counter combinations. */
  setMode(mode: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setMode', value: mode });
  }

  /** Set channel detune amount (0-1, for thicker sound) */
  setDetune(value: number): void {
    this.setParameterById(TIAParam.DETUNE, value);
  }

  /** Load an AUDC mode as preset (0-15). Use TIAMode constants. */
  loadPreset(program: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'loadPreset', args: [program] });
      return;
    }
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

export default TIASynth;
