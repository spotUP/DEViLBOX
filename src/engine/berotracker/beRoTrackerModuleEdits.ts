/**
 * Grid edits for a BeRoTracker song: each cell is encoded to its stored Cell bytes in C++
 * (brt_encode_cell) and poked into the running engine's decoded cells, heard when that row next
 * plays. Two pokes a cell (note..vol, fx..param) so the stored pan/filter bytes stay.
 * Save/export rebuild the file from the grid (BeRoTrackerExporter, C++ brt_export_*).
 */
import type { TrackerSong } from '../TrackerReplayer';
import type { LiveCellEdit } from '../replayer/liveCellEdits';
import { beRoTrackerCellOffset, beRoTrackerEditModule, beRoTrackerEncodeCell } from './beRoTrackerEditWasm';

export async function applyBeRoTrackerModuleEdits(song: TrackerSong, edits: readonly LiveCellEdit[]): Promise<void> {
  if (!song.beRoTrackerFileData) return;
  const { BeRoTrackerEngine } = await import('./BeRoTrackerEngine');
  if (!BeRoTrackerEngine.hasInstance()) return;
  const m = await beRoTrackerEditModule();
  const engine = BeRoTrackerEngine.getInstance();
  for (const e of edits) {
    // Pattern index = BeRoTracker pattern number (BeRoTrackerParser); length = the engine's row count.
    const rows = song.patterns[e.pattern]?.length ?? 0;
    if (e.pattern < 0 || e.pattern >= 240 || e.row < 0 || e.row >= rows || e.channel < 0 || e.channel >= song.numChannels) continue;
    const at = beRoTrackerCellOffset(rows, e.row, e.channel);
    const bytes = beRoTrackerEncodeCell(m, e.cell);
    engine.poke(e.pattern, at, bytes.subarray(0, 4));
    engine.poke(e.pattern, at + 6, bytes.subarray(6, 10));
  }
}
