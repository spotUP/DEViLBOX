/**
 * pitchNotes.ts - Basic Pitch model output (frames, onsets, contours) to notes.
 *
 * The single note-extraction path: the Voice to Notes panel (monophonic) and
 * the sample editor's AudioToMidiModal (polyphonic) both call this.
 */
import {
  noteFramesToTime,
  addPitchBendsToNoteEvents,
  outputToNotesPoly,
} from '@spotify/basic-pitch';
import type { NoteEventTime } from '@spotify/basic-pitch';

/** Basic Pitch annotation frame rate (22050 / 256). */
export const ANNOTATIONS_FPS = Math.floor(22050 / 256);
/** Basic Pitch input sample rate. */
export const PITCH_SAMPLE_RATE = 22050;

export interface VoiceNote {
  startTimeSeconds: number;
  durationSeconds: number;
  pitchMidi: number;
  /** 0..1 */
  amplitude: number;
}

export interface PitchModelOutput {
  frames: number[][];
  onsets: number[][];
  contours: number[][];
}

export interface PitchSettings {
  onsetThreshold: number;
  frameThreshold: number;
  minNoteLengthMs: number;
  minMidiNote: number;
  maxMidiNote: number;
}

/**
 * Basic Pitch's own published thresholds (0.5 onset, 0.3 frame). A sung take
 * peaks around 0.6-0.8 frame confidence and sags well below 0.45 within a
 * note, so the sample editor's stricter 0.55 / 0.45 kept one note of several.
 */
export const DEFAULT_PITCH_SETTINGS: PitchSettings = {
  onsetThreshold: 0.5,
  frameThreshold: 0.3,
  minNoteLengthMs: 90,
  minMidiNote: 21,
  maxMidiNote: 108,
};

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Reduce overlapping notes to one line: the highest-amplitude note wins, any
 * note that overlaps an already accepted one is dropped. Result is sorted by
 * start time and never overlaps.
 */
export function toMonophonic<T extends VoiceNote>(notes: readonly T[]): T[] {
  const byConfidence = [...notes].sort((a, b) => b.amplitude - a.amplitude);
  const accepted: T[] = [];
  for (const n of byConfidence) {
    const s = n.startTimeSeconds;
    const e = s + n.durationSeconds;
    const clash = accepted.some(
      (a) => s < a.startTimeSeconds + a.durationSeconds && a.startTimeSeconds < e,
    );
    if (!clash) accepted.push(n);
  }
  return accepted.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
}

/** Model frames to note events. `monophonic` keeps the strongest single line. */
export function modelOutputToNotes(
  out: PitchModelOutput,
  settings: PitchSettings,
  monophonic: boolean,
): NoteEventTime[] {
  const minNoteFrames = Math.max(1, Math.round((settings.minNoteLengthMs / 1000) * ANNOTATIONS_FPS));
  const events = outputToNotesPoly(
    out.frames,
    out.onsets,
    settings.onsetThreshold,
    settings.frameThreshold,
    minNoteFrames,
    true,
    midiToHz(settings.maxMidiNote),
    midiToHz(settings.minMidiNote),
  );
  const notes = noteFramesToTime(addPitchBendsToNoteEvents(out.contours, events));
  return monophonic ? toMonophonic(notes) : notes;
}

/** Shift every note by whole semitones. */
export function transposeNotes<T extends VoiceNote>(notes: readonly T[], semitones: number): T[] {
  return notes.map((n) => ({ ...n, pitchMidi: n.pitchMidi + semitones }));
}
