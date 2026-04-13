/**
 * DeltaMusic1Synth.ts — Stub for DeltaMusic1 synth interface
 * The DeltaMusic1 format now uses a whole-song WASM replayer (DeltaMusic1Engine).
 * This stub preserves the class interface for existing references.
 */
import { DeltaMusic1Engine } from './DeltaMusic1Engine';

export class DeltaMusic1Synth {
  private engine: DeltaMusic1Engine;
  readonly output: GainNode;
  readonly name = 'DeltaMusic1Synth';

  constructor(_audioContext?: AudioContext) {
    this.engine = DeltaMusic1Engine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): DeltaMusic1Engine { return this.engine; }
  set(_param: string, _value: number): void {}
  async setInstrument(_data: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
