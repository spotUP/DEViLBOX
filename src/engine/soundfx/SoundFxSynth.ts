/**
 * SoundFxSynth.ts — Stub for SoundFx synth interface
 * The SoundFx format now uses a whole-song WASM replayer (SoundFxEngine).
 * This stub preserves the class interface for existing references.
 */
import { SoundFxEngine } from './SoundFxEngine';

export class SoundFxSynth {
  private engine: SoundFxEngine;
  readonly output: GainNode;
  readonly name = 'SoundFxSynth';

  constructor(_audioContext?: AudioContext) {
    this.engine = SoundFxEngine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): SoundFxEngine { return this.engine; }
  set(_param: string, _value: number): void {}
  async setInstrument(_data: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
