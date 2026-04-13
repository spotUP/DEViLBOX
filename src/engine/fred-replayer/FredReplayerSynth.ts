/**
 * FredReplayerSynth.ts — Stub for FredReplayer synth interface
 * The FredReplayer format now uses a whole-song WASM replayer (FredReplayerEngine).
 * This stub preserves the class interface for existing references.
 */
import { FredReplayerEngine } from './FredReplayerEngine';

export class FredReplayerSynth {
  private engine: FredReplayerEngine;
  readonly output: GainNode;
  readonly name = 'FredReplayerSynth';

  constructor(_audioContext?: AudioContext) {
    this.engine = FredReplayerEngine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): FredReplayerEngine { return this.engine; }
  set(_param: string, _value: number): void {}
  async setInstrument(_data: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
