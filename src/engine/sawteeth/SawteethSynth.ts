/**
 * SawteethSynth.ts - DevilboxSynth for keyboard preview of one Sawteeth instrument.
 *
 * Plays through a standalone preview voice inside the Sawteeth WASM replayer
 * (sawteeth_preview_*): the replayer's own oscillator, envelopes, filter and
 * step program, with its own state, separate from the song players.
 *
 * Song playback does NOT come through here: the whole-song engine plays the
 * tune, and TrackerReplayer sets suppressNotes for Sawteeth (wasmEngineRegistry),
 * so pattern notes never reach triggerAttack. Only typed keys and MCP
 * trigger_note do. Preview voices leave the worklet on its second output, wired
 * to this synth's output; the first output (the song) stays on the engine.
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { SawteethEngine } from './SawteethEngine';

/** Replayer note a typed key plays: the grid note, MIDI - 11 (C-0 = MIDI 12 = note 1). */
export function sawteethNoteForKey(midiNote: number): number {
  return Math.max(1, Math.min(96, midiNote - 11));
}

export class SawteethSynth implements DevilboxSynth {
  readonly name = 'SawteethSynth';
  readonly output: GainNode;

  private engine: SawteethEngine;
  private _disposed = false;
  private _handle = -1;
  private _setup: Promise<void> | null = null;
  /** One note waiting for the voice to exist; a release clears it. */
  private _queued: { note?: string | number; velocity?: number } | null = null;

  /** Song instrument index this synth previews (the instrument config id). */
  private readonly instrumentIndex: number;

  constructor(instrumentIndex: number) {
    this.instrumentIndex = instrumentIndex;
    this.output = getDevilboxAudioContext().createGain();
    this.engine = SawteethEngine.getInstance();
  }

  async ensureInitialized(): Promise<void> {
    await this.engine.ready();
  }

  private ensureVoice(): Promise<void> {
    if (!this._setup) {
      this._setup = this.engine.createPreviewPlayer(this.instrumentIndex).then(handle => {
        if (this._disposed) {
          if (handle >= 0) this.engine.destroyPreviewPlayer(handle);
          return;
        }
        this._handle = handle;
        // No voice (no tune loaded): allow a later note to try again.
        if (handle < 0) this._setup = null;
      });
    }
    return this._setup;
  }

  triggerAttack(note?: string | number, _time?: number, velocity?: number): void {
    if (this._disposed) return;
    this.engine.routePreviewTo(this.output);
    if (this._handle >= 0) {
      const midi = typeof note === 'string' ? noteToMidi(note) : typeof note === 'number' ? note : 48;
      const vel = Math.max(64, Math.round((velocity ?? 1) * 127));
      this.engine.previewNoteOn(this._handle, sawteethNoteForKey(midi), vel);
      return;
    }
    const queued = { note, velocity };
    this._queued = queued;
    void this.ensureVoice().then(() => {
      if (this._queued !== queued) return;
      this._queued = null;
      if (!this._disposed && this._handle >= 0) this.triggerAttack(queued.note, undefined, queued.velocity);
    });
  }

  triggerRelease(_note?: string | number, _time?: number): void {
    if (this._disposed) return;
    this._queued = null;
    if (this._handle >= 0) this.engine.previewNoteOff(this._handle);
  }

  releaseAll(): void {
    this.triggerRelease();
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    if (this._handle >= 0) this.engine.destroyPreviewPlayer(this._handle);
    this._handle = -1;
    this.engine.unroutePreview(this.output);
    this.output.disconnect();
  }
}
