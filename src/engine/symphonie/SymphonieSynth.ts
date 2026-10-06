/**
 * SymphonieSynth.ts — DevilboxSynth wrapper for Symphonie Pro engine
 *
 * Implements the DevilboxSynth interface for Symphonie Pro song playback.
 * Delegates to SymphonieEngine, which manages the AudioWorklet singleton.
 *
 * Unlike instrument-based synths (TFMX, SoundMon), SymphonieSynth plays
 * a full song — it loads SymphoniePlaybackData and controls play/stop/volume.
 */

import type { DevilboxSynth } from '@/types/synth';
import type { SymphoniePlaybackData } from './SymphoniePlaybackData';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import { keyOnWholeSongPlayer } from '../wholeSongKeyboard';
import { SymphonieEngine } from './SymphonieEngine';

export interface SymphonieLoadConfig {
  symphonie: SymphoniePlaybackData;
}

export class SymphonieSynth implements DevilboxSynth {
  readonly name = 'SymphonieSynth';
  readonly output: GainNode;

  private engine: SymphonieEngine;
  private audioContext: AudioContext;
  private _disposed = false;

  private _ownsEngineConnection = false;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this.engine = SymphonieEngine.getInstance();
  }

  async load(config: SymphonieLoadConfig): Promise<void> {
    await this.engine.loadSong(this.audioContext, config.symphonie);

    // Connect engine node to our output after load (node is (re-)created by loadSong)
    const node = this.engine.getNode();
    if (node) {
      if (this._ownsEngineConnection) {
        // Disconnect old node — it may have been replaced
        try { node.disconnect(this.output); } catch { /* ignore */ }
      }
      node.connect(this.output);
      this._ownsEngineConnection = true;
    }
  }

  play(): void {
    if (this._disposed) return;
    this.engine.play();
  }

  stop(): void {
    if (this._disposed) return;
    this.engine.stop();
  }

  /** A key plays nothing: the whole-song player has no single-instrument voice, and must not start the song. */
  triggerAttack(_note?: string | number, _time?: number, _velocity?: number): void {
    if (this._disposed) return;
    keyOnWholeSongPlayer('Symphonie');
  }

  /** A key-up never stops the song. */
  triggerRelease(_note?: string | number, _time?: number): void {}

  set(param: string, value: number): void {
    switch (param) {
      case 'volume':
        this.output.gain.value = Math.max(0, Math.min(1, value));
        this.engine.setVolume(Math.max(0, Math.min(1, value)));
        break;
    }
  }

  get(param: string): number | undefined {
    if (param === 'volume') return this.output.gain.value;
    return undefined;
  }

  getEngine(): SymphonieEngine {
    return this.engine;
  }

  dispose(): void {
    this._disposed = true;
    this.engine.stop();

    if (this._ownsEngineConnection) {
      const node = this.engine.getNode();
      if (node) {
        try { node.disconnect(this.output); } catch { /* may already be disconnected */ }
      }
      this._ownsEngineConnection = false;
    }

    this.engine.dispose();
  }
}
