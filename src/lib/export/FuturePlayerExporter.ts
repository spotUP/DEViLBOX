/**
 * FuturePlayerExporter.ts - Export FuturePlayer (.fp) files
 *
 * The module's own bytes with the grid's edits patched in: the grid is the replayer's walk
 * (fpGrid.ts), so a changed note or instrument is a byte patch of the command it was drawn from
 * (fpGridEdits.ts), and an unedited song exports byte-identical. The old export compared the WASM
 * engine's shadow array (a linearisation nothing wrote to) against the grid and wrote the differences
 * to a sidecar file; with the grid being the walk those were all noise.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyFpGridEdits } from '@/lib/import/formats/fpGridEdits';

export interface FuturePlayerExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

/** Export a FuturePlayer song: its own file with the grid's edits written into the commands they were drawn from. */
export async function exportAsFuturePlayer(song: TrackerSong): Promise<FuturePlayerExportResult> {
  const warnings: string[] = [];

  const fileData = song.futurePlayerFileData;
  if (!fileData || fileData.byteLength === 0) {
    throw new Error('No FuturePlayer file data available for export');
  }

  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  const r = applyFpGridEdits(new Uint8Array(fileData), song.patterns, (id) => {
    const ins = song.instruments.find((i) => i.id === id) as unknown as { metadata?: { fpInstrPtr?: number } } | undefined;
    return ins?.metadata?.fpInstrPtr;
  }, song.fileSubsongs?.current ?? 0);
  warnings.push(...r.warnings);
  return {
    data: new Blob([r.data as unknown as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }),
    filename: `${baseName}.fp`,
    warnings,
  };
}
