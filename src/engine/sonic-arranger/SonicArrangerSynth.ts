/**
 * SonicArrangerSynth.ts — Sonic Arranger synth interface with automation param routing
 * Routes params via SonicArrangerEngine.setInstrumentParam() → WASM _sa_set_instrument_param()
 */

import { SonicArrangerEngine } from './SonicArrangerEngine';

export class SonicArrangerSynth {
  private engine: SonicArrangerEngine;
  readonly output: GainNode;
  readonly name = 'SonicArrangerSynth';

  constructor(_audioContext?: AudioContext) {
    this.engine = SonicArrangerEngine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> {
    return this.engine.ready();
  }

  getEngine(): SonicArrangerEngine {
    return this.engine;
  }

  set(param: string, value: number): void {
    switch (param) {
      case 'volume':
        this.output.gain.value = Math.max(0, Math.min(1, value));
        this.engine.setInstrumentParam(0, 'volume', Math.round(value * 64));
        break;
      case 'vibratoSpeed':
        this.engine.setInstrumentParam(0, 'vibratoSpeed', Math.round(value * 255));
        break;
      case 'vibratoLevel':
        this.engine.setInstrumentParam(0, 'vibratoLevel', Math.round(value * 255));
        break;
      case 'vibratoDelay':
        this.engine.setInstrumentParam(0, 'vibratoDelay', Math.round(value * 255));
        break;
      case 'portamentoSpeed':
        this.engine.setInstrumentParam(0, 'portamentoSpeed', Math.round(value * 255));
        break;
      case 'fineTuning':
        // -1..1 → -128..128
        this.engine.setInstrumentParam(0, 'fineTuning', Math.round(value * 128));
        break;
      case 'effect':
        this.engine.setInstrumentParam(0, 'effect', Math.round(value));
        break;
      case 'effectArg1':
        this.engine.setInstrumentParam(0, 'effectArg1', Math.round(value * 255));
        break;
    }
  }

  async setInstrument(_instrumentData: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
