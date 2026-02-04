import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

/**
 * K054539 Parameter IDs (matching C++ enum)
 */
const K054539Param = {
  MASTER_VOLUME: 0,
  REVERB_ENABLE: 1,
  CHANNEL_GAIN: 2
} as const;

/**
 * K054539 Sample Types
 */
const K054539SampleType = {
  PCM8: 0x0,    // 8-bit signed PCM
  PCM16: 0x4,   // 16-bit signed PCM (LSB first)
  DPCM4: 0x8    // 4-bit differential PCM
} as const;

/**
 * K054539 Synthesizer - Konami PCM/ADPCM Sound Chip (WASM)
 *
 * Based on MAME's K054539 emulator by Olivier Galibert
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The K054539 is an 8-channel PCM/ADPCM chip used in many Konami arcade games:
 * - Mystic Warriors
 * - Violent Storm
 * - Metamorphic Force
 * - Martial Champion
 * - Gaiapolis
 * - Run and Gun
 * - Lethal Enforcers II
 * - And many more...
 *
 * Features:
 * - 8 independent channels
 * - 8-bit PCM, 16-bit PCM, and 4-bit DPCM modes
 * - Per-channel volume and panning
 * - Hardware reverb with 32KB buffer
 * - Loop points
 * - Reverse playback
 */
export class K054539Synth extends Tone.ToneAudioNode {
  readonly name = 'K054539Synth';
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
      await K054539Synth.ensureInitialized(context);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[K054539] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!this.isWorkletLoaded) {
        try {
          await context.audioWorklet.addModule(`${baseUrl}mame/K054539.worklet.js`);
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

    this.workletNode = toneCreateAudioWorkletNode(rawContext, 'k054539-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: rawContext.sampleRate
      }
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[K054539] WASM node ready');
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
   * Configure a channel for sample playback
   * @param channel Channel number (0-7)
   * @param startAddr Start address in ROM
   * @param loopAddr Loop point address
   * @param sampleType 0=8bit PCM, 4=16bit PCM, 8=DPCM
   * @param loopEnable Enable looping
   * @param reverse Reverse playback
   */
  configureChannel(channel: number, startAddr: number, loopAddr: number,
                   sampleType: number = 0, loopEnable: boolean = false,
                   reverse: boolean = false): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'configureChannel',
      channel,
      startAddr,
      loopAddr,
      sampleType,
      loopEnable,
      reverse
    });
  }

  /**
   * Set channel pitch
   * @param channel Channel number (0-7)
   * @param delta Pitch delta (0x10000 = original pitch)
   */
  setChannelPitch(channel: number, delta: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setChannelPitch',
      channel,
      delta
    });
  }

  /**
   * Set channel volume
   * @param channel Channel number (0-7)
   * @param volume Volume (0=max, 0x40=-36dB)
   */
  setChannelVolume(channel: number, volume: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setChannelVolume',
      channel,
      volume
    });
  }

  /**
   * Set channel pan
   * @param channel Channel number (0-7)
   * @param pan Pan position (0=left, 7=center, 14=right)
   */
  setChannelPan(channel: number, pan: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setChannelPan',
      channel,
      pan
    });
  }

  /**
   * Set channel gain multiplier
   * @param channel Channel number (0-7)
   * @param gain Gain multiplier (1.0 = unity)
   */
  setChannelGain(channel: number, gain: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setChannelGain',
      channel,
      gain
    });
  }

  /**
   * Trigger key-on for a specific channel
   */
  keyOn(channel: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'keyOn',
      channel
    });
  }

  /**
   * Trigger key-off for a specific channel
   */
  keyOff(channel: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'keyOff',
      channel
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
      'master_volume': K054539Param.MASTER_VOLUME,
      'volume': K054539Param.MASTER_VOLUME,
      'reverb_enable': K054539Param.REVERB_ENABLE,
      'reverb': K054539Param.REVERB_ENABLE
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  setMasterVolume(val: number): void {
    this.setParameterById(K054539Param.MASTER_VOLUME, val);
  }

  setReverbEnable(enable: boolean): void {
    this.setParameterById(K054539Param.REVERB_ENABLE, enable ? 1.0 : 0.0);
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
export { K054539Param, K054539SampleType };

export default K054539Synth;
