/**
 * PiyoPiyoExporter.ts - write a PiyoPiyo (.pmd) song back to its own file.
 *
 * The file the song plays (piyoPiyoFileData) gets every grid cell that differs from
 * the event it shows written in (piyoPiyoGrid.ts); every other byte is carried, so
 * an unedited song exports byte-identical.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyPiyoPiyoGridEdits, type PiyoPiyoGridEdit } from '@lib/import/formats/piyoPiyoGrid';

export interface PiyoPiyoExportResult { data: Blob; filename: string; warnings: string[] }

export async function exportPiyoPiyo(song: TrackerSong): Promise<PiyoPiyoExportResult> {
  const src = song.piyoPiyoFileData;
  if (!src) throw new Error('PiyoPiyo export needs the module the song was loaded from');
  const edits: PiyoPiyoGridEdit[] = [];
  song.patterns.forEach((pattern, p) => pattern.channels.forEach((channel, ch) => channel.rows.forEach((cell, row) => {
    edits.push({ pattern: p, row, channel: ch, cell });
  })));
  const data = applyPiyoPiyoGridEdits(new Uint8Array(src), edits);
  const base = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    data: new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer], { type: 'application/octet-stream' }),
    filename: `${base}.pmd`,
    warnings: [],
  };
}
