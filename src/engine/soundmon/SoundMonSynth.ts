/**
 * SoundMonSynth.ts — SoundMon synth interface with automation param routing
 * Routes params via SoundMonEngine.setInstrumentParam() → WASM _sm_set_instrument_param()
 */
import { SoundMonEngine } from './SoundMonEngine';
import { noteToBpNote } from '@/lib/import/formats/SoundMonNotes';
import { noteToMidi } from '@/utils/audio-context';

export class SoundMonSynth {
  private engine: SoundMonEngine;
  readonly output: GainNode;
  readonly name = 'SoundMonSynth';
  /** 1-based slot of this instrument in the loaded module (the parser's id). */
  private _slot = 0;

  constructor(_audioContext?: AudioContext) {
    this.engine = SoundMonEngine.getInstance();
    this.output = this.engine.output;
  }

  async ready(): Promise<void> { return this.engine.ready(); }
  getEngine(): SoundMonEngine { return this.engine; }

  set(param: string, value: number): void {
    switch (param) {
      case 'volume':
        this.output.gain.value = Math.max(0, Math.min(1, value));
        // Also set instrument volume (0-64 range)
        this.engine.setInstrumentParam(0, 'volume', Math.round(value * 64));
        break;
      case 'lfoSpeed':
        this.engine.setInstrumentParam(0, 'lfoSpeed', Math.round(value * 255));
        break;
      case 'lfoDepth':
        this.engine.setInstrumentParam(0, 'lfoDepth', Math.round(value * 255));
        break;
      case 'lfoDelay':
        this.engine.setInstrumentParam(0, 'lfoDelay', Math.round(value * 255));
        break;
      case 'adsrSpeed':
        this.engine.setInstrumentParam(0, 'adsrSpeed', Math.round(value * 255));
        break;
      case 'adsrControl':
        this.engine.setInstrumentParam(0, 'adsrControl', Math.round(value * 255));
        break;
      case 'waveTable':
        this.engine.setInstrumentParam(0, 'waveTable', Math.round(value * 15));
        break;
      case 'egControl':
        this.engine.setInstrumentParam(0, 'egControl', Math.round(value * 255));
        break;
    }
  }

  async setInstrument(_data: unknown): Promise<void> {}

  /** Which instrument of the loaded module this voice plays (1-based). */
  setSlot(slot: number): void { this._slot = slot; }

  /**
   * A typed key plays this instrument on the replayer's own preview voice
   * (soundmon.c sm_preview_note_on): the same note start, envelope, LFO, EG and
   * FX tables the song runs. A key is a MIDI note; the grid cell of that key is
   * note - 11 (xmConversions.noteToMidi), which the player holds as a note value.
   */
  triggerAttack(note?: string | number, _time?: number, _velocity?: number): void {
    if (this._slot < 1) return;
    const midi = typeof note === 'number' ? note : noteToMidi(note ?? 'C-4');
    const value = noteToBpNote(midi - 11);
    if (value === 0) return;
    this.engine.previewNoteOn(this._slot, value);
  }
  triggerRelease(): void { this.engine.previewNoteOff(); }
  dispose(): void {}
}
