/**
 * Grid edits for an Activision Pro song playing on the ActivisionPro replayer.
 *
 * A grid cell is a row of a voice (activisionProGrid.ts); a cell on the row an
 * event starts is that event. The edit is written into the track that voice
 * reads (applyActivisionProGridEdits: tracks are written in place, an edit that
 * would change a track's length is dropped), the module re-encoded, and the
 * replayer swaps the tracks in where it plays (avp_replace_tracks: every voice
 * keeps its place). The new module becomes the song's module, so the next load,
 * save and export carry the edit. A track plays wherever a position names it,
 * so the grid is read from the new module again and every cell that changed is
 * updated.
 */
import type { TrackerSong } from '../TrackerReplayer';
import type { LiveCellEdit } from '../replayer/liveCellEdits';

/** Re-encode `edits` into the song's module and hand it to the replayer. Returns the new module, or null when nothing changed. */
export async function applyActivisionProModuleEdits(song: TrackerSong, edits: readonly LiveCellEdit[]): Promise<ArrayBuffer | null> {
  if (!song.activisionProFileData) return null;
  const { applyActivisionProGridEdits, walkActivisionPro, avpPatternCells, avpCellsEqual } = await import('@/lib/import/formats/activisionProGrid');
  const { decodeActivisionProModule } = await import('@/lib/import/formats/ActivisionProModule');
  const current = new Uint8Array(song.activisionProFileData);
  const next = applyActivisionProGridEdits(current, edits);
  if (next === current || (next.length === current.length && next.every((b, i) => b === current[i]))) return null;
  const module = next.buffer.slice(next.byteOffset, next.byteOffset + next.byteLength) as ArrayBuffer;
  song.activisionProFileData = module;
  const { useFormatStore } = await import('@stores/useFormatStore');
  useFormatStore.setState({ activisionProFileData: module });

  const { ActivisionProEngine } = await import('./ActivisionProEngine');
  if (ActivisionProEngine.hasInstance()) ActivisionProEngine.getInstance().replaceModule(module.slice(0));

  // The grid as the new module shows it: every cell that differs from the grid in the store.
  const m = decodeActivisionProModule(next);
  if (!m) return module;
  const cells = avpPatternCells(walkActivisionPro(m, 0));
  const { useTrackerStore } = await import('@stores/useTrackerStore');
  useTrackerStore.setState((state) => {
    cells.forEach((voices, p) => voices.forEach((rows, ch) => rows.forEach((cell, row) => {
      const target = state.patterns[p]?.channels[ch]?.rows;
      if (target && !avpCellsEqual(target[row], cell)) target[row] = cell;
    })));
  });
  return module;
}
