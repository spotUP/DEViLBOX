import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';

/**
 * FZSynth - Casio FZ-1 8-Voice 16-bit PCM Sampler (WASM)
 *
 * Based on MAME's fz_pcm device (fz_pcm.cpp).
 * The Casio FZ-1 (1987) is a professional 16-bit PCM sampler:
 *
 * Hardware facts:
 * - 8 voices, 16-bit samples stored in 2MB wave RAM
 * - 13-bit fractional pitch accumulator (ADDR_FRAC_SHIFT=13)
 * - 3-bit linear interpolation between adjacent samples
 * - Loop support (forward and ping-pong)
 * - Used by many professional musicians in the late 1980s
 *
 * WASM status:
 * - WASM binary must be compiled from fz-wasm/FZEngine.c and placed at:
 *     public/mame/FZ.wasm + public/mame/FZ.js
 *   with a corresponding processor at:
 *     public/mame/FZ.worklet.js
 * - Until the WASM is compiled, this class will fail gracefully (logs an error)
 *   and produce no audio.
 */
export class FZSynth extends MAMEBaseSynth {
  readonly name = 'FZSynth';

  protected readonly chipName = 'FZ';
  protected readonly workletFile = 'FZ.worklet.js';
  protected readonly processorName = 'fzpcm-processor';

  private currentVoice: number = 0;

  constructor() {
    super();
    this.initSynth();
  }

  protected writeKeyOn(note: number, velocity: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'noteOn',
      note,
      velocity: Math.floor(velocity * 127),
      voice: this.currentVoice,
    });
  }

  protected writeKeyOff(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'noteOff',
      note: this.currentNote,
      voice: this.currentVoice,
    });
  }

  protected writeFrequency(freq: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setFrequency',
      freq,
      voice: this.currentVoice,
    });
  }

  protected writeVolume(volume: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setVolume',
      value: Math.round(volume * 255),
      voice: this.currentVoice,
    });
  }

  protected writePanning(pan: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setPanning',
      pan,
      voice: this.currentVoice,
    });
  }

  setVoice(voice: number): void {
    this.currentVoice = Math.max(0, Math.min(7, voice));
  }

  /**
   * Load 16-bit PCM sample data into a voice slot.
   * @param voiceIndex Voice index (0-7)
   * @param data 16-bit signed PCM samples as Int16Array or Uint8Array
   */
  loadVoiceSample(voiceIndex: number, data: Uint8Array): void {
    if (!this.workletNode || this._disposed) return;
    const clampedVoice = Math.max(0, Math.min(7, voiceIndex));
    this.workletNode.port.postMessage({
      type: 'loadSample',
      voice: clampedVoice,
      data: data.buffer.slice(0),
      size: data.length,
    }, [data.buffer.slice(0)]);
  }

  private static readonly PARAM_IDS: Record<string, number> = {
    pitch_fine: 0,
  };

  override setParam(param: string, value: number): void {
    const id = FZSynth.PARAM_IDS[param];
    if (id !== undefined) {
      this.workletNode?.port.postMessage({ type: 'setParam', paramId: id, value });
    }
  }
}

export default FZSynth;
