/**
 * RonKlarenSynth.ts — Stub for RonKlaren synth interface
 * The RonKlaren format now uses a whole-song WASM replayer (RonKlarenEngine).
 * This stub preserves the class interface for existing references.
 */
import { RonKlarenEngine } from './RonKlarenEngine';

export class RonKlarenSynth {
  private engine: RonKlarenEngine;
  readonly output: GainNode;
  readonly name = 'RonKlarenSynth';

  constructor(_audioContext?: AudioContext) {
    this.engine = RonKlarenEngine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): RonKlarenEngine { return this.engine; }
  set(_param: string, _value: number): void {}
  async setInstrument(_data: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
