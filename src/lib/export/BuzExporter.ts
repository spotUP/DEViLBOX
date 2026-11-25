/**
 * BuzExporter.ts - write a Buzzic 1 (.buz) / Buzzic 2 (.buz2) song back to its own file.
 *
 * The file the song plays (buzFileData) gets every grid note that differs from the pattern byte
 * it reads written in (buzGrid.ts); every other byte is carried, so an unedited song exports
 * byte-identical.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyBuzGridEdits, buzLayout, type BuzGridEdit } from '@lib/import/formats/buzGrid';

export interface BuzExportResult { data: Blob; filename: string; warnings: string[] }

export async function exportBuz(song: TrackerSong): Promise<BuzExportResult> {
  const src = song.buzFileData;
  if (!src) throw new Error('Buzzic export needs the song file it was loaded from');
  const edits: BuzGridEdit[] = [];
  song.patterns.forEach((pattern, p) => pattern.channels.forEach((channel, ch) => channel.rows.forEach((cell, row) => {
    edits.push({ pattern: p, row, channel: ch, cell });
  })));
  const warnings: string[] = [];
  const bytes = new Uint8Array(src);
  const data = applyBuzGridEdits(bytes, edits, warnings);
  const base = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    data: new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer], { type: 'application/octet-stream' }),
    filename: `${base}.${buzLayout(bytes)?.v2 === false ? 'buz' : 'buz2'}`,
    warnings,
  };
}
