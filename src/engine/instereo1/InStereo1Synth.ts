/**
 * InStereo1Synth.ts — Stub for InStereo1 synth interface
 * The InStereo1 format now uses a whole-song WASM replayer (InStereo1Engine).
 * This stub preserves the class interface for existing references.
 */
import { InStereo1Engine } from './InStereo1Engine';

export class InStereo1Synth {
  private engine: InStereo1Engine;
  readonly output: GainNode;
  readonly name = 'InStereo1Synth';

  constructor(_audioContext?: AudioContext) {
    this.engine = InStereo1Engine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): InStereo1Engine { return this.engine; }
  set(_param: string, _value: number): void {}
  async setInstrument(_data: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
