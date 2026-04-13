/**
 * SonicArrangerSynth.ts — Stub for Sonic Arranger synth interface
 *
 * The Sonic Arranger format now uses a whole-song WASM replayer (SonicArrangerEngine)
 * instead of per-instrument synthesis. This stub preserves the class interface for
 * existing UI controls and InstrumentFactory references.
 */

import { SonicArrangerEngine } from './SonicArrangerEngine';

export class SonicArrangerSynth {
  private engine: SonicArrangerEngine;
  readonly output: GainNode;
  readonly name = 'SonicArrangerSynth';

  constructor(_audioContext?: AudioContext) {
    this.engine = SonicArrangerEngine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> {
    return this.engine.ready();
  }

  getEngine(): SonicArrangerEngine {
    return this.engine;
  }

  set(_param: string, _value: number): void {
    // No-op: whole-song replayer handles all synthesis internally
  }

  async setInstrument(_instrumentData: unknown): Promise<void> {
    // No-op: whole-song replayer loads the entire file, not individual instruments
  }

  triggerAttack(_note: number, _velocity?: number): void {
    // No-op: whole-song replayer handles note triggering internally
  }

  triggerRelease(): void {
    // No-op
  }

  dispose(): void {
    // Engine is singleton, don't dispose here
  }
}
