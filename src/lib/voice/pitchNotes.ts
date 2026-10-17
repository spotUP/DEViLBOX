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
import { voiceGateLevel, spanRms, spanF0Midi, octaveFromAudio } from './voicing';

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
  /**
   * The 22050 Hz mono samples the model saw. When present, note extraction
   * drops notes with no voice under them and takes each note's octave from
   * the audio's fundamental (see voicing.ts).
   */
  audio?: Float32Array;
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
 * note, so the old stricter 0.55 / 0.45 kept one note of several. The one
 * default set: Voice to Notes and the sample editor's Audio to MIDI both use it.
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

/** Same-pitch notes this close together are one held note the model split. */
const MERGE_GAP_SECONDS = 2 / ANNOTATIONS_FPS;

/** Join same-pitch neighbours separated by at most MERGE_GAP_SECONDS. */
export function mergeSplitNotes<T extends VoiceNote & { pitchBends?: number[] }>(notes: readonly T[]): T[] {
  const sorted = [...notes].sort((a, b) => a.pitchMidi - b.pitchMidi || a.startTimeSeconds - b.startTimeSeconds);
  const out: T[] = [];
  for (const n of sorted) {
    const prev = out[out.length - 1];
    if (prev && prev.pitchMidi === n.pitchMidi) {
      const prevEnd = prev.startTimeSeconds + prev.durationSeconds;
      if (n.startTimeSeconds - prevEnd <= MERGE_GAP_SECONDS + 1e-9) {
        const end = Math.max(prevEnd, n.startTimeSeconds + n.durationSeconds);
        const bends = prev.pitchBends && n.pitchBends ? [...prev.pitchBends, ...n.pitchBends] : prev.pitchBends;
        out[out.length - 1] = {
          ...prev,
          durationSeconds: end - prev.startTimeSeconds,
          amplitude: Math.max(prev.amplitude, n.amplitude),
          ...(bends ? { pitchBends: bends } : {}),
        };
        continue;
      }
    }
    out.push(n);
  }
  return out.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
}

/**
 * Model frames to note events. `monophonic` keeps the strongest single line.
 * With `out.audio`, notes with no voice under them are dropped and monophonic
 * notes take their octave from the audio.
 */
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
  let notes = noteFramesToTime(addPitchBendsToNoteEvents(out.contours, events));
  const audio = out.audio;
  if (audio) {
    const gate = voiceGateLevel(audio);
    notes = notes.filter((n) => spanRms(audio, PITCH_SAMPLE_RATE, n.startTimeSeconds, n.durationSeconds) >= gate);
  }
  if (monophonic) {
    notes = toMonophonic(notes);
    if (audio) {
      notes = notes.map((n) => ({
        ...n,
        pitchMidi: octaveFromAudio(n.pitchMidi, spanF0Midi(audio, PITCH_SAMPLE_RATE, n.startTimeSeconds, n.durationSeconds)),
      }));
    }
  }
  return mergeSplitNotes(notes);
}

/** Shift every note by whole semitones. */
export function transposeNotes<T extends VoiceNote>(notes: readonly T[], semitones: number): T[] {
  return notes.map((n) => ({ ...n, pitchMidi: n.pitchMidi + semitones }));
}
