/**
 * JxsExporter.ts - write a JayTrax (.jxs) song back to its own file.
 *
 * The file the song plays (jxsFileData) gets every edited grid cell written in (jxsGrid.ts); every other byte is carried, so an unedited song
 * exports byte-identical.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyJxsGridEdits, type JxsGridEdit } from '@lib/import/formats/jxsGrid';
import { editedCells, getGridBaseline } from '@/lib/song/gridBaseline';

export interface JxsExportResult { data: Blob; filename: string; warnings: string[] }

export async function exportJxs(song: TrackerSong): Promise<JxsExportResult> {
  const src = (song as TrackerSong & { jxsFileData?: ArrayBuffer }).jxsFileData;
  if (!src) throw new Error('JXS export needs the module the song was loaded from');
  // A stored pattern can play at several timeline places, so the grid shows it as several copies. Only the cells the user
  // changed since the baseline are written: a stale copy of a pattern edited elsewhere must not write the old row back.
  // Without a baseline (a song built outside the loader) every cell is compared with the file.
  const edits: JxsGridEdit[] = getGridBaseline() ? editedCells(song.patterns) : [];
  if (!getGridBaseline()) {
    song.patterns.forEach((pattern, p) => pattern.channels.forEach((channel, ch) => channel.rows.forEach((cell, row) => {
      edits.push({ pattern: p, row, channel: ch, cell });
    })));
  }
  const data = applyJxsGridEdits(new Uint8Array(src), edits);
  const base = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    data: new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer], { type: 'application/octet-stream' }),
    filename: `${base}.jxs`,
    warnings: [],
  };
}
