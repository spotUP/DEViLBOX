/**
 * GmcSynth.ts — Stub for Gmc synth interface
 * The Gmc format now uses a whole-song WASM replayer (GmcEngine).
 * This stub preserves the class interface for existing references.
 */
import { GmcEngine } from './GmcEngine';

export class GmcSynth {
  private engine: GmcEngine;
  readonly output: GainNode;
  readonly name = 'GmcSynth';

  constructor(_audioContext?: AudioContext) {
    this.engine = GmcEngine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): GmcEngine { return this.engine; }
  set(_param: string, _value: number): void {}
  async setInstrument(_data: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
