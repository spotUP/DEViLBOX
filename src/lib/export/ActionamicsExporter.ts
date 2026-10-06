/**
 * ActionamicsExporter.ts - write an Actionamics Sound Tool (.ast) song back to
 * its own module, with the grid's edits.
 *
 * The module the song plays (actionamicsFileData) is decoded
 * (ActionamicsModule.ts), every grid cell that differs from the cell the
 * module shows there is written into the track that voice reads
 * (actionamicsGrid.ts), and the module is encoded again: byte-exact where
 * nothing was edited, every other section carried as it is. Grid edits already
 * reach the module as they are made (actionamicsModuleEdits.ts), so this
 * normally finds none; it catches a grid changed by any other route.
 *
 * Before 2026-10-06 this rebuilt a file from the display grid (64 rows per
 * pattern, no transposes, a minimal instrument per sample): it matched 55% of
 * the cells of dynablaster.ast and dropped the instruments' envelopes.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyActionamicsGridEdits, type AstGridEdit } from '@lib/import/formats/actionamicsGrid';

export interface ActionamicsExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

export async function exportActionamics(song: TrackerSong): Promise<ActionamicsExportResult> {
  const src = song.actionamicsFileData;
  if (!src) throw new Error('Actionamics export needs the module the song was loaded from');
  const edits: AstGridEdit[] = [];
  song.patterns.forEach((pattern, p) => pattern.channels.forEach((channel, ch) => channel.rows.forEach((cell, row) => {
    edits.push({ pattern: p, row, channel: ch, cell });
  })));
  const data = applyActionamicsGridEdits(new Uint8Array(src), edits);
  const base = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    data: new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer], { type: 'application/octet-stream' }),
    filename: `${base}.ast`,
    warnings: [],
  };
}
