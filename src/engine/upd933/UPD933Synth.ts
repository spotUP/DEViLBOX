import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

/**
 * uPD933 Parameter IDs (matching C++ enum)
 */
const UPD933Param = {
  VOLUME: 0,
  WAVEFORM1: 1,
  WAVEFORM2: 2,
  WINDOW: 3,
  DCW_DEPTH: 4,
  DCA_RATE: 5,
  DCW_RATE: 6,
  DCO_RATE: 7,
  DCO_DEPTH: 8,
  RING_MOD: 9,
  STEREO_WIDTH: 10,
} as const;

/**
 * CZ-style waveforms (phase distortion transfer functions)
 */
export const UPD933Waveform = {
  SAWTOOTH: 0,
  SQUARE: 1,
  PULSE: 2,
  SILENT: 3,
  DOUBLE_SINE: 4,
  SAW_PULSE: 5,
  RESONANCE: 6,
  DOUBLE_PULSE: 7,
} as const;

/**
 * Window functions
 */
export const UPD933Window = {
  NONE: 0,
  SAWTOOTH: 1,
  TRIANGLE: 2,
  TRAPEZOID: 3,
  PULSE: 4,
  DOUBLE_SAW: 5,
} as const;

/**
 * CZ-style presets
 */
export const UPD933Preset = {
  BRASS: 0,
  STRINGS: 1,
  EPIANO: 2,
  BASS: 3,
  ORGAN: 4,
  PAD: 5,
  LEAD: 6,
  BELL: 7,
} as const;

/**
 * uPD933 (NEC/Casio) - Phase Distortion Synthesis Chip (WASM)
 *
 * Based on MAME emulator by Devin Acker
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The uPD933 is the heart of the Casio CZ series synthesizers.
 * It implements Casio's proprietary "Phase Distortion" (PD) synthesis,
 * which distorts the phase of a cosine wave using various transfer
 * functions to create harmonically rich timbres without FM synthesis.
 *
 * Features:
 * - 8-voice polyphony (matching CZ hardware)
 * - 8 PD waveform types (sawtooth, square, pulse, double sine,
 *   saw pulse, resonance, double pulse, silent)
 * - 6 window functions for waveshaping
 * - 3 envelope generators per voice: DCA, DCW, DCO
 * - Ring modulation between voice pairs
 * - Pitch modulation (voice cross-mod or noise)
 * - Cosine-based output with phase distortion
 * - 8 CZ-style presets (brass, strings, e.piano, bass, organ, pad, lead, bell)
 *
 * Used in: Casio CZ-101, CZ-1000, CZ-1, CZ-3000, CZ-5000
 */
export class UPD933Synth extends Tone.ToneAudioNode {
  readonly name = 'UPD933Synth';
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
      await UPD933Synth.ensureInitialized(context);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[UPD933] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!this.isWorkletLoaded) {
        try {
          await context.audioWorklet.addModule(`${baseUrl}mame/UPD933.worklet.js`);
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

    this.workletNode = toneCreateAudioWorkletNode(rawContext, 'upd933-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: rawContext.sampleRate,
      },
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[UPD933] WASM node ready');
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
      volume: UPD933Param.VOLUME,
      waveform1: UPD933Param.WAVEFORM1,
      waveform2: UPD933Param.WAVEFORM2,
      window: UPD933Param.WINDOW,
      dcw_depth: UPD933Param.DCW_DEPTH,
      dca_rate: UPD933Param.DCA_RATE,
      dcw_rate: UPD933Param.DCW_RATE,
      dco_rate: UPD933Param.DCO_RATE,
      dco_depth: UPD933Param.DCO_DEPTH,
      ring_mod: UPD933Param.RING_MOD,
      stereo_width: UPD933Param.STEREO_WIDTH,
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

  /** Set PD waveform types. Use UPD933Waveform constants.
   * wave1: first half waveform (0-7), wave2: second half waveform (0-7) */
  setWaveform(wave1: number, wave2: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setWaveform', wave1, wave2 });
  }

  /** Set window function (0-5). Use UPD933Window constants. */
  setWindow(win: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setWindow', value: win });
  }

  /** Set DCW (waveform distortion) depth (0-127) */
  setDCWDepth(depth: number): void {
    this.setParameterById(UPD933Param.DCW_DEPTH, depth);
  }

  /** Set DCA (amplitude envelope) rate (0-127, higher=faster) */
  setDCARate(rate: number): void {
    this.setParameterById(UPD933Param.DCA_RATE, rate);
  }

  /** Set DCW (waveform envelope) rate (0-127, higher=faster) */
  setDCWRate(rate: number): void {
    this.setParameterById(UPD933Param.DCW_RATE, rate);
  }

  /** Set DCO (pitch envelope) depth (0-63 semitones) */
  setDCODepth(depth: number): void {
    this.setParameterById(UPD933Param.DCO_DEPTH, depth);
  }

  /** Set ring modulation enable (true/false) */
  setRingMod(enabled: boolean): void {
    this.setParameterById(UPD933Param.RING_MOD, enabled ? 1 : 0);
  }

  /** Load a CZ-style preset (0-7). Use UPD933Preset constants. */
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

export default UPD933Synth;
