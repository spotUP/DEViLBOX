/**
 * KlysSynth.ts - DevilboxSynth wrapper for klystrack engine
 *
 * Song playback mode: triggerAttack starts playback, triggerRelease stops.
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import { keyOnWholeSongPlayer } from '../wholeSongKeyboard';
import { KlysEngine } from './KlysEngine';
import { useFormatStore } from '@stores/useFormatStore';
import { editKlysField } from '@/components/klystrack/klysInstrumentEdit';
import { klysFieldByNksId, klysFieldFromNormalized, klysInstrumentIndex } from './klysInstrumentFields';

export class KlysSynth implements DevilboxSynth {
  readonly name = 'KlysSynth';
  readonly output: GainNode;

  private engine: KlysEngine;
  private audioContext: AudioContext;
  private readonly instrumentId: number;
  private _disposed = false;

  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  /** @param instrumentId the InstrumentConfig id this synth stands for (instrument index = id - 1). */
  constructor(instrumentId: number) {
    this.instrumentId = instrumentId;
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this.engine = KlysEngine.getInstance();

    if (!KlysSynth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      KlysSynth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  /** A key plays nothing: the whole-song player has no single-instrument voice, and must not start the song. */
  triggerAttack(_note?: string | number, _time?: number, _velocity?: number): void {
    if (this._disposed) return;
    keyOnWholeSongPlayer('Klystrack');
  }

  triggerRelease(_note?: string | number, _time?: number): void {
    // A key-up never stops the song.
  }

  /** Panic / song stop: this one does stop the player. */
  releaseAll(): void {
    if (this._disposed) return;
    this.engine.stop();
  }

  /**
   * A MIDI/NKS knob (`klystrack.<nksId>` or the bare id) edits THIS synth's instrument - the one the instrument
   * panel shows - through the one edit path, so the store and the engine agree. The value is the knob's range:
   * 0..1, or -1..1 for a signed field.
   */
  set(param: string, value: number): void {
    const hit = klysFieldByNksId(param.replace(/^klystrack\./, ''));
    if (!hit || this._disposed) return;
    editKlysField(klysInstrumentIndex(this.instrumentId), hit.key, klysFieldFromNormalized(hit.field, value));
  }

  get(param: string): number | undefined {
    const hit = klysFieldByNksId(param.replace(/^klystrack\./, ''));
    const inst = useFormatStore.getState().klysNative?.instruments[klysInstrumentIndex(this.instrumentId)];
    if (!hit || !inst) return undefined;
    const { field } = hit;
    const v = field.get(inst);
    if (field.min < 0) return v < 0 ? v / -field.min : v / field.max;
    return (v - field.min) / (field.max - field.min);
  }

  getEngine(): KlysEngine {
    return this.engine;
  }

  dispose(): void {
    this._disposed = true;

    if (this._ownsEngineConnection) {
      try {
        this.engine.output.disconnect(this.output);
      } catch { /* may already be disconnected */ }
      KlysSynth._engineConnectedToSynth = false;
      this._ownsEngineConnection = false;
    }
  }
}
