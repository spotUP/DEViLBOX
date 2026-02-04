import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

/**
 * CEM3394 Parameter IDs (matching C++ enum)
 */
const CEM3394Param = {
  VCO_FREQUENCY: 0,
  MODULATION_AMOUNT: 1,
  WAVE_SELECT: 2,
  PULSE_WIDTH: 3,
  MIXER_BALANCE: 4,
  FILTER_RESONANCE: 5,
  FILTER_FREQUENCY: 6,
  FINAL_GAIN: 7
} as const;

// Waveform flags
const CEM3394Wave = {
  TRIANGLE: 1,
  SAWTOOTH: 2,
  PULSE: 4
} as const;

/**
 * CEM3394 Synthesizer - Curtis Electromusic Analog Voice (WASM)
 *
 * Based on MAME's CEM3394 emulator by Aaron Giles
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The CEM3394 (1984) is a complete analog synth voice chip used in:
 * - Sequential Circuits Prophet VS, Matrix-6, Prelude
 * - Ensoniq ESQ-1, SQ-80
 * - Oberheim Matrix-1000
 *
 * Features:
 * - VCO with Triangle, Sawtooth, and Pulse waveforms
 * - Resonant lowpass VCF with state-variable filter
 * - VCA with exponential response
 * - Filter FM from VCO (modulation)
 */
export class CEM3394Synth extends Tone.ToneAudioNode {
  readonly name = 'CEM3394Synth';
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
      await CEM3394Synth.ensureInitialized(context);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[CEM3394] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!this.isWorkletLoaded) {
        try {
          await context.audioWorklet.addModule(`${baseUrl}mame/CEM3394.worklet.js`);
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

    this.workletNode = toneCreateAudioWorkletNode(rawContext, 'cem3394-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: rawContext.sampleRate
      }
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[CEM3394] WASM node ready');
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: rawContext.sampleRate
    });

    // Connect worklet to Tone.js output - use the input property which is the native GainNode
    const targetNode = this.output.input as AudioNode;
    this.workletNode.connect(targetNode);
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
    const paramMap: Record<string, number> = {
      'vco_frequency': CEM3394Param.VCO_FREQUENCY,
      'modulation': CEM3394Param.MODULATION_AMOUNT,
      'wave_select': CEM3394Param.WAVE_SELECT,
      'pulse_width': CEM3394Param.PULSE_WIDTH,
      'mixer_balance': CEM3394Param.MIXER_BALANCE,
      'resonance': CEM3394Param.FILTER_RESONANCE,
      'cutoff': CEM3394Param.FILTER_FREQUENCY,
      'volume': CEM3394Param.FINAL_GAIN
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  // Direct parameter setters
  setCutoff(hz: number): void {
    this.setParameterById(CEM3394Param.FILTER_FREQUENCY, hz);
  }

  setResonance(val: number): void {
    this.setParameterById(CEM3394Param.FILTER_RESONANCE, val);
  }

  setFilterModulation(val: number): void {
    this.setParameterById(CEM3394Param.MODULATION_AMOUNT, val);
  }

  setPulseWidth(val: number): void {
    this.setParameterById(CEM3394Param.PULSE_WIDTH, val);
  }

  setWaveform(waves: number | string): void {
    let val = CEM3394Wave.SAWTOOTH | CEM3394Wave.PULSE;
    if (typeof waves === 'string') {
      switch (waves.toLowerCase()) {
        case 'triangle': val = CEM3394Wave.TRIANGLE; break;
        case 'sawtooth': case 'saw': val = CEM3394Wave.SAWTOOTH; break;
        case 'pulse': case 'square': val = CEM3394Wave.PULSE; break;
        case 'all': val = CEM3394Wave.TRIANGLE | CEM3394Wave.SAWTOOTH | CEM3394Wave.PULSE; break;
      }
    } else {
      val = waves;
    }
    this.setParameterById(CEM3394Param.WAVE_SELECT, val);
  }

  setVolume(db: number): void {
    this.setParameterById(CEM3394Param.FINAL_GAIN, db);
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

export default CEM3394Synth;
