/**
 * OrganyaExporter.ts - write a Organya (Cave Story) (.org) song back to its own file.
 *
 * The file the song plays (organyaFileData) gets every grid cell that differs from
 * the event it shows written in (organyaGrid.ts); every other byte is carried, so
 * an unedited song exports byte-identical.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyOrganyaGridEdits, type OrganyaGridEdit } from '@lib/import/formats/organyaGrid';

export interface OrganyaExportResult { data: Blob; filename: string; warnings: string[] }

export async function exportOrganya(song: TrackerSong): Promise<OrganyaExportResult> {
  const src = song.organyaFileData;
  if (!src) throw new Error('Organya export needs the module the song was loaded from');
  const edits: OrganyaGridEdit[] = [];
  song.patterns.forEach((pattern, p) => pattern.channels.forEach((channel, ch) => channel.rows.forEach((cell, row) => {
    edits.push({ pattern: p, row, channel: ch, cell });
  })));
  const data = applyOrganyaGridEdits(new Uint8Array(src), edits);
  const base = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    data: new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer], { type: 'application/octet-stream' }),
    filename: `${base}.org`,
    warnings: [],
  };
}
