/**
 * ActionamicsSynth.ts — Stub for Actionamics synth interface
 * The Actionamics format now uses a whole-song WASM replayer (ActionamicsEngine).
 * This stub preserves the class interface for existing references.
 */
import { ActionamicsEngine } from './ActionamicsEngine';

export class ActionamicsSynth {
  private engine: ActionamicsEngine;
  readonly output: GainNode;
  readonly name = 'ActionamicsSynth';

  constructor(_audioContext?: AudioContext) {
    this.engine = ActionamicsEngine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): ActionamicsEngine { return this.engine; }
  set(_param: string, _value: number): void {}
  async setInstrument(_data: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
