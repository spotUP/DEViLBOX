/**
 * Grid edits for a pxtone song playing on the PxtoneEngine.
 *
 * A cell edit lands in the wasm's EVERECORD list (editPxtoneCell, the carrier the grid is derived from); the
 * new list becomes song.pxtoneEvents and is swapped into the running replayer (set_events), which keeps playing.
 */
import type { TrackerSong } from '../TrackerReplayer';
import type { LiveCellEdit } from '../replayer/liveCellEdits';

export async function applyPxtoneGridEdits(song: TrackerSong, edits: readonly LiveCellEdit[]): Promise<Int32Array | null> {
  if (!song.pxtoneEvents) return null;
  const { getPxtoneWasm, editPxtoneCell, bindPxtoneSong } = await import('@/lib/import/formats/PxtoneWasmGrid');
  const m = await getPxtoneWasm();
  bindPxtoneSong(m, song.pxtoneFileData as ArrayBuffer, song.pxtoneEvents);
  let events: Int32Array | null = null;
  for (const { pattern, row, channel, cell } of edits) {
    if (cell.note > 96) continue; // release marker: display only
    events = editPxtoneCell(m, channel, pattern * song.patterns[pattern].length + row, cell.note);
  }
  if (!events) return null;
  song.pxtoneEvents = events;
  const { useFormatStore } = await import('@/stores/useFormatStore');
  useFormatStore.setState({ pxtoneEvents: events });
  const { PxtoneEngine } = await import('./PxtoneEngine');
  if (PxtoneEngine.hasInstance()) await PxtoneEngine.getInstance().setEvents(events);
  return events;
}
