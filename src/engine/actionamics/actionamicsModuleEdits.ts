/**
 * Grid edits for an Actionamics song playing on the ActionamicsReplayer.
 *
 * A grid cell is one row of one voice of one song position
 * (actionamicsGrid.ts): the edit is written into the track that voice reads
 * (applyActionamicsGridEdits - the note byte is the shown note less the
 * transposes the replayer adds), the module re-encoded, and the replayer
 * swaps the new tracks in where it plays (act_replace_tracks: every voice
 * keeps its row). The new module becomes the song's module, so the next load,
 * save and export carry the edit.
 *
 * A track plays wherever a position names it, so the same row shows in other
 * cells too; after the edit the grid is read from the new module again and
 * every cell that changed is updated (a set rows or break edit changes how
 * long positions are, so the patterns are rebuilt then).
 */
import type { TrackerSong } from '../TrackerReplayer';
import type { LiveCellEdit } from '../replayer/liveCellEdits';

/** Re-encode `edits` into the song's module and hand it to the replayer. Returns the new module, or null when nothing changed. */
export async function applyActionamicsModuleEdits(song: TrackerSong, edits: readonly LiveCellEdit[]): Promise<ArrayBuffer | null> {
  if (!song.actionamicsFileData) return null;
  const { applyActionamicsGridEdits, walkActionamicsSong, astCellsEqual } = await import('@/lib/import/formats/actionamicsGrid');
  const { decodeActionamicsModule } = await import('@/lib/import/formats/ActionamicsModule');
  const current = new Uint8Array(song.actionamicsFileData);
  const next = applyActionamicsGridEdits(current, edits);
  if (next === current || (next.length === current.length && next.every((b, i) => b === current[i]))) return null;
  const module = next.buffer.slice(next.byteOffset, next.byteOffset + next.byteLength) as ArrayBuffer;
  song.actionamicsFileData = module;
  song.uadeEditableFileData = module.slice(0);
  const { useFormatStore } = await import('@stores/useFormatStore');
  useFormatStore.setState({ actionamicsFileData: module });

  const { ActionamicsEngine } = await import('./ActionamicsEngine');
  if (ActionamicsEngine.hasInstance()) ActionamicsEngine.getInstance().replaceModule(module.slice(0));

  // The grid as the new module shows it: every cell that differs from the grid in the store.
  const m = decodeActionamicsModule(next);
  if (!m) return module;
  const walk = walkActionamicsSong(m, 0);
  const { useTrackerStore } = await import('@stores/useTrackerStore');
  useTrackerStore.setState((state) => {
    const same = walk.steps.length === state.patterns.length
      && walk.steps.every((s, i) => s.rows === state.patterns[i].length);
    if (!same) {
      // The positions' lengths changed: rebuild the rows of every pattern from the module.
      state.patterns = walk.steps.map((step, i) => {
        const old = state.patterns[i] ?? state.patterns[0];
        return {
          ...old, id: `pattern-${i}`, name: `Position ${step.position}`, length: step.rows,
          channels: step.voices.map((rows, ch) => ({ ...(old.channels[ch] ?? old.channels[0]), rows: rows.map((r) => r.cell) })),
        };
      });
      return;
    }
    walk.steps.forEach((step, p) => step.voices.forEach((rows, ch) => rows.forEach((r, row) => {
      const target = state.patterns[p]?.channels[ch]?.rows;
      if (target && !astCellsEqual(target[row], r.cell)) target[row] = r.cell;
    })));
  });
  return module;
}
