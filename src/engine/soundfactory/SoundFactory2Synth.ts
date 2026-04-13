/**
 * SoundFactory2Synth.ts — Stub for SoundFactory2 synth interface
 * The SoundFactory2 format now uses a whole-song WASM replayer (SoundFactory2Engine).
 * This stub preserves the class interface for existing references.
 */
import { SoundFactory2Engine } from './SoundFactory2Engine';

export class SoundFactory2Synth {
  private engine: SoundFactory2Engine;
  readonly output: GainNode;
  readonly name = 'SoundFactory2Synth';

  constructor(_audioContext?: AudioContext) {
    this.engine = SoundFactory2Engine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): SoundFactory2Engine { return this.engine; }
  set(_param: string, _value: number): void {}
  async setInstrument(_data: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
