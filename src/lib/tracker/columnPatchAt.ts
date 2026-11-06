import { useTrackerStore } from '@stores/useTrackerStore';
import { columnPatch, type NoteColumnField } from './noteColumns';

/** columnPatch for the cell currently stored at channel / row of the shown pattern. */
export function columnPatchAt(
  channelIndex: number,
  rowIndex: number,
  col: number,
  values: Partial<Record<NoteColumnField, number | undefined>>,
  patternIndex?: number,
) {
  const s = useTrackerStore.getState();
  const cell = s.patterns[patternIndex ?? s.currentPatternIndex]?.channels[channelIndex]?.rows[rowIndex];
  return columnPatch(cell, col, values);
}
