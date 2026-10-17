/**
 * takePreview.ts - a pending Voice to Notes take as the pattern's ghost notes.
 *
 * Built with the commit's own steps (quantiseNotes / quantiseHits, then
 * writeToPattern.takeCells), so the pattern shows exactly the notes a commit
 * writes, at the rows it writes them.
 */
import type { PatternPreviewSnapshot } from '@/engine/renderer/worker-types';
import type { DrumHit } from './drumHits';
import { quantiseHits, usedDrumClasses, type DrumMap } from './drumToNotes';
import type { VoiceEffectToggles } from '@/stores/useVoiceStore';
import { ALL_EFFECTS, melodyRows, type TakeAudio, type TakeContour } from './noteEffects';
import type { VoiceNote } from './pitchNotes';
import type { QuantisedNote, QuantiseSettings } from './quantise';
import { drumMapAsWritten } from './voiceInstruments';
import { takeCells, type WriteTarget } from './writeToPattern';

function snapshot(rows: readonly QuantisedNote[], target: WriteTarget, rowCount: number): PatternPreviewSnapshot | null {
  if (rows.length === 0) return null;
  const take = takeCells(rows, target, rowCount);
  return { channelIndex: target.channelIndex, startRow: take.startRow, notes: take.cells.map((c) => c.note) };
}

/**
 * Melody notes (live while recording, or the shaped take) as the commit will
 * write them. `take` and `contour` null (live) = no slide / vibrato / volume
 * detection, only arpeggios and note delays.
 */
export function melodyPreview(
  notes: readonly VoiceNote[],
  quantise: QuantiseSettings,
  target: WriteTarget,
  rowCount: number,
  take: TakeAudio | null = null,
  contour: TakeContour | null = null,
  toggles: VoiceEffectToggles = ALL_EFFECTS,
): PatternPreviewSnapshot | null {
  return snapshot(melodyRows(notes, quantise, take, contour, toggles), target, rowCount);
}

/** Drum hits as the commit will write them; silent classes show at the 808 pitch. */
export function drumPreview(
  hits: readonly DrumHit[],
  map: DrumMap,
  quantise: QuantiseSettings,
  target: WriteTarget,
  rowCount: number,
  flams = true,
): PatternPreviewSnapshot | null {
  return snapshot(quantiseHits(hits, drumMapAsWritten(map, usedDrumClasses(hits)), quantise, flams), target, rowCount);
}
