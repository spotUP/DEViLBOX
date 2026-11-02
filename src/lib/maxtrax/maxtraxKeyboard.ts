/**
 * MaxTrax keyboard note entry (P14e): the same typing flow as the other formats, against the MaxTrax grid.
 *
 * Reuses the shared pieces - typedPitch (key to semitone, the editor store's octave), planNoteEntry (edit mode,
 * edit step, record row) - and writes through the grid editor's typeNote, the pitch writer the field editor's
 * setNoteField sits behind. MaxTraxGrid's onKeyDown calls handleMaxTraxKey.
 */

import { useEditorStore } from '@stores/useEditorStore';
import { planNoteEntry, typedPitch } from '@/lib/tracker/formatEntryPlan';
import type { MaxTraxGrid } from './maxtraxGrid.types';

export interface MaxTraxCursor { column: number; row: number }

/** MIDI note number of C-0 (the grid names pitch 12 as C-0). */
const MIDI_C0 = 12;

export interface MaxTraxKeyEvent {
  key: string;
  repeat: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  preventDefault(): void;
}

export interface MaxTraxKeyHost {
  grid: MaxTraxGrid;
  getCursor(): MaxTraxCursor;
  setCursor(next: MaxTraxCursor): void;
  isPlaying(): boolean;
  playbackRow(): number;
  edit: { typeNote(column: number, row: number, pitch: number): void };
}

export function handleMaxTraxKey(e: MaxTraxKeyEvent, host: MaxTraxKeyHost): void {
  const { grid } = host;
  const cur = host.getCursor();
  const lastCol = Math.max(0, grid.columns.length - 1);
  const lastRow = Math.max(0, grid.rowCount - 1);
  const clamp = (c: MaxTraxCursor): MaxTraxCursor => ({
    column: Math.max(0, Math.min(lastCol, c.column)),
    row: Math.max(0, Math.min(lastRow, c.row)),
  });
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  switch (e.key) {
    case 'ArrowUp': e.preventDefault(); host.setCursor(clamp({ ...cur, row: cur.row - 1 })); return;
    case 'ArrowDown': e.preventDefault(); host.setCursor(clamp({ ...cur, row: cur.row + 1 })); return;
    case 'ArrowLeft': e.preventDefault(); host.setCursor(clamp({ ...cur, column: cur.column - 1 })); return;
    case 'ArrowRight': e.preventDefault(); host.setCursor(clamp({ ...cur, column: cur.column + 1 })); return;
    case 'PageUp': e.preventDefault(); host.setCursor(clamp({ ...cur, row: cur.row - 16 })); return;
    case 'PageDown': e.preventDefault(); host.setCursor(clamp({ ...cur, row: cur.row + 16 })); return;
    case 'Home': e.preventDefault(); host.setCursor(clamp({ ...cur, row: 0 })); return;
    case 'End': e.preventDefault(); host.setCursor(clamp({ ...cur, row: lastRow })); return;
  }

  const ed = useEditorStore.getState();
  const typed = typedPitch(e.key, ed.currentOctave);
  if (typed === null) return;
  e.preventDefault();
  const isPlaying = host.isPlaying();
  if (e.repeat && isPlaying) return;
  const plan = planNoteEntry({
    recordMode: ed.recordMode,
    isPlaying,
    cursorRow: cur.row,
    playbackRow: host.playbackRow(),
    editStep: ed.editStep,
    numRows: grid.rowCount,
    recQuantEnabled: ed.recQuantEnabled,
    recQuantRes: ed.recQuantRes,
  });
  if (!plan.write) return;
  host.edit.typeNote(cur.column, plan.row, typed + MIDI_C0);
  if (plan.nextCursorRow !== null) host.setCursor(clamp({ ...cur, row: plan.nextCursorRow }));
}
