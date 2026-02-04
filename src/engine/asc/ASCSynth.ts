import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

/**
 * ASC Parameter IDs (matching C++ enum)
 */
const ASCParam = {
  VOLUME: 0,
  WAVEFORM: 1,
  ATTACK: 2,
  DECAY: 3,
  SUSTAIN: 4,
  RELEASE: 5,
  STEREO_WIDTH: 6,
  DETUNE: 7,
} as const;

/**
 * ASC Presets (wavetable voice programs)
 */
export const ASCPreset = {
  SINE_PAD: 0,       // Smooth, sustained sine pad
  TRIANGLE_LEAD: 1,  // Snappy triangle lead
  SAW_BASS: 2,       // Punchy sawtooth bass
  SQUARE_RETRO: 3,   // 8-bit retro square
  PULSE_NASAL: 4,    // Thin nasal pulse
  ORGAN: 5,          // Sustained organ tone
  PIANO: 6,          // Percussive piano-like
  STRINGS: 7,        // Slow attack strings
} as const;

/**
 * ASC (Apple Sound Chip) - 4-Voice Wavetable Synthesizer (WASM)
 *
 * 512-sample wavetable synthesis with 9.15 fixed-point phase accumulator.
 * Compiled to WebAssembly for authentic late-80s Macintosh sound.
 *
 * The ASC (344S0063) was used in Macintosh SE, II, LC, and Classic computers
 * (1987-1993). It has two modes: FIFO (for streaming audio from CPU) and
 * wavetable (for autonomous 4-voice synthesis). We implement the wavetable
 * mode with extended 8-voice polyphony and ADSR envelopes.
 *
 * Features:
 * - 8-voice polyphony (extended from original 4)
 * - 512-sample, 8-bit wavetables (matching ASC hardware)
 * - 9.15 fixed-point phase accumulator with linear interpolation
 * - 8 preset wavetables: sine, triangle, saw, square, pulse, organ, piano, strings
 * - ADSR envelope (original relied on CPU-driven volume)
 * - Stereo panning with configurable width
 * - Optional detune for chorus effect
 * - 22257 Hz native sample rate (Mac standard), resampled to output rate
 *
 * Used in: Macintosh SE, II, LC, Classic (1987-1993)
 */
export class ASCSynth extends Tone.ToneAudioNode {
  readonly name = 'ASCSynth';
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
      await ASCSynth.ensureInitialized(context);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[ASC] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!this.isWorkletLoaded) {
        try {
          await context.audioWorklet.addModule(`${baseUrl}mame/ASC.worklet.js`);
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

    this.workletNode = toneCreateAudioWorkletNode(rawContext, 'asc-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: rawContext.sampleRate,
      },
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[ASC] WASM node ready');
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

  triggerRelease(note?: string | number, _time?: number): void {
    if (!this.workletNode || this._disposed) return;
    if (note !== undefined) {
      const midiNote =
        typeof note === 'string'
          ? Tone.Frequency(note).toMidi()
          : Math.round(12 * Math.log2(note / 440) + 69);
      this.workletNode.port.postMessage({ type: 'noteOff', note: midiNote });
    } else {
      this.workletNode.port.postMessage({ type: 'allNotesOff' });
    }
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
        this.triggerRelease(note);
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
      volume: ASCParam.VOLUME,
      waveform: ASCParam.WAVEFORM,
      attack: ASCParam.ATTACK,
      decay: ASCParam.DECAY,
      sustain: ASCParam.SUSTAIN,
      release: ASCParam.RELEASE,
      stereo_width: ASCParam.STEREO_WIDTH,
      detune: ASCParam.DETUNE,
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

  /** Load a preset (0-7). Use ASCPreset constants. */
  loadPreset(program: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'loadPreset', args: [program] });
      return;
    }
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'programChange', program });
  }

  /** Set waveform (0-7: sine, triangle, saw, square, pulse, organ, piano, strings) */
  setWaveform(index: number): void {
    this.setParameterById(ASCParam.WAVEFORM, index);
  }

  /** Set attack rate (0.0001-0.1) */
  setAttack(rate: number): void {
    this.setParameterById(ASCParam.ATTACK, rate);
  }

  /** Set decay rate (0.0001-0.1) */
  setDecay(rate: number): void {
    this.setParameterById(ASCParam.DECAY, rate);
  }

  /** Set sustain level (0-1) */
  setSustain(level: number): void {
    this.setParameterById(ASCParam.SUSTAIN, level);
  }

  /** Set release rate (0.0001-0.1) */
  setRelease(rate: number): void {
    this.setParameterById(ASCParam.RELEASE, rate);
  }

  /** Set stereo width (0-1) */
  setStereoWidth(width: number): void {
    this.setParameterById(ASCParam.STEREO_WIDTH, width);
  }

  /** Set detune amount (0-1, affects alternate voices for chorus) */
  setDetune(amount: number): void {
    this.setParameterById(ASCParam.DETUNE, amount);
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

export default ASCSynth;
