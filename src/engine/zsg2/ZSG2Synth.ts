import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';

/**
 * ZSG2Synth - ZOOM ZSG-2 48-Channel ROM Sampler (WASM)
 * Stub — WASM binary not yet compiled.
 */
export class ZSG2Synth extends MAMEBaseSynth {
  readonly name = 'ZSG2Synth';
  protected readonly chipName = 'ZSG2';
  protected readonly workletFile = 'ZSG2.worklet.js';
  protected readonly processorName = 'zsg2-processor';

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
