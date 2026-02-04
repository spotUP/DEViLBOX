import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

/**
 * K051649 Parameter IDs
 */
const K051649Param = {
  MASTER_VOLUME: 0,
  VARIANT: 1
} as const;

/**
 * Chip variant constants
 */
export const SCC_VARIANT = {
  K051649: 0,    // Original SCC - channels 4/5 share wavetable
  K052539: 1     // SCC+ - all channels have independent wavetables
} as const;

/**
 * Konami 051649 SCC Synthesizer (WASM)
 *
 * Based on MAME's k051649 by Bryan McPhail
 *
 * The legendary Konami SCC (Sound Creative Chip)!
 * A 5-channel programmable wavetable synthesizer with that
 * distinctive Konami sound.
 *
 * Used in:
 * - Gradius series (MSX)
 * - Salamander/Life Force (MSX)
 * - Snatcher (MSX)
 * - Metal Gear series (MSX)
 * - Haunted Castle (arcade)
 * - Many other Konami classics
 *
 * Features:
 * - 5 independent sound channels
 * - 32-byte wavetable per channel (8-bit signed samples)
 * - 12-bit frequency register per channel
 * - 4-bit volume per channel
 * - Per-channel key on/off
 * - K051649 variant: channels 4 & 5 share wavetable RAM
 * - K052539 (SCC+) variant: all channels independent
 */
export class K051649Synth extends Tone.ToneAudioNode {
  readonly name = 'K051649Synth';
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
      await K051649Synth.ensureInitialized(context);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[K051649] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!this.isWorkletLoaded) {
        try {
          await context.audioWorklet.addModule(`${baseUrl}mame/K051649.worklet.js`);
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

    const context = getNativeContext(this.context);

    this.workletNode = toneCreateAudioWorkletNode(context, 'k051649-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: context.sampleRate
      }
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[K051649] WASM node ready');
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: context.sampleRate
    });

    this.workletNode.connect(this.output.input as AudioNode);
  }

  /**
   * Set chip variant (K051649 or K052539)
   */
  setVariant(variant: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setVariant',
      variant
    });
  }

  /**
   * Set clock frequency
   */
  setClock(clock: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setClock',
      clock
    });
  }

  /**
   * Write waveform data
   * @param channel Channel 0-4
   * @param position Position in wavetable 0-31
   * @param value Signed 8-bit sample value (-128 to 127)
   */
  writeWaveformSample(channel: number, position: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    const offset = (channel << 5) | (position & 0x1f);
    this.workletNode.port.postMessage({
      type: 'writeWaveform',
      offset,
      value: value & 0xff
    });
  }

  /**
   * Load a complete 32-byte waveform to a channel
   * @param channel Channel 0-4
   * @param waveform Array of 32 signed 8-bit values
   */
  loadWaveform(channel: number, waveform: number[]): void {
    if (!this.workletNode || this._disposed) return;
    for (let i = 0; i < 32 && i < waveform.length; i++) {
      this.writeWaveformSample(channel, i, waveform[i]);
    }
  }

  /**
   * Set channel frequency
   * @param channel Channel 0-4
   * @param frequency 12-bit frequency value
   */
  setChannelFrequency(channel: number, frequency: number): void {
    if (!this.workletNode || this._disposed) return;
    // Low byte
    this.workletNode.port.postMessage({
      type: 'writeFrequency',
      offset: channel * 2,
      value: frequency & 0xff
    });
    // High byte
    this.workletNode.port.postMessage({
      type: 'writeFrequency',
      offset: channel * 2 + 1,
      value: (frequency >> 8) & 0x0f
    });
  }

  /**
   * Set channel volume
   * @param channel Channel 0-4
   * @param volume Volume 0-15
   */
  setChannelVolume(channel: number, volume: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'writeVolume',
      channel,
      value: volume & 0x0f
    });
  }

  /**
   * Set key on/off for channels
   * @param keys Bitmask: bit 0 = ch0, bit 1 = ch1, etc.
   */
  setKeyOnOff(keys: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'writeKeyOnOff',
      value: keys & 0x1f
    });
  }

  /**
   * Key on a single channel
   */
  keyOn(channel: number): void {
    // This is a simplified interface - in reality you'd track current state
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'writeKeyOnOff',
      value: 1 << channel
    });
  }

  /**
   * Key off a single channel
   */
  keyOff(_channel: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'writeKeyOnOff',
      value: 0
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

  setParam(param: string, value: number): void {
    const paramMap: Record<string, () => void> = {
      'master_volume': () => this.setMasterVolume(value),
      'volume': () => this.setMasterVolume(value),
      'variant': () => this.setVariant(Math.floor(value))
    };

    const fn = paramMap[param];
    if (fn) fn();
  }

  setMasterVolume(val: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setMasterVolume',
      volume: val
    });
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
export { K051649Param };

export default K051649Synth;
