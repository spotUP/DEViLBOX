import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

/**
 * ICS2115 Parameter IDs
 */
const ICS2115Param = {
  MASTER_VOLUME: 0,
  ACTIVE_OSCILLATORS: 1
} as const;

/**
 * ICS2115 WaveFront Synthesizer (WASM)
 *
 * Based on MAME's ics2115 by Alex Marshall, nimitz, austere
 * 32-voice wavetable synthesizer
 *
 * Used in many arcade games:
 * - Raiden II / DX, Raiden Fighters series
 * - Seibu Kaihatsu arcade games (1993+)
 * - Various arcade boards
 *
 * Features:
 * - 32 independent voices
 * - 16-bit, 8-bit, and u-law compressed sample formats
 * - Volume envelope with attack/decay/release
 * - Oscillator envelope with loop control
 * - Per-voice panning with log2 pan law
 * - Bidirectional looping
 * - Linear sample interpolation
 * - Slow attack ramp for click reduction
 */
export class ICS2115Synth extends Tone.ToneAudioNode {
  readonly name = 'ICS2115Synth';
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
      await ICS2115Synth.ensureInitialized(context);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[ICS2115] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!this.isWorkletLoaded) {
        try {
          await context.audioWorklet.addModule(`${baseUrl}mame/ICS2115.worklet.js`);
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

    this.workletNode = toneCreateAudioWorkletNode(rawContext, 'ics2115-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: rawContext.sampleRate
      }
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[ICS2115] WASM node ready');
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

  /**
   * Load sample ROM data
   * @param offset Offset in ROM
   * @param data Sample data (Uint8Array)
   */
  loadROM(offset: number, data: Uint8Array): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'loadROM',
      offset,
      data: data.buffer,
      size: data.length
    }, [data.buffer.slice(0)]);
  }

  /**
   * Write to ICS2115 register
   * @param voice Voice number (0-31)
   * @param reg Register number
   * @param data 16-bit data value
   */
  writeRegister(voice: number, reg: number, data: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'writeRegister',
      voice,
      reg,
      data
    });
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
      'master_volume': ICS2115Param.MASTER_VOLUME,
      'volume': ICS2115Param.MASTER_VOLUME,
      'active_osc': ICS2115Param.ACTIVE_OSCILLATORS,
      'voices': ICS2115Param.ACTIVE_OSCILLATORS
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  setMasterVolume(val: number): void {
    this.setParameterById(ICS2115Param.MASTER_VOLUME, val);
  }

  setActiveOscillators(count: number): void {
    this.setParameterById(ICS2115Param.ACTIVE_OSCILLATORS, count);
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
export { ICS2115Param };

export default ICS2115Synth;
