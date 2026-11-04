/**
 * KdmExporter.ts - write a Ken Silverman KDM (.kdm) song back to its own file.
 *
 * The file the song plays (kdmFileData) gets every grid cell that differs from
 * the event it shows written in (kdmGrid.ts); every other byte is carried, so
 * an unedited song exports byte-identical.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyKdmGridEdits, type KdmGridEdit } from '@lib/import/formats/kdmGrid';

export interface KdmExportResult { data: Blob; filename: string; warnings: string[] }

export async function exportKdm(song: TrackerSong): Promise<KdmExportResult> {
  const src = song.kdmFileData;
  if (!src) throw new Error('KDM export needs the module the song was loaded from');
  const edits: KdmGridEdit[] = [];
  song.patterns.forEach((pattern, p) => pattern.channels.forEach((channel, ch) => channel.rows.forEach((cell, row) => {
    edits.push({ pattern: p, row, channel: ch, cell });
  })));
  const data = applyKdmGridEdits(new Uint8Array(src), edits);
  const base = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    data: new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer], { type: 'application/octet-stream' }),
    filename: `${base}.kdm`,
    warnings: [],
  };
}
