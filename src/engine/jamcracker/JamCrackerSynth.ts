/**
 * JamCrackerSynth.ts - DevilboxSynth wrapper for JamCracker Pro engine
 *
 * Supports both whole-song playback and per-note instrument preview.
 * triggerAttack with a note → per-instrument preview via jc_note_on
 * triggerAttack without note → whole-song playback via jc_render
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { JamCrackerEngine } from './JamCrackerEngine';

export class JamCrackerSynth implements DevilboxSynth {
  readonly name = 'JamCrackerSynth';
  readonly output: GainNode;

  private engine: JamCrackerEngine;
  private audioContext: AudioContext;
  private _disposed = false;
  private _instrumentIndex = 0;  // 0-based instrument for preview

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

  triggerAttack(note?: string | number, _time?: number, velocity?: number): void {
    if (this._disposed) return;

    if (note !== undefined) {
      // Per-note instrument preview
      let midiNote: number;
      if (typeof note === 'string') {
        midiNote = noteToMidi(note);
      } else {
        midiNote = note;
      }
      // Convert MIDI note to JamCracker note (1-36): JC note 1 = C-1 = MIDI 24
      const jcNote = Math.max(1, Math.min(36, midiNote - 23));
      const vol = Math.round((velocity ?? 0.8) * 64);
      this.engine.noteOn(this._instrumentIndex, jcNote, vol);
    } else {
      // Whole-song playback
      this.engine.play();
    }
  }

  triggerRelease(_note?: string | number, _time?: number): void {
    if (this._disposed) return;
    this.engine.noteOff();
  }

  releaseAll(): void {
    this.triggerRelease();
  }

  set(param: string, value: number): void {
    switch (param) {
      case 'volume':
        this.output.gain.value = Math.max(0, Math.min(1, value));
        break;
      case 'instrumentIndex':
        this._instrumentIndex = Math.max(0, Math.round(value));
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
