/**
 * voiceToNotes.ts - the one pipeline from pitch-model output to pattern cells.
 *
 * Used by the Voice to Notes panel (live take) and the voice_to_notes MCP
 * handler (audio file): model output -> notes -> transpose -> key snap ->
 * quantise -> one undo step.
 */
import {
  DEFAULT_PITCH_SETTINGS,
  modelOutputToNotes,
  transposeNotes,
  type PitchModelOutput,
  type PitchSettings,
  type VoiceNote,
} from './pitchNotes';
import { snapNotesToKey, type KeySnap } from './scaleSnap';
import { quantiseNotes, type QuantiseSettings } from './quantise';
import { writeNotesToPattern, type WriteResult, type WriteTarget } from './writeToPattern';

export interface NoteShaping extends PitchSettings {
  transpose: number;
  /** null = no snapping */
  keySnap: KeySnap | null;
}

export const DEFAULT_SHAPING: NoteShaping = { ...DEFAULT_PITCH_SETTINGS, transpose: 0, keySnap: null };

export function shapeNotes(output: PitchModelOutput, s: NoteShaping): VoiceNote[] {
  const notes = transposeNotes(modelOutputToNotes(output, s, true), s.transpose);
  return s.keySnap ? snapNotesToKey(notes, s.keySnap) : notes;
}

/** Quantise and write; null when there is nothing to write. */
export function commitVoiceNotes(
  notes: readonly VoiceNote[],
  quantise: QuantiseSettings,
  target: WriteTarget,
): WriteResult | null {
  const rows = quantiseNotes(notes, quantise);
  if (rows.length === 0) return null;
  return writeNotesToPattern(rows, target);
}
