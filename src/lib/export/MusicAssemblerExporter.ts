/**
 * MusicAssemblerExporter.ts - Export Music Assembler (.ma) files
 *
 * The module's own bytes with the grid's edits patched in: the grid is the replayer's walk (maGrid.ts), so a
 * changed note or instrument is a byte patch of the track event it was drawn from (maGridEdits.ts), and an
 * unedited song exports byte-identical. (The WASM engine's ma_save returns the original binary, so asking it
 * could never carry an edit.)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyMaGridEdits } from '@/lib/import/formats/maGridEdits';

export interface MusicAssemblerExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

export async function exportAsMusicAssembler(song: TrackerSong): Promise<MusicAssemblerExportResult> {
  const fileData = song.maFileData;
  if (!fileData || fileData.byteLength === 0) {
    throw new Error('No Music Assembler file data available for export');
  }

  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  const r = applyMaGridEdits(new Uint8Array(fileData), song.patterns, song.fileSubsongs?.current ?? 0);
  return {
    data: new Blob([r.data as unknown as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }),
    filename: `${baseName}.ma`,
    warnings: r.warnings,
  };
}
