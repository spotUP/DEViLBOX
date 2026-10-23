/**
 * KlysSynth.ts - DevilboxSynth wrapper for klystrack engine
 *
 * A key previews the instrument on the engine's spare channel; the song is started and stopped by the transport only.
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { KlysEngine } from './KlysEngine';
import { useFormatStore } from '@stores/useFormatStore';
import { editKlysField, isStandaloneKlysInstrument, readKlysInstrument, sendStandalone } from '@/components/klystrack/klysInstrumentEdit';
import { klysFieldByNksId, klysFieldFromNormalized, klysInstrumentIndex, klysNoteFromMidi } from './klysInstrumentFields';

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

  /**
   * A key auditions THIS synth's instrument on the engine's spare preview channel; it never starts or stops the song.
   * A number is a MIDI note (as the other native synths read it), a string a note name.
   */
  triggerAttack(note?: string | number, time?: number, _velocity?: number): void {
    if (this._disposed) return;
    const midi = typeof note === 'number' ? note : noteToMidi(note ?? 'C4');
    const index = klysInstrumentIndex(this.instrumentId);
    if (isStandaloneKlysInstrument(index)) {
      // No song owns this instrument: the engine's preview copy is loaded with ITS value, then keyed.
      const own = readKlysInstrument(index);
      if (!own) return;
      sendStandalone(own);
      this.engine.previewNoteOnData(klysNoteFromMidi(midi), time);
      return;
    }
    this.engine.previewNoteOn(index, klysNoteFromMidi(midi), time);
  }

  triggerRelease(_note?: string | number, time?: number): void {
    if (this._disposed) return;
    this.engine.previewNoteOff(time);
  }

  /** Panic / song stop: stops the player and the preview voice. */
  releaseAll(): void {
    if (this._disposed) return;
    this.engine.previewNoteOff();
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
    const index = klysInstrumentIndex(this.instrumentId);
    const inst = isStandaloneKlysInstrument(index) ? readKlysInstrument(index) : useFormatStore.getState().klysNative?.instruments[index];
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
