/**
 * Grid edits for a P/ECE song: each note is written into the song file in C++ (piece_grid.h),
 * the result becomes the song's file (so save and export carry it), and the running engine
 * swaps it in live.
 */
import type { TrackerSong } from '../TrackerReplayer';
import type { LiveCellEdit } from '../replayer/liveCellEdits';
import { PIECE_ROWS } from '@/lib/import/formats/PieceParser';
import { pieceEditCells } from './pieceEditWasm';

export async function applyPieceModuleEdits(song: TrackerSong, edits: readonly LiveCellEdit[]): Promise<ArrayBuffer | null> {
  if (!song.pieceFileData) return null;
  const current = new Uint8Array(song.pieceFileData);
  const next = await pieceEditCells(current, edits.map((e) => ({ part: e.channel, row: e.pattern * PIECE_ROWS + e.row, note: e.cell.note })));
  if (next === current) return null;
  const module = next.slice().buffer as ArrayBuffer;
  song.pieceFileData = module;
  const { useFormatStore } = await import('@stores/useFormatStore');
  useFormatStore.setState({ pieceFileData: module });
  const { PieceEngine } = await import('./PieceEngine');
  if (PieceEngine.hasInstance()) PieceEngine.getInstance().replaceModule(next);
  return module;
}
