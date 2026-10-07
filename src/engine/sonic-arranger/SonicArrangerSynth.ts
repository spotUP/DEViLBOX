/**
 * SonicArrangerSynth.ts — Sonic Arranger synth interface with automation param routing
 * Routes params via SonicArrangerEngine.setInstrumentParam() → WASM _sa_set_instrument_param()
 */

import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { useFormatStore } from '@/stores/useFormatStore';
import { SonicArrangerEngine } from './SonicArrangerEngine';
import { saNoteForKey } from './saKeyNote';

export class SonicArrangerSynth {
  private engine: SonicArrangerEngine;
  readonly output: GainNode;
  readonly name = 'SonicArrangerSynth';

  private instrumentNumber = 0;
  private loadedFor: ArrayBuffer | null = null;

  // One engine for every instrument's synth: only the first takes its output (as HippelCoSoSynth).
  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor(_audioContext?: AudioContext) {
    this.engine = SonicArrangerEngine.getInstance();
    this.output = getDevilboxAudioContext().createGain();
    if (!SonicArrangerSynth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      SonicArrangerSynth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  /** The 1-based instrument number this synth plays (the grid's instrument). */
  setInstrumentNumber(n: number): void { this.instrumentNumber = n; }
  async ensureInitialized(): Promise<void> { await this.engine.ready(); }

  /** The loaded song's bytes become the engine's keyboard copy (once per song). */
  private loadModule(): void {
    const data = useFormatStore.getState().sonicArrangerFileData;
    if (!data || data === this.loadedFor) return;
    this.engine.previewLoad(data.slice(0));
    this.loadedFor = data;
  }

  async ready(): Promise<void> {
    return this.engine.ready();
  }

  getEngine(): SonicArrangerEngine {
    return this.engine;
  }

  set(param: string, value: number): void {
    switch (param) {
      case 'volume':
        this.output.gain.value = Math.max(0, Math.min(1, value));
        this.engine.setInstrumentParam(0, 'volume', Math.round(value * 64));
        break;
      case 'vibratoSpeed':
        this.engine.setInstrumentParam(0, 'vibratoSpeed', Math.round(value * 255));
        break;
      case 'vibratoLevel':
        this.engine.setInstrumentParam(0, 'vibratoLevel', Math.round(value * 255));
        break;
      case 'vibratoDelay':
        this.engine.setInstrumentParam(0, 'vibratoDelay', Math.round(value * 255));
        break;
      case 'portamentoSpeed':
        this.engine.setInstrumentParam(0, 'portamentoSpeed', Math.round(value * 255));
        break;
      case 'fineTuning':
        // -1..1 → -128..128
        this.engine.setInstrumentParam(0, 'fineTuning', Math.round(value * 128));
        break;
      case 'effect':
        this.engine.setInstrumentParam(0, 'effect', Math.round(value));
        break;
      case 'effectArg1':
        this.engine.setInstrumentParam(0, 'effectArg1', Math.round(value * 255));
        break;
    }
  }

  async setInstrument(_instrumentData: unknown): Promise<void> {
    await this.engine.ready();
    this.loadModule();
  }

  /**
   * A key plays the instrument through the replayer's OWN note-on, ADSR, AMF, vibrato and synth
   * effects (sonic_arranger.c: sa_preview_note), on a second copy of the module held by the
   * engine's worklet, so it sounds as the song plays it and never starts the song.
   */
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
    SonicArrangerSynth._engineConnectedToSynth = false;
    this._ownsEngineConnection = false;
  }
}
