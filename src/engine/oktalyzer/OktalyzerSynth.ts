/**
 * OktalyzerSynth.ts — Stub for Oktalyzer synth interface
 * The Oktalyzer format now uses a whole-song WASM replayer (OktalyzerEngine).
 * This stub preserves the class interface for existing references.
 */
import { OktalyzerEngine } from './OktalyzerEngine';

export class OktalyzerSynth {
  private engine: OktalyzerEngine;
  readonly output: GainNode;
  readonly name = 'OktalyzerSynth';

  constructor(_audioContext?: AudioContext) {
    this.engine = OktalyzerEngine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): OktalyzerEngine { return this.engine; }
  set(_param: string, _value: number): void {}
  async setInstrument(_data: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
