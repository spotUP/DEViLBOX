/**
 * ActivisionProExporter.ts - write an Activision Pro (.avp) song back to its
 * own module, with the grid's edits.
 *
 * The module the song plays (activisionProFileData) is decoded
 * (ActivisionProModule.ts), every grid cell that differs from the cell the
 * module shows there is written into the track that voice reads
 * (activisionProGrid.ts), and the module is encoded again: byte-exact where
 * nothing was edited, every other section carried as it is. Grid edits already
 * reach the module as they are made (activisionProModuleEdits.ts), so this
 * normally finds none; it catches a grid changed by any other route.
 *
 * Before 2026-10-06 this rebuilt a file from the display grid with a made-up
 * note byte per row (and dropped the replayer's real event stream).
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyActivisionProGridEdits, type AvpGridEdit, AVP_ROWS_PER_PATTERN } from '@lib/import/formats/activisionProGrid';

export async function exportActivisionPro(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const src = song.activisionProFileData;
  if (!src) throw new Error('Activision Pro export needs the module the song was loaded from');
  const edits: AvpGridEdit[] = [];
  song.patterns.forEach((pattern, p) => pattern.channels.forEach((channel, ch) => channel.rows.forEach((cell, row) => {
    if (row < AVP_ROWS_PER_PATTERN) edits.push({ pattern: p, row, channel: ch, cell });
  })));
  const data = applyActivisionProGridEdits(new Uint8Array(src), edits);
  const base = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    data: new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer], { type: 'application/octet-stream' }),
    filename: `${base}.avp`,
    warnings: [],
  };
}
