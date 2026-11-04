/**
 * JxsExporter.ts - write a JayTrax (.jxs) song back to its own file.
 *
 * The file the song plays (jxsFileData) gets every grid cell that differs from the pattern
 * row it shows written in (jxsGrid.ts); every other byte is carried, so an unedited song
 * exports byte-identical.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyJxsGridEdits, type JxsGridEdit } from '@lib/import/formats/jxsGrid';

export interface JxsExportResult { data: Blob; filename: string; warnings: string[] }

export async function exportJxs(song: TrackerSong): Promise<JxsExportResult> {
  const src = (song as TrackerSong & { jxsFileData?: ArrayBuffer }).jxsFileData;
  if (!src) throw new Error('JXS export needs the module the song was loaded from');
  const edits: JxsGridEdit[] = [];
  song.patterns.forEach((pattern, p) => pattern.channels.forEach((channel, ch) => channel.rows.forEach((cell, row) => {
    edits.push({ pattern: p, row, channel: ch, cell });
  })));
  const data = applyJxsGridEdits(new Uint8Array(src), edits);
  const base = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    data: new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer], { type: 'application/octet-stream' }),
    filename: `${base}.jxs`,
    warnings: [],
  };
}
