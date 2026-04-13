/**
 * SynthesisSynth.ts — Stub for Synthesis synth interface
 * The Synthesis format now uses a whole-song WASM replayer (SynthesisEngine).
 * This stub preserves the class interface for existing references.
 */
import { SynthesisEngine } from './SynthesisEngine';

export class SynthesisSynth {
  private engine: SynthesisEngine;
  readonly output: GainNode;
  readonly name = 'SynthesisSynth';

  constructor(_audioContext?: AudioContext) {
    this.engine = SynthesisEngine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): SynthesisEngine { return this.engine; }
  set(_param: string, _value: number): void {}
  async setInstrument(_data: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
