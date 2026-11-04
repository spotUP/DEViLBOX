/**
 * JxsSynth.ts - the keyboard voice of a JayTrax instrument.
 *
 * A key plays the instrument through the replayer's OWN strike, instrument update and effects
 * (jxs_engine.cpp: jxs_preview_note), on a second copy of the module held by the engine's worklet,
 * so it sounds as the song plays it and never starts the song.
 */
import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { useFormatStore } from '@/stores/useFormatStore';
import { JxsEngine } from './JxsEngine';

/** The grid's note number (what a cell carries) a MIDI key plays: the grid shows note 1 as MIDI 12. */
export function jxsNoteForKey(midi: number): number {
  return Math.max(1, Math.min(127, midi - 11));
}

export class JxsSynth implements DevilboxSynth {
  private engine: JxsEngine;
  readonly output: GainNode;
  readonly name = 'JxsSynth';
  private loadedFor: ArrayBuffer | null = null;
  private instrumentNumber: number;

  // One engine for every instrument's synth: only the first takes its output (as DigMugSynth).
  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  /** `instrumentNumber`: the 1-based JayTrax instrument (the number the grid cells carry). */
  constructor(instrumentNumber: number) {
    this.instrumentNumber = instrumentNumber;
    this.engine = JxsEngine.getInstance();
    this.output = getDevilboxAudioContext().createGain();
    if (!JxsSynth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      JxsSynth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  async ensureInitialized(): Promise<void> { await this.engine.ready(); this.loadModule(); }
  getEngine(): JxsEngine { return this.engine; }
  set(_param: string, _value: number): void {}

  /** The loaded song's bytes become the engine's keyboard copy (once per song). */
  private loadModule(): void {
    const data = useFormatStore.getState().jxsFileData;
    if (!data || data === this.loadedFor) return;
    this.engine.previewLoad(data.slice(0));
    this.loadedFor = data;
  }

  triggerAttack(note?: string | number, time?: number, _velocity?: number): void {
    if (this.instrumentNumber <= 0 || note === undefined) return;
    this.loadModule();
    this.engine.noteOn(this.instrumentNumber, jxsNoteForKey(typeof note === 'string' ? noteToMidi(note) : note), time);
  }
  triggerRelease(_note?: string | number, time?: number): void { this.engine.noteOff(time); }
  releaseAll(): void { this.engine.noteOff(); }
  dispose(): void {
    if (!this._ownsEngineConnection) return;
    try { this.engine.output.disconnect(this.output); } catch { /* already disconnected */ }
    JxsSynth._engineConnectedToSynth = false;
    this._ownsEngineConnection = false;
  }
}
