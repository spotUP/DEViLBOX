/**
 * DeltaMusic1Synth.ts - the keyboard voice of a Delta Music 1 instrument.
 *
 * A key plays the instrument through the replayer's OWN note handling, envelope, vibrato, arpeggio and
 * sound table (deltamusic1.c: dm1_preview_note), on a second copy of the module held by the engine's
 * worklet, so it sounds as the song plays it and never starts the song.
 */
import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { useFormatStore } from '@/stores/useFormatStore';
import { DeltaMusic1Engine } from './DeltaMusic1Engine';
import { dm1NoteForKey } from './dm1KeyNote';

export class DeltaMusic1Synth implements DevilboxSynth {
  private engine: DeltaMusic1Engine;
  readonly output: GainNode;
  readonly name = 'DeltaMusic1Synth';
  private instrumentIndex = -1;
  private loadedFor: ArrayBuffer | null = null;

  // One engine for every instrument's synth: only the first takes its output (as HippelCoSoSynth).
  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor(_audioContext?: AudioContext) {
    this.engine = DeltaMusic1Engine.getInstance();
    this.output = getDevilboxAudioContext().createGain();
    if (!DeltaMusic1Synth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      DeltaMusic1Synth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  async ensureInitialized(): Promise<void> { await this.engine.ready(); }
  getEngine(): DeltaMusic1Engine { return this.engine; }
  set(_param: string, _value: number): void {}
  /** The grid's instrument number (1-based); the replayer's index is one less. */
  setInstrumentNumber(n: number): void { this.instrumentIndex = n - 1; }

  /** The loaded song's bytes become the engine's keyboard copy (once per song). */
  private loadModule(): void {
    const data = useFormatStore.getState().deltaMusic1FileData;
    if (!data || data === this.loadedFor) return;
    this.engine.previewLoad(data.slice(0));
    this.loadedFor = data;
  }

  triggerAttack(note?: string | number, _time?: number, _velocity?: number): void {
    if (this.instrumentIndex < 0 || note === undefined) return;
    this.loadModule();
    this.engine.noteOn(this.instrumentIndex, dm1NoteForKey(typeof note === 'string' ? noteToMidi(note) : note));
  }
  triggerRelease(): void { this.engine.noteOff(); }
  releaseAll(): void { this.engine.noteOff(); }
  dispose(): void {
    if (!this._ownsEngineConnection) return;
    try { this.engine.output.disconnect(this.output); } catch { /* already disconnected */ }
    DeltaMusic1Synth._engineConnectedToSynth = false;
    this._ownsEngineConnection = false;
  }
}
