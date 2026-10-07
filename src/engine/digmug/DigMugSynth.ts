/**
 * DigMugSynth.ts - the keyboard voice of a Digital Mugician instrument.
 *
 * A key plays the instrument through the replayer's OWN note-on, volume and pitch envelopes,
 * arpeggio and instrument effects (digmug.c: dm_preview_note), on a second copy of the module held
 * by the engine's worklet, so it sounds as the song plays it and never starts the song.
 */
import type { DevilboxSynth } from '@/types/synth';
import type { DigMugConfig } from '@/types/instrument';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { useFormatStore } from '@/stores/useFormatStore';
import { DigMugEngine } from './DigMugEngine';
import { dmNoteForKey } from './dmKeyNote';

export class DigMugSynth implements DevilboxSynth {
  private engine: DigMugEngine;
  readonly output: GainNode;
  readonly name = 'DigMugSynth';
  private sampleIndex = 0;
  private fineTune = 0;
  private loadedFor: ArrayBuffer | null = null;

  // One engine for every instrument's synth: only the first takes its output (as HippelCoSoSynth).
  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor(_audioContext?: AudioContext) {
    this.engine = DigMugEngine.getInstance();
    this.output = getDevilboxAudioContext().createGain();
    if (!DigMugSynth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      DigMugSynth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  async ensureInitialized(): Promise<void> { await this.engine.ready(); }
  getEngine(): DigMugEngine { return this.engine; }
  set(_param: string, _value: number): void {}

  async setInstrument(config: DigMugConfig): Promise<void> {
    this.sampleIndex = config.sampleIndex ?? 0;
    this.fineTune = config.fineTune ?? 0;
    await this.engine.ready();
    this.loadModule();
  }

  /** The loaded song's bytes become the engine's keyboard copy (once per song). */
  private loadModule(): void {
    const data = useFormatStore.getState().digMugFileData;
    if (!data || data === this.loadedFor) return;
    this.engine.previewLoad(data.slice(0));
    this.loadedFor = data;
  }

  triggerAttack(note?: string | number, _time?: number, _velocity?: number): void {
    if (this.sampleIndex <= 0 || note === undefined) return;
    this.loadModule();
    this.engine.noteOn(this.sampleIndex, dmNoteForKey(typeof note === 'string' ? noteToMidi(note) : note, this.fineTune));
  }
  triggerRelease(): void { this.engine.noteOff(); }
  releaseAll(): void { this.engine.noteOff(); }
  dispose(): void {
    if (!this._ownsEngineConnection) return;
    try { this.engine.output.disconnect(this.output); } catch { /* already disconnected */ }
    DigMugSynth._engineConnectedToSynth = false;
    this._ownsEngineConnection = false;
  }
}
