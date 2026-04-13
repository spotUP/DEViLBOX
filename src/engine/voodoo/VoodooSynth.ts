/**
 * VoodooSynth.ts — Stub for Voodoo synth interface
 * The Voodoo format now uses a whole-song WASM replayer (VoodooEngine).
 * This stub preserves the class interface for existing references.
 */
import { VoodooEngine } from './VoodooEngine';

export class VoodooSynth {
  private engine: VoodooEngine;
  readonly output: GainNode;
  readonly name = 'VoodooSynth';

  constructor(_audioContext?: AudioContext) {
    this.engine = VoodooEngine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): VoodooEngine { return this.engine; }
  set(_param: string, _value: number): void {}
  async setInstrument(_data: unknown): Promise<void> {}
  triggerAttack(_note: number, _velocity?: number): void {}
  triggerRelease(): void {}
  dispose(): void {}
}
