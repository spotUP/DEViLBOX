/**
 * DavidWhittakerSynth.ts — Stub for DavidWhittaker synth interface
 * The DavidWhittaker format now uses a whole-song WASM replayer (DavidWhittakerEngine).
 * This stub preserves the class interface for existing references.
 */
import { DavidWhittakerEngine } from './DavidWhittakerEngine';

export class DavidWhittakerSynth {
  private engine: DavidWhittakerEngine;
  readonly output: GainNode;
  readonly name = 'DavidWhittakerSynth';

  constructor(_audioContext?: AudioContext) {
    this.engine = DavidWhittakerEngine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): DavidWhittakerEngine { return this.engine; }
  set(_param: string, _value: number): void {}
  async setInstrument(_data: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
