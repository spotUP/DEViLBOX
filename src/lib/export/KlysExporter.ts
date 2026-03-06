/**
 * KlysExporter.ts - Export klystrack (.kt) files
 *
 * For now, exports the original raw binary since editing is done in-place
 * via the WASM engine. If the song was imported from a .kt file, we can
 * re-export the original binary (or a WASM-serialized version in future).
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

export interface KlysExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

export function exportAsKlystrack(song: TrackerSong): KlysExportResult {
  const warnings: string[] = [];

  if (!song.klysFileData) {
    throw new Error('No klystrack file data available for export');
  }

  // For now, export the original binary data
  // Future: serialize from WASM state to capture edits
  const data = new Blob([song.klysFileData], { type: 'application/octet-stream' });

  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${baseName}.kt`;

  return { data, filename, warnings };
}
