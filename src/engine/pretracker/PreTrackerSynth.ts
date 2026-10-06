/**
 * PreTrackerSynth.ts - DevilboxSynth wrapper for PreTracker WASM engine
 *
 * Whole-song playback only (no per-note preview).
 * Connects the PreTrackerEngine's audio output to ToneEngine's audio graph.
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import { keyOnWholeSongPlayer } from '../wholeSongKeyboard';
import { PreTrackerEngine } from './PreTrackerEngine';

export class PreTrackerSynth implements DevilboxSynth {
  readonly name = 'PreTrackerSynth';
  readonly output: GainNode;

  private engine: PreTrackerEngine;
  private audioContext: AudioContext;
  private _disposed = false;

  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this.engine = PreTrackerEngine.getInstance();

    if (!PreTrackerSynth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      PreTrackerSynth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  /** A key plays nothing: the whole-song player has no single-instrument voice, and must not start the song. */
  triggerAttack(_note?: string | number, _time?: number, _velocity?: number): void {
    if (this._disposed) return;
    keyOnWholeSongPlayer('PreTracker');
  }

  triggerRelease(_note?: string | number, _time?: number): void {
    // A key-up never stops the song.
  }

  releaseAll(): void {
    // no-op
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

  dispose(): void {
    this._disposed = true;
    if (this._ownsEngineConnection) {
      try {
        this.engine.output.disconnect(this.output);
      } catch { /* may already be disconnected */ }
      PreTrackerSynth._engineConnectedToSynth = false;
      this._ownsEngineConnection = false;
    }
  }
}
