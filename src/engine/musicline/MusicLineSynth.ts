/**
 * MusicLineSynth.ts - DevilboxSynth wrapper for MusicLine Editor engine
 *
 * Two modes of operation:
 * 1. Song playback: if inst.metadata.mlSongData is a Uint8Array, triggerAttack
 *    loads and plays the full .ml song. triggerRelease stops playback.
 * 2. Instrument preview: triggerAttack sends a note-on to the WASM preview engine
 *    using inst.metadata.mlInstIdx as the instrument index. triggerRelease sends
 *    note-off for that instrument.
 *
 * Mode is determined at triggerAttack time based on the instrument metadata
 * passed via loadInstrument().
 */

import type { DevilboxSynth } from '@/types/synth';
import type { InstrumentConfig } from '@/types/instrument';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { MusicLineEngine } from './MusicLineEngine';

export class MusicLineSynth implements DevilboxSynth {
  readonly name = 'MusicLineSynth';
  readonly output: GainNode;

  private engine: MusicLineEngine;
  private audioContext: AudioContext;
  private _disposed = false;

  /** Last instrument passed to loadInstrument() */
  private _instrument: InstrumentConfig | null = null;

  /**
   * Track whether the singleton engine output is already connected to a
   * MusicLineSynth output. Only the FIRST instance bridges the engine audio
   * into the Tone.js graph — additional instances share the same routing
   * and avoid duplicate connections that would multiply the volume.
   */
  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this.engine = MusicLineEngine.getInstance();

    // Only the first live MusicLineSynth bridges engine → synth output.
    if (!MusicLineSynth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      MusicLineSynth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  /**
   * Attach an instrument config so triggerAttack knows which mode to use.
   * Call this before triggering notes.
   */
  loadInstrument(inst: InstrumentConfig): void {
    this._instrument = inst;
  }

  triggerAttack(note?: string | number, _time?: number, velocity?: number): void {
    if (this._disposed) return;

    const inst = this._instrument;
    const mlSongData = inst?.metadata?.mlSongData;

    if (mlSongData instanceof Uint8Array) {
      // Song playback mode: load and play the full .ml file
      this.engine
        .loadSong(mlSongData)
        .then(() => this.engine.play())
        .catch((err) => console.error('[MusicLineSynth] loadSong failed:', err));
    } else {
      // Instrument preview mode: trigger a single note on the WASM preview engine
      const instIdx: number = inst?.metadata?.mlInstIdx ?? 0;

      let midiNote: number;
      if (typeof note === 'string') {
        midiNote = noteToMidi(note);
      } else if (typeof note === 'number') {
        midiNote = note;
      } else {
        midiNote = 60; // default middle C
      }

      const vel = Math.round((velocity ?? 1) * 127);
      this.engine.previewNoteOn(instIdx, midiNote, vel);
    }
  }

  triggerRelease(note?: string | number, _time?: number): void {
    if (this._disposed) return;

    const inst = this._instrument;
    const mlSongData = inst?.metadata?.mlSongData;

    if (mlSongData instanceof Uint8Array) {
      // Song playback mode
      this.engine.stop();
    } else {
      // Instrument preview mode
      const instIdx: number = inst?.metadata?.mlInstIdx ?? 0;
      this.engine.previewNoteOff(instIdx);
    }
  }

  /**
   * Release all voices / stop all playback (panic button).
   */
  releaseAll(): void {
    if (this._disposed) return;
    this.engine.stop();
    this.engine.previewStop();
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

  getEngine(): MusicLineEngine {
    return this.engine;
  }

  dispose(): void {
    this._disposed = true;

    // Stop everything on the engine
    this.engine.stop();
    this.engine.previewStop();

    // Only disconnect THIS synth's output from the engine — never call
    // engine.output.disconnect() which would sever the singleton's
    // connection to all other destinations.
    if (this._ownsEngineConnection) {
      try {
        this.engine.output.disconnect(this.output);
      } catch { /* may already be disconnected */ }
      MusicLineSynth._engineConnectedToSynth = false;
      this._ownsEngineConnection = false;
    }
  }
}
