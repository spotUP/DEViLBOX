/**
 * KlysSynth.ts - DevilboxSynth wrapper for klystrack engine
 *
 * Song playback mode: triggerAttack starts playback, triggerRelease stops.
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import { KlysEngine } from './KlysEngine';

export class KlysSynth implements DevilboxSynth {
  readonly name = 'KlysSynth';
  readonly output: GainNode;

  private engine: KlysEngine;
  private audioContext: AudioContext;
  private _disposed = false;

  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this.engine = KlysEngine.getInstance();

    if (!KlysSynth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      KlysSynth._engineConnectedToSynth = true;
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
        this.engine.setInstrumentParam(0, 10, Math.round(value * 128));
        break;
      case 'attack': this.engine.setInstrumentParam(0, 0, Math.round(value * 31)); break;
      case 'decay': this.engine.setInstrumentParam(0, 1, Math.round(value * 31)); break;
      case 'sustain': this.engine.setInstrumentParam(0, 2, Math.round(value * 31)); break;
      case 'release': this.engine.setInstrumentParam(0, 3, Math.round(value * 31)); break;
      case 'pulseWidth': this.engine.setInstrumentParam(0, 9, Math.round(value * 2047)); break;
      case 'finetune': this.engine.setInstrumentParam(0, 7, Math.round(value * 127)); break;
      case 'slideSpeed': this.engine.setInstrumentParam(0, 8, Math.round(value * 255)); break;
      case 'cutoff': this.engine.setInstrumentParam(0, 16, Math.round(value * 2047)); break;
      case 'resonance': this.engine.setInstrumentParam(0, 17, Math.round(value * 15)); break;
      case 'vibratoSpeed': this.engine.setInstrumentParam(0, 12, Math.round(value * 255)); break;
      case 'vibratoDepth': this.engine.setInstrumentParam(0, 13, Math.round(value * 255)); break;
      case 'pwmSpeed': this.engine.setInstrumentParam(0, 14, Math.round(value * 255)); break;
      case 'pwmDepth': this.engine.setInstrumentParam(0, 15, Math.round(value * 255)); break;
      case 'fmMod': this.engine.setInstrumentParam(0, 24, Math.round(value * 127)); break;
      case 'fmFeedback': this.engine.setInstrumentParam(0, 25, Math.round(value * 15)); break;
    }
  }

  get(param: string): number | undefined {
    switch (param) {
      case 'volume':
        return this.output.gain.value;
    }
    return undefined;
  }

  getEngine(): KlysEngine {
    return this.engine;
  }

  dispose(): void {
    this._disposed = true;

    if (this._ownsEngineConnection) {
      try {
        this.engine.output.disconnect(this.output);
      } catch { /* may already be disconnected */ }
      KlysSynth._engineConnectedToSynth = false;
      this._ownsEngineConnection = false;
    }
  }
}
