/**
 * DeltaMusic2Synth.ts — Stub for DeltaMusic2 synth interface
 * The DeltaMusic2 format now uses a whole-song WASM replayer (DeltaMusic2Engine).
 * This stub preserves the class interface for existing references.
 */
import { DeltaMusic2Engine } from './DeltaMusic2Engine';

export class DeltaMusic2Synth {
  private engine: DeltaMusic2Engine;
  readonly output: GainNode;
  readonly name = 'DeltaMusic2Synth';

  constructor(_audioContext?: AudioContext) {
    this.engine = DeltaMusic2Engine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): DeltaMusic2Engine { return this.engine; }
  set(_param: string, _value: number): void {}
  async setInstrument(_data: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
