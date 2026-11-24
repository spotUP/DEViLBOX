import * as Tone from 'tone';
import { freqToMidi } from '../../engine/mame/MAMEPitchUtils';

/** Nearest note + cents of a single-cycle sample whose cycle is `cycleLength` frames at `sampleRate`. */
export function cyclePitch(sampleRate: number, cycleLength: number): { baseNote: string; detune: number } {
  const midi = freqToMidi(sampleRate / cycleLength);
  const nearest = Math.round(midi);
  return { baseNote: Tone.Frequency(nearest, 'midi').toNote(), detune: Math.round((midi - nearest) * 100) };
}
