/**
 * SoundMonSynth.ts — Stub for SoundMon synth interface
 * The SoundMon format now uses a whole-song WASM replayer (SoundMonEngine).
 * This stub preserves the class interface for existing references.
 */
import { SoundMonEngine } from './SoundMonEngine';

export class SoundMonSynth {
  private engine: SoundMonEngine;
  readonly output: GainNode;
  readonly name = 'SoundMonSynth';

  constructor(_audioContext?: AudioContext) {
    this.engine = SoundMonEngine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): SoundMonEngine { return this.engine; }
  set(_param: string, _value: number): void {}
  async setInstrument(_data: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
