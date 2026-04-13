/**
 * DigMugSynth.ts — Stub for DigMug synth interface
 * The DigMug format now uses a whole-song WASM replayer (DigMugEngine).
 * This stub preserves the class interface for existing references.
 */
import { DigMugEngine } from './DigMugEngine';

export class DigMugSynth {
  private engine: DigMugEngine;
  readonly output: GainNode;
  readonly name = 'DigMugSynth';

  constructor(_audioContext?: AudioContext) {
    this.engine = DigMugEngine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): DigMugEngine { return this.engine; }
  set(_param: string, _value: number): void {}
  async setInstrument(_data: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
