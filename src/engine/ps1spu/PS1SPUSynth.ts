import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';

/**
 * PS1SPUSynth - PlayStation 1 CXD2922BQ SPU (24-voice ADPCM) (WASM)
 * Stub — WASM binary not yet compiled.
 */
export class PS1SPUSynth extends MAMEBaseSynth {
  readonly name = 'PS1SPUSynth';
  protected readonly chipName = 'PS1SPU';
  protected readonly workletFile = 'PS1SPU.worklet.js';
  protected readonly processorName = 'ps1spu-processor';

  constructor() {
    super();
    this.initSynth();
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

  setParam(param: string, value: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'setParam', args: [param, value] });
      return;
    }
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setParameter', param, value });
  }
}
