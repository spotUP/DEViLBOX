import * as Tone from 'tone';
import { freqToMidi } from '../../engine/mame/MAMEPitchUtils';

/** Nearest note + cents of a single-cycle sample whose cycle is `cycleLength` frames at `sampleRate`. */
export function cyclePitch(sampleRate: number, cycleLength: number): { baseNote: string; detune: number } {
  const midi = freqToMidi(sampleRate / cycleLength);
  const nearest = Math.round(midi);
  return { baseNote: Tone.Frequency(nearest, 'midi').toNote(), detune: Math.round((midi - nearest) * 100) };
}

/** Playback-rate factor for a sample's fine tune in cents (0 / undefined = 1). */
export function centsRatio(cents: number | undefined): number {
  return 2 ** ((cents || 0) / 1200);
}

/** Note shifted by `cents`, as Hz for Tone.Sampler (it honours the sub-semitone remainder); unchanged when cents is 0. */
export function detunedNote(note: string, cents: number | undefined): string | number {
  return cents ? Tone.Frequency(note).toFrequency() * centsRatio(cents) : note;
}
