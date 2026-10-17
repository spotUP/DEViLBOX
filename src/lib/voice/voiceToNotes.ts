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
import type { VoiceEffectToggles } from '@/stores/useVoiceStore';
import { ALL_EFFECTS, melodyRows, type TakeAudio, type TakeContour } from './noteEffects';
import { snapNotesToKey, type KeySnap } from './scaleSnap';
import type { QuantiseSettings } from './quantise';
import { writeNotesToPattern, type WriteResult, type WriteTarget } from './writeToPattern';
import { playableMelodyInstrument } from './voiceInstruments';

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

/**
 * Quantise, hear the effects and write; null when there is nothing to write.
 * A silent or missing target instrument is replaced by the Voice Lead;
 * `instrumentId` is the instrument the notes were written with. `take` null
 * writes arpeggios and note delays only (no audio to hear slides in).
 */
export function commitVoiceNotes(
  notes: readonly VoiceNote[],
  quantise: QuantiseSettings,
  target: WriteTarget,
  take: TakeAudio | null = null,
  contour: TakeContour | null = null,
  toggles: VoiceEffectToggles = ALL_EFFECTS,
): (WriteResult & { instrumentId: number }) | null {
  const rows = melodyRows(notes, quantise, take, contour, toggles);
  if (rows.length === 0) return null;
  const instrumentId = playableMelodyInstrument(target.instrumentId);
  return { ...writeNotesToPattern(rows, { ...target, instrumentId }), instrumentId };
}
