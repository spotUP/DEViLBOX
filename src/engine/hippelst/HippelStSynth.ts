/**
 * HippelStSynth.ts - the keyboard voice of a Jochen Hippel Atari ST instrument.
 *
 * An instrument of an ST song is a volume sequence (with the sound sequence it names). A key
 * starts it on the keyboard player of HippelStEngine: a second copy of the song's player with its
 * sequencer parked, started by the player's own note-start code on the pattern note the key stands for.
 */
import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { useFormatStore } from '@/stores/useFormatStore';
import { HippelStEngine } from './HippelStEngine';
import { hippelStNoteForKey } from './hippelStKeyNote';

export class HippelStSynth implements DevilboxSynth {
  readonly name = 'HippelStSynth';
  readonly output: GainNode;

  private engine: HippelStEngine;
  private _disposed = false;
  private _instrument = 0;
  private static _engineConnected = false;
  private _ownsConnection = false;

  constructor() {
    this.output = getDevilboxAudioContext().createGain();
    this.engine = HippelStEngine.getInstance();
    if (!HippelStSynth._engineConnected) {
      this.engine.output.connect(this.output);
      HippelStSynth._engineConnected = true;
      this._ownsConnection = true;
    }
  }

  /** The instrument's index in the song's volume sequence table (0-based). */
  setInstrumentIndex(index: number): void { this._instrument = index; }

  async ensureInitialized(): Promise<void> { await this.engine.ready(); }

  async setInstrument(_config?: unknown): Promise<void> {
    await this.engine.ready();
    const image = useFormatStore.getState().hippelStFileData;
    if (image) await this.engine.keyLoad(image);
  }

  triggerAttack(note?: string | number, _time?: number, _velocity?: number): void {
    if (this._disposed) return;
    const midi = typeof note === 'string' ? noteToMidi(note) : (note ?? 48);
    const image = useFormatStore.getState().hippelStFileData;
    if (!image) return;
    // keyLoad is a no-op for an image the keyboard player already holds
    void this.engine.keyLoad(image).then(() => {
      if (!this._disposed) this.engine.keyNote(this._instrument, hippelStNoteForKey(midi));
    });
  }

  triggerRelease(_note?: string | number, _time?: number): void {
    if (!this._disposed) this.engine.keyOff();
  }

  releaseAll(): void { this.triggerRelease(); }

  set(param: string, value: number): void {
    if (param === 'volume') this.output.gain.value = Math.max(0, Math.min(1, value));
  }

  get(param: string): number | undefined {
    return param === 'volume' ? this.output.gain.value : undefined;
  }

  dispose(): void {
    this._disposed = true;
    if (this._ownsConnection) {
      try { this.engine.output.disconnect(this.output); } catch { /* already disconnected */ }
      HippelStSynth._engineConnected = false;
      this._ownsConnection = false;
    }
  }
}
