/**
 * DssSynth.ts — Stub for Dss synth interface
 * The Dss format now uses a whole-song WASM replayer (DssEngine).
 * This stub preserves the class interface for existing references.
 */
import { DssEngine } from './DssEngine';

export class DssSynth {
  private engine: DssEngine;
  readonly output: GainNode;
  readonly name = 'DssSynth';

  constructor(_audioContext?: AudioContext) {
    this.engine = DssEngine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): DssEngine { return this.engine; }
  set(_param: string, _value: number): void {}
  async setInstrument(_data: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
