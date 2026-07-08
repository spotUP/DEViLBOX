/**
 * MaxTraxSynth.ts - DevilboxSynth wrapper for MaxTrax engine
 *
 * Whole-song playback only — MaxTrax is a full-song replayer, no per-note preview.
 * The engine auto-starts after loadTune(), so triggerAttack is effectively a no-op.
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import { MaxTraxEngine } from './MaxTraxEngine';

export class MaxTraxSynth implements DevilboxSynth {
  readonly name = 'MaxTraxSynth';
  readonly output: GainNode;

  private engine: MaxTraxEngine;
  private audioContext: AudioContext;
  private _disposed = false;

  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this.engine = MaxTraxEngine.getInstance();

    if (!MaxTraxSynth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      MaxTraxSynth._engineConnectedToSynth = true;
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

  getEngine(): MaxTraxEngine {
    return this.engine;
  }

  dispose(): void {
    this._disposed = true;
    if (this._ownsEngineConnection) {
      try {
        this.engine.output.disconnect(this.output);
      } catch { /* may already be disconnected */ }
      MaxTraxSynth._engineConnectedToSynth = false;
      this._ownsEngineConnection = false;
    }
  }
}
