/**
 * DavidWhittakerSynth.ts - the keyboard voice of a David Whittaker instrument.
 *
 * A key plays one note of the instrument's sample through the replayer's OWN track
 * reader and frame code (davidwhittaker.c: dw_preview_note), on a second copy of the
 * module held by the engine's worklet, so it sounds as the song plays that sample
 * (the envelope and arpeggio the song pairs with it, the replayer's period maths and
 * mixer level) and never starts the song.
 */
import type { DevilboxSynth } from '@/types/synth';
import type { DavidWhittakerConfig } from '@/types/instrument';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { useFormatStore } from '@/stores/useFormatStore';
import { DavidWhittakerEngine } from './DavidWhittakerEngine';
import { dwNoteForKey } from './dwKeyNote';

export class DavidWhittakerSynth implements DevilboxSynth {
  private engine: DavidWhittakerEngine;
  readonly output: GainNode;
  readonly name = 'DavidWhittakerSynth';
  private sampleIndex = -1;
  private loadedFor: ArrayBuffer | null = null;

  // The engine is a singleton shared by every instrument's synth: only the first one
  // takes its output (as HippelCoSoSynth does), or each key would sound once per instrument.
  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor(_audioContext?: AudioContext) {
    this.engine = DavidWhittakerEngine.getInstance();
    this.output = getDevilboxAudioContext().createGain();
    if (!DavidWhittakerSynth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      DavidWhittakerSynth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  async ensureInitialized(): Promise<void> { await this.engine.ready(); }
  getEngine(): DavidWhittakerEngine { return this.engine; }
  set(_param: string, _value: number): void {}

  async setInstrument(config: DavidWhittakerConfig): Promise<void> {
    this.sampleIndex = config.sampleIndex ?? -1;
    await this.engine.ready();
    this.loadModule();
  }

  /** The loaded song's bytes become the engine's keyboard copy (once per song). */
  private loadModule(): void {
    const data = useFormatStore.getState().davidWhittakerFileData;
    if (!data || data === this.loadedFor) return;
    this.engine.previewLoad(data.slice(0));
    this.loadedFor = data;
  }

  triggerAttack(note?: string | number, _time?: number, _velocity?: number): void {
    if (this.sampleIndex < 0 || note === undefined) return;
    this.loadModule();
    const midi = typeof note === 'string' ? noteToMidi(note) : note;
    this.engine.noteOn(this.sampleIndex, dwNoteForKey(midi));
  }
  triggerRelease(): void { this.engine.noteOff(); }
  releaseAll(): void { this.engine.noteOff(); }
  dispose(): void {
    if (!this._ownsEngineConnection) return;
    try { this.engine.output.disconnect(this.output); } catch { /* already disconnected */ }
    DavidWhittakerSynth._engineConnectedToSynth = false;
    this._ownsEngineConnection = false;
  }
}
