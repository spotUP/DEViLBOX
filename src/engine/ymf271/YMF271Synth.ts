import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

/**
 * YMF271 Parameter IDs (matching C++ enum)
 */
const YMF271Param = {
  MASTER_VOLUME: 0,
  ALGORITHM: 1,
  FEEDBACK: 2,
  WAVEFORM: 3,
  TL: 4,          // Total Level
  AR: 5,          // Attack Rate
  D1R: 6,         // Decay 1 Rate
  D2R: 7,         // Decay 2 Rate
  RR: 8,          // Release Rate
  D1L: 9,         // Decay 1 Level
  MULTIPLE: 10,
  DETUNE: 11,
  LFO_FREQ: 12,
  LFO_WAVE: 13,
  PMS: 14,        // Pitch Modulation Sensitivity
  AMS: 15         // Amplitude Modulation Sensitivity
} as const;

// FM Algorithms (0-15)
const YMF271Algorithm = {
  ALG0: 0,   // S1->S3->S2->S4 (serial)
  ALG1: 1,
  ALG2: 2,
  ALG3: 3,
  ALG4: 4,
  ALG5: 5,
  ALG6: 6,
  ALG7: 7,
  ALG8: 8,
  ALG9: 9,
  ALG10: 10,
  ALG11: 11,
  ALG12: 12,
  ALG13: 13,
  ALG14: 14,
  ALG15: 15  // All carriers (parallel)
} as const;

// Waveforms
const YMF271Waveform = {
  SINE: 0,
  SINE_SQUARED: 1,
  SINE_RECTIFIED: 2,
  HALF_SINE: 3,
  DOUBLE_FREQ_HALF_SINE: 4,
  ABS_DOUBLE_FREQ_HALF_SINE: 5,
  DC: 6
} as const;

/**
 * YMF271 Synthesizer - Yamaha OPX 4-Operator FM (WASM)
 *
 * Based on MAME's YMF271 emulator by R. Belmont, O. Galibert, and hap
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The YMF271 is a 4-operator FM synthesizer used in:
 * - Various Jaleco arcade games
 * - Seta/Allumer arcade boards
 *
 * Features:
 * - 48 slots (12 groups × 4 operators)
 * - 4-operator FM synthesis with 16 algorithms
 * - 8 waveforms (sine, sine squared, half-sine, etc.)
 * - ADSR envelope (Attack, Decay1, Decay2, Release)
 * - LFO with pitch and amplitude modulation
 * - PCM playback mode
 */
export class YMF271Synth extends Tone.ToneAudioNode {
  readonly name = 'YMF271Synth';
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
      await YMF271Synth.ensureInitialized(context);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[YMF271] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!this.isWorkletLoaded) {
        try {
          await context.audioWorklet.addModule(`${baseUrl}mame/YMF271.worklet.js`);
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

    // Get the rawContext from Tone.js (standardized-audio-context)
    const toneContext = this.context as any;
    const rawContext = toneContext.rawContext || toneContext._context;

    this.workletNode = toneCreateAudioWorkletNode(rawContext, 'ymf271-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: rawContext.sampleRate
      }
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[YMF271] WASM node ready');
        this._isReady = true;
        for (const call of this._pendingCalls) {
          if (call.method === 'setParam') this.setParam(call.args[0], call.args[1]);
        }
        this._pendingCalls = [];
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: rawContext.sampleRate
    });

    // Connect worklet to Tone.js output - use the input property which is the native GainNode
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

  triggerAttack(note: string | number, _time?: number, velocity: number = 1): void {
    if (!this.workletNode || this._disposed) return;

    const midiNote = typeof note === 'string'
      ? Tone.Frequency(note).toMidi()
      : Math.round(12 * Math.log2(note / 440) + 69);

    this.workletNode.port.postMessage({
      type: 'noteOn',
      note: midiNote,
      velocity: Math.floor(velocity * 127)
    });
  }

  triggerRelease(_time?: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'noteOff',
      note: 0
    });
  }

  releaseAll(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'allNotesOff' });
  }

  triggerAttackRelease(note: string | number, duration: string | number, time?: number, velocity?: number): void {
    if (this._disposed) return;
    this.triggerAttack(note, time, velocity || 1);

    const d = Tone.Time(duration).toSeconds();
    setTimeout(() => {
      if (!this._disposed) {
        this.triggerRelease();
      }
    }, d * 1000);
  }

  private setParameterById(paramId: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setParameter',
      paramId,
      value
    });
  }

  setParam(param: string, value: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'setParam', args: [param, value] });
      return;
    }
    const paramMap: Record<string, number> = {
      'master_volume': YMF271Param.MASTER_VOLUME,
      'volume': YMF271Param.MASTER_VOLUME,
      'algorithm': YMF271Param.ALGORITHM,
      'feedback': YMF271Param.FEEDBACK,
      'waveform': YMF271Param.WAVEFORM,
      'tl': YMF271Param.TL,
      'total_level': YMF271Param.TL,
      'ar': YMF271Param.AR,
      'attack': YMF271Param.AR,
      'd1r': YMF271Param.D1R,
      'decay1': YMF271Param.D1R,
      'd2r': YMF271Param.D2R,
      'decay2': YMF271Param.D2R,
      'rr': YMF271Param.RR,
      'release': YMF271Param.RR,
      'd1l': YMF271Param.D1L,
      'decay1_level': YMF271Param.D1L,
      'multiple': YMF271Param.MULTIPLE,
      'detune': YMF271Param.DETUNE,
      'lfo_freq': YMF271Param.LFO_FREQ,
      'lfo_wave': YMF271Param.LFO_WAVE,
      'pms': YMF271Param.PMS,
      'ams': YMF271Param.AMS
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  // Convenience methods for FM parameters
  setAlgorithm(alg: number): void {
    this.setParameterById(YMF271Param.ALGORITHM, alg / 15.0);
  }

  setFeedback(fb: number): void {
    this.setParameterById(YMF271Param.FEEDBACK, fb / 7.0);
  }

  setWaveform(wave: number): void {
    this.setParameterById(YMF271Param.WAVEFORM, wave / 6.0);
  }

  setAttackRate(ar: number): void {
    this.setParameterById(YMF271Param.AR, ar / 31.0);
  }

  setDecay1Rate(d1r: number): void {
    this.setParameterById(YMF271Param.D1R, d1r / 31.0);
  }

  setDecay2Rate(d2r: number): void {
    this.setParameterById(YMF271Param.D2R, d2r / 31.0);
  }

  setReleaseRate(rr: number): void {
    this.setParameterById(YMF271Param.RR, rr / 15.0);
  }

  setTotalLevel(tl: number): void {
    this.setParameterById(YMF271Param.TL, tl / 127.0);
  }

  setMultiple(mul: number): void {
    this.setParameterById(YMF271Param.MULTIPLE, mul / 15.0);
  }

  setLFOFrequency(freq: number): void {
    this.setParameterById(YMF271Param.LFO_FREQ, freq / 255.0);
  }

  setLFOWaveform(wave: number): void {
    this.setParameterById(YMF271Param.LFO_WAVE, wave / 3.0);
  }

  setMasterVolume(val: number): void {
    this.setParameterById(YMF271Param.MASTER_VOLUME, val);
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

// Export constants
export { YMF271Param, YMF271Algorithm, YMF271Waveform };

export default YMF271Synth;
