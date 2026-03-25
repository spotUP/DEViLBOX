import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';

/**
 * KS0164Synth - Samsung KS0164 32-Voice Wavetable ROM (WASM)
 *
 * 32-voice wavetable synth with 16-bit linear + 8-bit compressed sample
 * playback, pitch interpolation, loop, and volume ramping.
 * Bypasses the embedded CPU — drives voice registers directly from MIDI.
 * ROM sample table parsed at load time.
 */
export class KS0164Synth extends MAMEBaseSynth {
  readonly name = 'KS0164Synth';
  protected readonly chipName = 'KS0164';
  protected readonly workletFile = 'KS0164.worklet.js';
  protected readonly processorName = 'ks0164-processor';

  private _romLoadedResolve: (() => void) | null = null;
  private _numSamples = 0;

  constructor() {
    super();
    this.initSynth();
  }

  /** Number of samples found in the ROM descriptor table */
  get numSamples(): number { return this._numSamples; }

  protected handleWorkletMessage(data: Record<string, unknown>): void {
    if (data.type === 'romLoaded') {
      this._numSamples = data.numSamples as number;
      this.romLoaded = true;
      this._updateRomStatus(true);
      if (this._romLoadedResolve) {
        this._romLoadedResolve();
        this._romLoadedResolve = null;
      }
    }
    super.handleWorkletMessage(data);
  }

  /**
   * Load a KS0164 ROM file (e.g. flash.u3, 4MB).
   * The ROM contains firmware (ignored), sample descriptors at 0x8000,
   * and audio data from ~0x8220 onward.
   */
  async loadROMFile(data: ArrayBuffer): Promise<void> {
    await this.ensureInitialized();
    if (!this.workletNode || this._disposed) return;

    return new Promise<void>((resolve) => {
      this._romLoadedResolve = resolve;
      this.workletNode!.port.postMessage(
        { type: 'loadROM', data },
        [data]
      );
      // Timeout fallback
      setTimeout(() => {
        if (this._romLoadedResolve) {
          this._romLoadedResolve();
          this._romLoadedResolve = null;
        }
      }, 5000);
    });
  }

  protected writeKeyOn(note: number, velocity: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'noteOn', note, velocity: Math.floor(velocity * 127) });
  }

  protected writeKeyOff(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'noteOff', note: this.currentNote });
  }

  protected writeFrequency(freq: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setFrequency', freq });
  }

  protected writeVolume(volume: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setVolume', value: Math.round(volume * 255) });
  }

  protected writePanning(pan: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setPanning', pan });
  }

  private static readonly PARAM_IDS: Record<string, number> = {
    volume: 0, attack: 1, release: 2,
  };

  setParam(param: string, value: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'setParam', args: [param, value] });
      return;
    }
    if (!this.workletNode || this._disposed) return;
    const paramId = KS0164Synth.PARAM_IDS[param];
    if (paramId !== undefined) {
      this.workletNode.port.postMessage({ type: 'setParameter', paramId, value });
    }
  }
}
