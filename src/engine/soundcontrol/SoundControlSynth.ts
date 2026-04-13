/**
 * SoundControlSynth.ts — Stub for SoundControl synth interface
 * The SoundControl format now uses a whole-song WASM replayer (SoundControlEngine).
 * This stub preserves the class interface for existing references.
 */
import { SoundControlEngine } from './SoundControlEngine';

export class SoundControlSynth {
  private engine: SoundControlEngine;
  readonly output: GainNode;
  readonly name = 'SoundControlSynth';

  constructor(_audioContext?: AudioContext) {
    this.engine = SoundControlEngine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): SoundControlEngine { return this.engine; }
  set(_param: string, _value: number): void {}
  async setInstrument(_data: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
