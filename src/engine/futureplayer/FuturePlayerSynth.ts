/**
 * FuturePlayerSynth.ts - DevilboxSynth wrapper for Future Player engine
 *
 * Supports both whole-song playback and per-note instrument preview.
 * triggerAttack with a note → per-instrument preview via fp_note_on
 * triggerAttack without note → whole-song playback via fp_render
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { FuturePlayerEngine } from './FuturePlayerEngine';
import { fpKeyIndexForMidi } from '@/lib/import/formats/fpGrid';

export class FuturePlayerSynth implements DevilboxSynth {
  readonly name = 'FuturePlayerSynth';
  readonly output: GainNode;

  private engine: FuturePlayerEngine;
  private audioContext: AudioContext;
  private _disposed = false;
  private _instrumentPtr = 0;  // raw binary offset for this instrument

  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this.engine = FuturePlayerEngine.getInstance();

    if (!FuturePlayerSynth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      FuturePlayerSynth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  triggerAttack(note?: string | number, _time?: number, velocity?: number): void {
    if (this._disposed) return;

    if (note !== undefined && this._instrumentPtr > 0) {
      // Per-note instrument preview
      let midiNote: number;
      if (typeof note === 'string') {
        midiNote = noteToMidi(note);
      } else {
        midiNote = note;
      }
      // The key stands for the pitch MIDI - 11 (C-0 = 12; MIDI 0..11 = the octave below C-0); the grid shows the
      // pitch the player plays, so the key plays the period table entry of that pitch
      const vol = Math.round((velocity ?? 0.8) * 127);
      this.engine.noteOn(this._instrumentPtr, fpKeyIndexForMidi(midiNote), vol);
    } else if (note === undefined) {
      // Whole-song playback: only an explicit play with no note. A typed key
      // on an instrument without a pointer must stay silent, never start the
      // song (owner: "when I play it it plays the song").
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
      case 'subsong':
        this.engine.setSubsong(Math.floor(value));
        break;
      case 'instrumentPtr':
        this._instrumentPtr = Math.max(0, Math.round(value));
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

  getEngine(): FuturePlayerEngine {
    return this.engine;
  }

  dispose(): void {
    this._disposed = true;
    if (this._ownsEngineConnection) {
      try {
        this.engine.output.disconnect(this.output);
      } catch { /* may already be disconnected */ }
      FuturePlayerSynth._engineConnectedToSynth = false;
      this._ownsEngineConnection = false;
    }
  }
}
