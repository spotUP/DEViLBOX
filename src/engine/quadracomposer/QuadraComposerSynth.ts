/**
 * QuadraComposerSynth.ts — Stub for QuadraComposer synth interface
 * The QuadraComposer format now uses a whole-song WASM replayer (QuadraComposerEngine).
 * This stub preserves the class interface for existing references.
 */
import { QuadraComposerEngine } from './QuadraComposerEngine';

export class QuadraComposerSynth {
  private engine: QuadraComposerEngine;
  readonly output: GainNode;
  readonly name = 'QuadraComposerSynth';

  constructor(_audioContext?: AudioContext) {
    this.engine = QuadraComposerEngine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): QuadraComposerEngine { return this.engine; }
  set(_param: string, _value: number): void {}
  async setInstrument(_data: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
