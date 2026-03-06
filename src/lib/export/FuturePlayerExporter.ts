/**
 * FuturePlayerExporter.ts - Export FuturePlayer (.fp) files
 *
 * Re-exports the original binary file data. FuturePlayer's WASM engine
 * does not have a serialize/save function, so this is a passthrough export.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

export interface FuturePlayerExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

export function exportAsFuturePlayer(song: TrackerSong): FuturePlayerExportResult {
  const warnings: string[] = [];

  const fileData = song.futurePlayerFileData;
  if (!fileData || fileData.byteLength === 0) {
    throw new Error('No FuturePlayer file data available for export');
  }

  warnings.push('Exports original file — in-session edits are not included.');
  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  const data = new Blob([fileData], { type: 'application/octet-stream' });
  return { data, filename: `${baseName}.fp`, warnings };
}
