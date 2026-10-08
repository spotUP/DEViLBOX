/**
 * Hively cell edits - ONE write path for the Hively view (keys, paste, transpose, clear).
 *
 * The cells the Hively view draws are `hivelyNative.tracks` (a pool of tracks shared by positions; the
 * lossless model the exporter writes). The tracker store's patterns are the replayer-side projection of the
 * same data (one pattern per position, per-position transpose folded in, effects mapped onto XM columns).
 * An edit writes the native step and then projects it into EVERY position whose channel plays that track
 * (hivelyStepToCell, the importer's own projection), so the view, the export and the engine's grid agree.
 * Before this the Hively view had no write path at all: record-mode keys wrote the tracker pattern
 * and the view kept drawing the untouched native tracks (owner 2026-10-07, amanda.ahx).
 */
import { useFormatStore } from '@stores/useFormatStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { hivelyStepToCell } from '@/lib/import/formats/HivelyParser';
import type { HivelyNativeStep } from '@/types/tracker';
import type { OnCellChange } from '@/components/shared/format-editor-types';

/** The native step update a column value means (fx columns pack effect << 8 | parameter). */
export function hivelyStepUpdate(columnKey: string, value: number): Partial<HivelyNativeStep> | null {
  switch (columnKey) {
    case 'note': return { note: value };
    case 'instrument': return { instrument: value };
    case 'fx1': return { fx: (value >> 8) & 0xF, fxParam: value & 0xFF };
    case 'fx2': return { fxb: (value >> 8) & 0xF, fxbParam: value & 0xFF };
    default: return null;
  }
}

/**
 * Project rows of one native track into the tracker grid: every position whose channel plays the track
 * (the importer's projection, hivelyStepToCell). `rows` defaults to every row of the track.
 */
export function projectHivelyTrack(trackIdx: number, rows?: readonly number[]): void {
  const native = useFormatStore.getState().hivelyNative;
  const track = native?.tracks[trackIdx];
  if (!native || !track) return;
  const tracker = useTrackerStore.getState();
  const rowList = rows ?? track.steps.map((_, r) => r);
  native.positions.forEach((pos, p) => {
    for (let ch = 0; ch < native.channels; ch++) {
      if (pos.track[ch] !== trackIdx) continue;
      for (const r of rowList) {
        const step = track.steps[r];
        if (step) tracker.setCell(ch, r, hivelyStepToCell(step, pos.transpose[ch] ?? 0), p);
      }
    }
  });
}

/**
 * Hand rows of a native track to the running Hively tune (G24): the engine's own memory write (hively_set_track_step), so the
 * edit is heard the next time the song reaches the step, with no restart. No engine running, nothing to do: the next play loads the
 * edited module.
 */
function pushHivelyTrackToEngine(trackIdx: number, rows?: readonly number[]): void {
  const track = useFormatStore.getState().hivelyNative?.tracks[trackIdx];
  if (!track) return;
  void import('@/engine/hively/HivelyEngine').then(({ HivelyEngine }) => {
    if (!HivelyEngine.hasInstance()) return;
    const engine = HivelyEngine.getInstance();
    for (const r of rows ?? track.steps.map((_, i) => i)) {
      const st = track.steps[r];
      if (st) engine.setTrackStep(trackIdx, r, st.note, st.instrument, st.fx, st.fxParam, st.fxb, st.fxbParam);
    }
  });
}

/** Edit one cell of the position shown by the view: channel `channelIdx`, row `rowIdx`, column `columnKey`. */
export function editHivelyCell(position: number, channelIdx: number, rowIdx: number, columnKey: string, value: number): void {
  const fmt = useFormatStore.getState();
  const native = fmt.hivelyNative;
  const update = hivelyStepUpdate(columnKey, value);
  const trackIdx = native?.positions[position]?.track[channelIdx];
  if (!native || !update || trackIdx === undefined || trackIdx < 0 || !native.tracks[trackIdx]?.steps[rowIdx]) return;
  fmt.setHivelyTrackStep(trackIdx, rowIdx, update);
  projectHivelyTrack(trackIdx, [rowIdx]);
  pushHivelyTrackToEngine(trackIdx, [rowIdx]);
}

/** Undo / redo the last native step edit and project the track it touched. Returns false when there was nothing. */
export function undoHively(): boolean {
  const fmt = useFormatStore.getState();
  const entry = fmt.hivelyUndoStack[fmt.hivelyUndoStack.length - 1];
  if (!entry) return false;
  fmt.undoHivelyTrackStep();
  projectHivelyTrack(entry.trackIndex, [entry.stepIndex]);
  pushHivelyTrackToEngine(entry.trackIndex, [entry.stepIndex]);
  return true;
}
export function redoHively(): boolean {
  const fmt = useFormatStore.getState();
  const entry = fmt.hivelyRedoStack[fmt.hivelyRedoStack.length - 1];
  if (!entry) return false;
  fmt.redoHivelyTrackStep();
  projectHivelyTrack(entry.trackIndex, [entry.stepIndex]);
  pushHivelyTrackToEngine(entry.trackIndex, [entry.stepIndex]);
  return true;
}

/** Insert / delete a row of a native track (every later row moves) and project the whole track. */
export function insertHivelyRow(trackIdx: number, rowIdx: number): void {
  useFormatStore.getState().insertHivelyTrackRow(trackIdx, rowIdx);
  projectHivelyTrack(trackIdx);
  pushHivelyTrackToEngine(trackIdx);
}
export function deleteHivelyRow(trackIdx: number, rowIdx: number): void {
  useFormatStore.getState().deleteHivelyTrackRow(trackIdx, rowIdx);
  projectHivelyTrack(trackIdx);
  pushHivelyTrackToEngine(trackIdx);
}

/** The view's `onFormatCellChange` for the position it shows. */
export function hivelyCellChangeFor(position: number): OnCellChange {
  return (channelIdx, rowIdx, columnKey, value) => editHivelyCell(position, channelIdx, rowIdx, columnKey, value);
}
