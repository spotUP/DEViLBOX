import { useGTUltraStore } from '../../stores/useGTUltraStore';
import type { GTUltraConfig } from '../../types/instrument/exotic';
import type { DevilboxSynth } from '../../types/synth';
import * as Tone from 'tone';

const GT_NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

/** GT note base offset — playroutine subtracts this to get the actual note index */
const FIRSTNOTE = 0x60; // 96

/** Convert a note string ("C-4", "F#3") or MIDI number to GT note number.
 *  GT expects: FIRSTNOTE + octave*12 + semitone (range 0x60-0xBC) */
function toGTNote(note: string | number): number {
  if (typeof note === 'number') {
    // MIDI note number — MIDI C-4 = 60, GT C-0 = FIRSTNOTE
    return Math.max(FIRSTNOTE, Math.min(note + FIRSTNOTE, 0xBC));
  }
  // String like "C-4" or "C#4"
  const match = note.match(/^([A-G][#-]?)(\d)$/);
  if (!match) return FIRSTNOTE;
  const idx = GT_NOTE_NAMES.indexOf(match[1]);
  if (idx < 0) return FIRSTNOTE;
  const octave = parseInt(match[2], 10);
  return FIRSTNOTE + octave * 12 + idx;
}

const MAX_CHANNELS_1SID = 3;

/**
 * Thin proxy to the shared GTUltraEngine WASM instance.
 *
 * All GT Ultra instruments share the same SID chip — there is no per-instrument
 * audio output. The output GainNode exists only to satisfy the DevilboxSynth
 * interface and is always silent (gain = 0).
 */
export class GTUltraSynth implements DevilboxSynth {
  readonly name = 'GTUltraSynth';
  readonly output: GainNode;

  private _instrumentIndex = 1;
  private _lastChannel = -1;

  /** Round-robin counter shared across all instances */
  private static _channelAlloc = 0;

  constructor() {
    const ctx = Tone.getContext().rawContext as AudioContext;
    this.output = ctx.createGain();
    this.output.gain.value = 0;
  }

  setInstrumentIndex(idx: number): void {
    this._instrumentIndex = Math.max(1, Math.min(idx, 63));
  }

  /** Push instrument parameters to the WASM engine. */
  setInstrument(config: GTUltraConfig): void {
    const engine = useGTUltraStore.getState().engine;
    if (!engine) return;

    const i = this._instrumentIndex;
    engine.setInstrumentAD(i, config.ad);
    engine.setInstrumentSR(i, config.sr);
    engine.setInstrumentFirstwave(i, config.firstwave);
    engine.setInstrumentTablePtr(i, 0, config.wavePtr);   // wave
    engine.setInstrumentTablePtr(i, 1, config.pulsePtr);   // pulse
    engine.setInstrumentTablePtr(i, 2, config.filterPtr);  // filter
    engine.setInstrumentTablePtr(i, 3, config.speedPtr);   // speed
  }

  triggerAttack(note: string | number, _time?: number, _velocity?: number): void {
    const engine = useGTUltraStore.getState().engine;
    if (!engine) return;

    const numChannels = MAX_CHANNELS_1SID;
    const channel = GTUltraSynth._channelAlloc % numChannels;
    GTUltraSynth._channelAlloc++;
    this._lastChannel = channel;

    engine.jamNoteOn(channel, toGTNote(note), this._instrumentIndex);
  }

  triggerRelease(_note?: string | number, _time?: number): void {
    const engine = useGTUltraStore.getState().engine;
    if (!engine || this._lastChannel < 0) return;

    engine.jamNoteOff(this._lastChannel);
  }

  set(param: string, value: number): void {
    const engine = useGTUltraStore.getState().engine;
    if (!engine) return;
    const i = this._instrumentIndex;
    switch (param) {
      // ADSR: automation sends full combined byte (0-1 → 0-255)
      case 'attack': {
        // Attack is high nibble of AD byte; preserve decay (low nibble)
        const ad = Math.round(value * 15) << 4; // sets attack, clears decay
        engine.setInstrumentAD(i, ad);
        break;
      }
      case 'decay': {
        // Decay is low nibble — set it standalone (attack cleared)
        engine.setInstrumentAD(i, Math.round(value * 15));
        break;
      }
      case 'sustain': {
        const sr = Math.round(value * 15) << 4;
        engine.setInstrumentSR(i, sr);
        break;
      }
      case 'release': {
        engine.setInstrumentSR(i, Math.round(value * 15));
        break;
      }
      case 'firstwave': engine.setInstrumentFirstwave(i, Math.round(value * 255)); break;
      case 'vibdelay': engine.setInstrumentVibdelay(i, Math.round(value * 255)); break;
      case 'gatetimer': engine.setInstrumentGatetimer(i, Math.round(value * 255)); break;
    }
  }

  get(param: string): number | undefined {
    switch (param) {
      case 'volume': return this.output.gain.value;
    }
    return undefined;
  }

  dispose(): void {
    this.output.disconnect();
  }
}
