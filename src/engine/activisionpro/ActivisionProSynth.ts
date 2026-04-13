/**
 * ActivisionProSynth.ts — Stub for ActivisionPro synth interface
 * The ActivisionPro format now uses a whole-song WASM replayer (ActivisionProEngine).
 * This stub preserves the class interface for existing references.
 */
import { ActivisionProEngine } from './ActivisionProEngine';

export class ActivisionProSynth {
  private engine: ActivisionProEngine;
  readonly output: GainNode;
  readonly name = 'ActivisionProSynth';

  constructor(_audioContext?: AudioContext) {
    this.engine = ActivisionProEngine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): ActivisionProEngine { return this.engine; }
  set(_param: string, _value: number): void {}
  async setInstrument(_data: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
