/**
 * FaceTheMusicSynth.ts — Stub for FaceTheMusic synth interface
 * The FaceTheMusic format now uses a whole-song WASM replayer (FaceTheMusicEngine).
 * This stub preserves the class interface for existing references.
 */
import { FaceTheMusicEngine } from './FaceTheMusicEngine';

export class FaceTheMusicSynth {
  private engine: FaceTheMusicEngine;
  readonly output: GainNode;
  readonly name = 'FaceTheMusicSynth';

  constructor(_audioContext?: AudioContext) {
    this.engine = FaceTheMusicEngine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): FaceTheMusicEngine { return this.engine; }
  set(_param: string, _value: number): void {}
  async setInstrument(_data: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
