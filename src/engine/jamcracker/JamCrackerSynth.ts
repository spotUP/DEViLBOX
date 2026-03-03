/**
 * JamCrackerSynth.ts - DevilboxSynth wrapper for JamCracker Pro engine
 *
 * Song playback mode: triggerAttack starts whole-song playback via WASM,
 * triggerRelease stops it. The WASM engine handles all synthesis internally
 * (transpiled 68k replayer + Paula soft emulation).
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import { JamCrackerEngine } from './JamCrackerEngine';

export class JamCrackerSynth implements DevilboxSynth {
  readonly name = 'JamCrackerSynth';
  readonly output: GainNode;

  private engine: JamCrackerEngine;
  private audioContext: AudioContext;
  private _disposed = false;

  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this.engine = JamCrackerEngine.getInstance();

    if (!JamCrackerSynth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      JamCrackerSynth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  triggerAttack(_note?: string | number, _time?: number, _velocity?: number): void {
    if (this._disposed) return;
    this.engine.play();
  }

  triggerRelease(_note?: string | number, _time?: number): void {
    if (this._disposed) return;
    this.engine.stop();
  }

  releaseAll(): void {
    this.triggerRelease();
  }

  set(param: string, value: number): void {
    switch (param) {
      case 'volume':
        this.output.gain.value = Math.max(0, Math.min(1, value));
        break;
    }
  }

  get(param: string): number | undefined {
    switch (param) {
      case 'volume':
        return this.output.gain.value;
    }
    return undefined;
  }

  getEngine(): JamCrackerEngine {
    return this.engine;
  }

  dispose(): void {
    this._disposed = true;
    if (this._ownsEngineConnection) {
      try {
        this.engine.output.disconnect(this.output);
      } catch { /* may already be disconnected */ }
      JamCrackerSynth._engineConnectedToSynth = false;
      this._ownsEngineConnection = false;
    }
  }
}
