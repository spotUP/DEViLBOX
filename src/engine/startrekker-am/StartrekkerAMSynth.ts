/**
 * StartrekkerAMSynth.ts - the keyboard voice of a StarTrekker AM instrument.
 *
 * A key plays the instrument through the replayer's OWN note-on, AM envelope and Paula mixer
 * (a second copy of the replayer in the engine's worklet plays the song's module cut down to one
 * row), so it sounds as the song plays that instrument and never starts the song.
 */
import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { useFormatStore } from '@/stores/useFormatStore';
import { StartrekkerAMEngine } from './StartrekkerAMEngine';
import { stPeriodForKey } from './stKeyNote';

export class StartrekkerAMSynth implements DevilboxSynth {
  readonly name = 'StartrekkerAMSynth';
  readonly output: GainNode;
  private engine: StartrekkerAMEngine;
  private instrument = 0;
  private loadedFor: ArrayBuffer | null = null;

  // One engine for every instrument's synth: only the first takes its output (as HippelCoSoSynth).
  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor() {
    this.engine = StartrekkerAMEngine.getInstance();
    this.output = getDevilboxAudioContext().createGain();
    if (!StartrekkerAMSynth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      StartrekkerAMSynth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  async ensureInitialized(): Promise<void> { await this.engine.ready(); }
  /** MOD instrument number (1-based) this synth plays. */
  setInstrumentNumber(n: number): void { this.instrument = n; }
  getEngine(): StartrekkerAMEngine { return this.engine; }

  /** The loaded song's module and AM data become the engine's keyboard copy (once per song). */
  private loadModule(): void {
    const { startrekkerAMFileData: mod, startrekkerAMNtData: nt } = useFormatStore.getState();
    if (!mod || !nt || mod === this.loadedFor) return;
    this.engine.previewLoad(mod.slice(0), nt.slice(0));
    this.loadedFor = mod;
  }

  triggerAttack(note?: string | number, _time?: number, _velocity?: number): void {
    if (this.instrument <= 0 || note === undefined) return;
    this.loadModule();
    const period = stPeriodForKey(typeof note === 'string' ? noteToMidi(note) : note);
    if (period > 0) this.engine.noteOn(this.instrument, period);
  }
  triggerRelease(): void { this.engine.noteOff(); }
  releaseAll(): void { this.engine.noteOff(); }
  set(_param: string, _value: number): void {}
  dispose(): void {
    if (!this._ownsEngineConnection) return;
    try { this.engine.output.disconnect(this.output); } catch { /* already disconnected */ }
    StartrekkerAMSynth._engineConnectedToSynth = false;
    this._ownsEngineConnection = false;
  }
}
