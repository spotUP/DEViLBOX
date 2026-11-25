/**
 * Grid edits for a T0AST song: each cell is encoded to its six stored bytes in C++
 * (t0ast_encode_cell) and poked into the running engine's decoded cells, heard when that row
 * next plays. shortcut: the song file is not rewritten (T0AST packs patterns with RLE and
 * copy-back refs), so save and export do not carry edits; upgrade with a C++ pattern packer.
 */
import type { TrackerSong } from '../TrackerReplayer';
import type { LiveCellEdit } from '../replayer/liveCellEdits';
import { t0astCellOffset, t0astEditModule, t0astEncodeCell } from './t0astEditWasm';

export async function applyT0astModuleEdits(song: TrackerSong, edits: readonly LiveCellEdit[]): Promise<void> {
  if (!song.t0astFileData) return;
  const { T0astEngine } = await import('./T0astEngine');
  if (!T0astEngine.hasInstance()) return;
  const m = await t0astEditModule();
  const engine = T0astEngine.getInstance();
  for (const e of edits) {
    // Pattern index = T0AST pattern number (T0astParser), 256 x 64 rows x 16 channels.
    if (e.pattern < 0 || e.pattern > 255 || e.row < 0 || e.row > 63 || e.channel < 0 || e.channel > 15) continue;
    engine.poke(t0astCellOffset(e.pattern, e.row, e.channel), t0astEncodeCell(m, e.cell));
  }
}
