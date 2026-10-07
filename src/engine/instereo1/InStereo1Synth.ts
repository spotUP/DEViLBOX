/**
 * InStereo1Synth.ts - the keyboard voice of a InStereo! 1.0 instrument.
 *
 * A key plays the instrument through the replayer's OWN note handling, ADSR, EGC, vibrato, portamento and
 * arpeggio (instereo1.c: is1_preview_note), on a second copy of the module held by the engine's
 * worklet, so it sounds as the song plays it and never starts the song.
 */
import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { useFormatStore } from '@/stores/useFormatStore';
import { InStereo1Engine } from './InStereo1Engine';
import { saNoteForKey } from '@/engine/sonic-arranger/saKeyNote';

export class InStereo1Synth implements DevilboxSynth {
  private engine: InStereo1Engine;
  readonly output: GainNode;
  readonly name = 'InStereo1Synth';
  private instrumentNumber = 0;
  private loadedFor: ArrayBuffer | null = null;

  // One engine for every instrument's synth: only the first takes its output (as HippelCoSoSynth).
  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor(_audioContext?: AudioContext) {
    this.engine = InStereo1Engine.getInstance();
    this.output = getDevilboxAudioContext().createGain();
    if (!InStereo1Synth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      InStereo1Synth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  async ensureInitialized(): Promise<void> { await this.engine.ready(); }
  getEngine(): InStereo1Engine { return this.engine; }
  set(_param: string, _value: number): void {}
  /** The grid's instrument number: the replayer's own (1-based). */
  setInstrumentNumber(n: number): void { this.instrumentNumber = n; }

  /** The loaded song's bytes become the engine's keyboard copy (once per song). */
  private loadModule(): void {
    const data = useFormatStore.getState().inStereo1FileData;
    if (!data || data === this.loadedFor) return;
    this.engine.previewLoad(data.slice(0));
    this.loadedFor = data;
  }

  triggerAttack(note?: string | number, _time?: number, _velocity?: number): void {
    if (this.instrumentNumber <= 0 || note === undefined) return;
    this.loadModule();
    this.engine.noteOn(this.instrumentNumber, saNoteForKey(typeof note === 'string' ? noteToMidi(note) : note));
  }
  triggerRelease(): void { this.engine.noteOff(); }
  releaseAll(): void { this.engine.noteOff(); }
  dispose(): void {
    if (!this._ownsEngineConnection) return;
    try { this.engine.output.disconnect(this.output); } catch { /* already disconnected */ }
    InStereo1Synth._engineConnectedToSynth = false;
    this._ownsEngineConnection = false;
  }
}
