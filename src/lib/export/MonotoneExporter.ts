/**
 * MonotoneExporter.ts - write a MONOTONE (.MON) song back to its own file,
 * with the grid's edits.
 *
 * The file the song plays (monotoneFileData) has every grid cell that differs
 * from the cell its word shows written in (monotoneGrid.ts); every other byte
 * is carried as it is, so an unedited song exports byte-identical. Grid edits
 * already reach the module as they are made (monotoneModuleEdits.ts), so this
 * normally finds none; it catches a grid changed by any other route.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyMonotoneGridEdits, type MonotoneGridEdit } from '@lib/import/formats/monotoneGrid';

export interface MonotoneExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

export async function exportMonotone(song: TrackerSong): Promise<MonotoneExportResult> {
  const src = song.monotoneFileData;
  if (!src) throw new Error('MONOTONE export needs the module the song was loaded from');
  const edits: MonotoneGridEdit[] = [];
  song.patterns.forEach((pattern, p) => pattern.channels.forEach((channel, ch) => channel.rows.forEach((cell, row) => {
    edits.push({ pattern: p, row, channel: ch, cell });
  })));
  const data = applyMonotoneGridEdits(new Uint8Array(src), edits);
  const base = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    data: new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer], { type: 'application/octet-stream' }),
    filename: `${base}.mon`,
    warnings: [],
  };
}
