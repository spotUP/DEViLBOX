/**
 * InStereo2Synth.ts — Stub for InStereo2 synth interface
 * The InStereo2 format now uses a whole-song WASM replayer (InStereo2Engine).
 * This stub preserves the class interface for existing references.
 */
import { InStereo2Engine } from './InStereo2Engine';

export class InStereo2Synth {
  private engine: InStereo2Engine;
  readonly output: GainNode;
  readonly name = 'InStereo2Synth';

  constructor(_audioContext?: AudioContext) {
    this.engine = InStereo2Engine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): InStereo2Engine { return this.engine; }
  set(_param: string, _value: number): void {}
  async setInstrument(_data: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
