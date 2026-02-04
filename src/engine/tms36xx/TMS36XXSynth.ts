import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

/**
 * TMS36XX Parameter IDs (matching C++ enum)
 */
const TMS36XXParam = {
  VOLUME: 0,
  STOP_ENABLE: 1,
  DECAY_RATE: 2,
  OCTAVE: 3,
  STEREO_WIDTH: 4,
  DETUNE: 5,
} as const;

/**
 * Organ registration presets
 */
export const TMS36XXPreset = {
  FULL_ORGAN: 0,
  FLUTE_8: 1,
  PRINCIPAL: 2,
  MIXTURE: 3,
  FOUNDATION: 4,
  BRIGHT: 5,
  DIAPASON: 6,
  PERCUSSIVE: 7,
} as const;

/**
 * TMS36XX Organ Stop Flags (for stop enable mask)
 */
export const TMS36XXStop = {
  STOP_16: 0x01,    // 16' (fundamental)
  STOP_8: 0x02,     // 8' (octave)
  STOP_5_13: 0x04,  // 5 1/3' (twelfth)
  STOP_4: 0x08,     // 4' (fifteenth)
  STOP_2_23: 0x10,  // 2 2/3' (seventeenth)
  STOP_2: 0x20,     // 2' (nineteenth)
  ALL: 0x3F,
} as const;

/**
 * TMS36XX (TMS3615/TMS3617) Tone Matrix Synthesizer - WASM
 *
 * Based on MAME emulator by Juergen Buchmueller
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The TMS36XX family are organ-like tone generator ICs producing
 * square waves at musical intervals (organ "feet"):
 *   16' (1x), 8' (2x), 5 1/3' (3x), 4' (4x), 2 2/3' (6x), 2' (8x)
 *
 * Features:
 * - 6-note polyphony (each with 6 organ stop harmonics)
 * - 8 organ registration presets
 * - Configurable stop enable mask
 * - Per-stop decay rates
 * - Stereo output with voice panning
 *
 * Used in: Phoenix, Naughty Boy, Pleiads, Monster Bash
 */
export class TMS36XXSynth extends Tone.ToneAudioNode {
  readonly name = 'TMS36XXSynth';
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
      await TMS36XXSynth.ensureInitialized(context);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[TMS36XX] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!this.isWorkletLoaded) {
        try {
          await context.audioWorklet.addModule(`${baseUrl}mame/TMS36XX.worklet.js`);
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

    this.workletNode = toneCreateAudioWorkletNode(rawContext, 'tms36xx-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: rawContext.sampleRate,
      },
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[TMS36XX] WASM node ready');
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
      volume: TMS36XXParam.VOLUME,
      stop_enable: TMS36XXParam.STOP_ENABLE,
      decay_rate: TMS36XXParam.DECAY_RATE,
      octave: TMS36XXParam.OCTAVE,
      stereo_width: TMS36XXParam.STEREO_WIDTH,
      detune: TMS36XXParam.DETUNE,
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

  /** Set organ stop enable mask (6-bit, use TMS36XXStop constants) */
  setStopEnable(mask: number): void {
    this.sendMessage('setStopEnable', mask);
  }

  /** Set octave shift (-2 to +2) */
  setOctave(octave: number): void {
    this.sendMessage('setOctave', octave);
  }

  /** Set decay rate multiplier */
  setDecayRate(value: number): void {
    this.setParameterById(TMS36XXParam.DECAY_RATE, value);
  }

  /** Set per-stop detune amount (0-1) */
  setDetune(value: number): void {
    this.setParameterById(TMS36XXParam.DETUNE, value);
  }

  // ========================================================================
  // Hardware-level access
  // ========================================================================

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

  /** Load an organ registration preset (0-7) */
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

export default TMS36XXSynth;
