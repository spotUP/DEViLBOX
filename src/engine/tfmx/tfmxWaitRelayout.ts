/**
 * The TFMX grid is a time grid: a row is a pattern tick, and a command sits on the tick it plays (TFMXParser,
 * tfmxCommandTicks). A grid edit that changes how many ticks a command holds the track (the wait of a Wait command
 * or of a note-with-wait) moves every later command of that voice, and the busiest-voice sub-rows after it. The
 * layout is not patched cell by cell: the grid is decoded again from the edited bytes by the same parse the import
 * runs (useFormatStore.reprojectTFMXGrid), so there is one layout path.
 */
import type { TrackerSong } from '../TrackerReplayer';
import type { LiveCellEdit } from '../replayer/liveCellEdits';
import { tfmxCommandTicks } from '@/lib/import/formats/TFMXParser';

/** True when one of the edited cells holds its voice a different number of ticks than the command it replaces. */
export function editChangesTfmxTicks(song: TrackerSong, edits: readonly LiveCellEdit[]): boolean {
  const layout = song.uadePatternLayout;
  const bytes = song.tfmxFileData ? new Uint8Array(song.tfmxFileData) : null;
  if (!layout?.encodeCell || !layout.getCellFileOffset || !bytes) return false;
  return edits.some(({ pattern, row, channel, cell }) => {
    const at = layout.getCellFileOffset!(pattern, row, channel);
    if (at < 0 || at + 4 > bytes.length) return false;
    const stored = layout.encodeOverStored ? bytes.slice(at, at + layout.bytesPerCell) : undefined;
    return tfmxCommandTicks(layout.encodeCell(cell, stored), 0) !== tfmxCommandTicks(bytes, at);
  });
}

/** Lay the grid out again from the edited bytes (and hand the running tune the module). */
export async function relayoutTfmxGrid(): Promise<void> {
  const { useFormatStore } = await import('@stores/useFormatStore');
  await useFormatStore.getState().reprojectTFMXGrid();
}
