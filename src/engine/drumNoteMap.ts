/**
 * Drum Note Mapping — maps tracker notes to drum types and pitch offsets.
 *
 * Design:
 *   Note NAME (semitone class 0-11) → which drum to play
 *   Octave offset from base octave 4 → pitch/tune shift
 *
 * Kit mode (default): different note names trigger different drums.
 * Pitch mode: all notes play the same drum; semitone distance from C4
 *             controls the tune parameter.
 */

import type { IO808DrumType } from './io808/IO808Synth';
import type { TR909DrumType } from './tr909/TR909Synth';
import { noteToMidi } from '@/utils/audio-context';

// ─── IO808 Kit Map ───────────────────────────────────────────────────────────
// 12 semitone classes → 12 primary drums (toms/congas merge into one entry
// each because octave-based pitch covers the low/mid/high range naturally).

const IO808_KIT: IO808DrumType[] = [
  'kick',      // C  (0)
  'snare',     // C# (1)
  'closedHat', // D  (2)
  'openHat',   // D# (3)
  'clap',      // E  (4)
  'rimshot',   // F  (5)
  'clave',     // F# (6)
  'cowbell',   // G  (7)
  'cymbal',    // G# (8)
  'maracas',   // A  (9)
  'tomMid',    // A# (10) — octave shifts give low/mid/high
  'congaMid',  // B  (11) — octave shifts give low/mid/high
];

// ─── TR909 Kit Map ───────────────────────────────────────────────────────────

const TR909_KIT: TR909DrumType[] = [
  'kick',      // C  (0)
  'snare',     // C# (1)
  'closedHat', // D  (2)
  'openHat',   // D# (3)
  'clap',      // E  (4)
  'rimshot',   // F  (5)
  'tomLow',    // F# (6)
  'tomMid',    // G  (7)
  'tomHigh',   // G# (8)
  'crash',     // A  (9)
  'ride',      // A# (10)
  'kick',      // B  (11) — wraps to kick
];

// ─── ToneJS DrumMachine Kit Map ──────────────────────────────────────────────
// Uses the DrumType union from types/instrument/drums.ts

import type { DrumType } from '@typedefs/instrument/drums';

const TONEJSDRUM_KIT: DrumType[] = [
  'kick',      // C  (0)
  'snare',     // C# (1)
  'hihat',     // D  (2)
  'hihat',     // D# (3) — open hat variant (same engine, longer decay)
  'clap',      // E  (4)
  'rimshot',   // F  (5)
  'clave',     // F# (6)
  'cowbell',   // G  (7)
  'cymbal',    // G# (8)
  'maracas',   // A  (9)
  'tom',       // A# (10)
  'conga',     // B  (11)
];

// ─── Base octave for "normal" pitch (no tune offset) ─────────────────────────
const BASE_OCTAVE = 4;

// ─── Public API ──────────────────────────────────────────────────────────────

export interface DrumNoteResult<T extends string> {
  /** Which drum sound to trigger */
  drumType: T;
  /**
   * Frequency multiplier for pitch shifting.
   * 1.0 = normal pitch (base octave 4),
   * 2.0 = one octave up, 0.5 = one octave down.
   */
  pitchMultiplier: number;
}

/**
 * Convert a note (name or MIDI number) to semitone class (0-11) and octave.
 */
function parseNote(note: string | number): { semitone: number; octave: number; midi: number } {
  const midi = typeof note === 'string' ? noteToMidi(note) : (
    note > 127 ? 60 : note  // Frequency → default to C4
  );
  return {
    semitone: midi % 12,
    octave: Math.floor(midi / 12) - 1,  // MIDI 60 = C4 → octave 4
    midi,
  };
}

/**
 * Resolve IO808 drum type and pitch multiplier from a tracker note.
 *
 * Kit mode:  note name → drum,  octave → pitch
 * Pitch mode: always uses `fallback` drum, note distance from C4 → pitch
 */
export function resolveIO808Note(
  note: string | number,
  mode: 'kit' | 'pitch',
  fallback: IO808DrumType,
): DrumNoteResult<IO808DrumType> {
  const { semitone, octave, midi } = parseNote(note);

  if (mode === 'pitch') {
    // Each semitone = 2^(1/12) frequency ratio
    return { drumType: fallback, pitchMultiplier: Math.pow(2, (midi - 60) / 12) };
  }

  // Kit mode: note name → drum, octave offset → pitch
  return {
    drumType: IO808_KIT[semitone] ?? fallback,
    pitchMultiplier: Math.pow(2, octave - BASE_OCTAVE),
  };
}

/**
 * Resolve TR909 drum type and pitch multiplier from a tracker note.
 */
export function resolveTR909Note(
  note: string | number,
  mode: 'kit' | 'pitch',
  fallback: TR909DrumType,
): DrumNoteResult<TR909DrumType> {
  const { semitone, octave, midi } = parseNote(note);

  if (mode === 'pitch') {
    return { drumType: fallback, pitchMultiplier: Math.pow(2, (midi - 60) / 12) };
  }

  return {
    drumType: TR909_KIT[semitone] ?? fallback,
    pitchMultiplier: Math.pow(2, octave - BASE_OCTAVE),
  };
}

/**
 * Resolve ToneJS DrumMachine drum type and pitch multiplier from a tracker note.
 */
export function resolveToneJSDrumNote(
  note: string | number,
  mode: 'kit' | 'pitch',
  fallback: DrumType,
): DrumNoteResult<DrumType> {
  const { semitone, octave, midi } = parseNote(note);

  if (mode === 'pitch') {
    return { drumType: fallback, pitchMultiplier: Math.pow(2, (midi - 60) / 12) };
  }

  return {
    drumType: TONEJSDRUM_KIT[semitone] ?? fallback,
    pitchMultiplier: Math.pow(2, octave - BASE_OCTAVE),
  };
}

// ─── Exported maps for UI display (e.g. note labels in pattern editor) ───────
export { IO808_KIT, TR909_KIT, TONEJSDRUM_KIT, BASE_OCTAVE };
