/**
 * UADESynth.ts - DevilboxSynth wrapper for UADE (Universal Amiga Dead-player Engine)
 *
 * Handles playback of 130+ exotic Amiga music formats via the UADE WASM engine.
 * This is a playback-only instrument — pattern editing is not supported for
 * opaque formats like JochenHippel, TFMX, SidMon, etc.
 *
 * Follows the HivelySynth pattern: wraps UADEEngine singleton, connects output.
 */

import type { DevilboxSynth } from '@/types/synth';
import type { UADEConfig } from '@/types/instrument';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import { UADEEngine } from './UADEEngine';

export class UADESynth implements DevilboxSynth {
  readonly name = 'UADESynth';
  readonly output: GainNode;

  private engine: UADEEngine;
  private audioContext: AudioContext;
  private _disposed = false;
  private _currentConfig: UADEConfig | null = null;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this.engine = UADEEngine.getInstance();
    this.engine.output.connect(this.output);
  }

  /**
   * Load a UADE config and prepare the engine for playback.
   * Call this before triggerAttack().
   */
  async setInstrument(config: UADEConfig): Promise<void> {
    this._currentConfig = config;

    await this.engine.ready();
    await this.engine.load(config.fileData, config.filename);

    // Set the requested subsong
    if (config.currentSubsong > 0) {
      this.engine.setSubsong(config.currentSubsong);
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

  /**
   * Release all / stop playback (panic button, song stop, etc.)
   */
  releaseAll(): void {
    this.triggerRelease();
  }

  set(param: string, value: number): void {
    switch (param) {
      case 'volume':
        this.output.gain.value = Math.max(0, Math.min(1, value));
        break;
      case 'subsong':
        this.engine.setSubsong(Math.round(value));
        break;
    }
  }

  get(param: string): number | undefined {
    switch (param) {
      case 'volume':
        return this.output.gain.value;
      case 'subsong':
        return this._currentConfig?.currentSubsong ?? 0;
    }
    return undefined;
  }

  /**
   * Write edited PCM data back into Amiga chip RAM.
   * Called by the instrument editor when the user modifies a sample extracted
   * from an enhanced-mode UADE scan (e.g. changes loop points or trims the sample).
   * @param samplePtr - Amiga chip RAM address stored in UADEConfig.samplePtr
   * @param pcmData   - New 8-bit signed PCM bytes
   */
  setInstrumentSample(samplePtr: number, pcmData: Uint8Array): void {
    this.engine.setInstrumentSample(samplePtr, pcmData);
  }

  getEngine(): UADEEngine {
    return this.engine;
  }

  dispose(): void {
    this._disposed = true;
    this.engine.output.disconnect();
  }
}
