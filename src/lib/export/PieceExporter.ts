/**
 * PieceExporter.ts - write a P/ECE music driver (.pmd) song back to its own file.
 *
 * Every grid edit is written into the song file as it is made (pieceModuleEdits, C++ editCell),
 * so the file the song plays (pieceFileData) is the export; an unedited song exports byte-identical.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';

export interface PieceExportResult { data: Blob; filename: string; warnings: string[] }

export async function exportPiece(song: TrackerSong): Promise<PieceExportResult> {
  const src = song.pieceFileData;
  if (!src) throw new Error('P/ECE export needs the song file it was loaded from');
  const base = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return { data: new Blob([src.slice(0)], { type: 'application/octet-stream' }), filename: `${base}.pmd`, warnings: [] };
}
