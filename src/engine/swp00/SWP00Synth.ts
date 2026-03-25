import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';

/**
 * SWP00Synth - Yamaha SWP00 AWM2 MU50 (WASM)
 *
 * 32-voice rompler with multi-format sample decoding (16/12/8-bit + DPCM),
 * LFO, Chamberlin LPF, envelope, and volume/pan ramping.
 * Extracted from MAME's swp00 emulator by Olivier Galibert.
 */
export class SWP00Synth extends MAMEBaseSynth {
  readonly name = 'SWP00Synth';
  protected readonly chipName = 'SWP00';
  protected readonly workletFile = 'SWP00.worklet.js';
  protected readonly processorName = 'swp00-processor';

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

  private static readonly PARAM_IDS: Record<string, number> = {
    volume: 0, filter_cutoff: 1, attack: 2, release: 3,
  };

  setParam(param: string, value: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'setParam', args: [param, value] });
      return;
    }
    if (!this.workletNode || this._disposed) return;
    const paramId = SWP00Synth.PARAM_IDS[param];
    if (paramId !== undefined) {
      this.workletNode.port.postMessage({ type: 'setParameter', paramId, value });
    }
  }
}
