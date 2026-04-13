/**
 * FutureComposerSynth.ts — Stub for FutureComposer synth interface
 * The FutureComposer format now uses a whole-song WASM replayer (FutureComposerEngine).
 * This stub preserves the class interface for existing references.
 */
import { FutureComposerEngine } from './FutureComposerEngine';

export class FutureComposerSynth {
  private engine: FutureComposerEngine;
  readonly output: GainNode;
  readonly name = 'FutureComposerSynth';

  constructor(_audioContext?: AudioContext) {
    this.engine = FutureComposerEngine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): FutureComposerEngine { return this.engine; }
  set(_param: string, _value: number): void {}
  async setInstrument(_data: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
