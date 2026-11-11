/**
 * ArtOfNoiseExporter.ts - write an Art of Noise (.aon) song back to its own file.
 *
 * The file the song plays (artOfNoiseFileData) gets every grid cell that differs from the stored
 * cell it shows written in (artOfNoiseGrid.ts); every other byte is carried, so an unedited song
 * exports byte-identical. Positions share stored patterns, so only cells that differ are written.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyArtOfNoiseGridEdits, type AonGridEdit } from '@lib/import/formats/artOfNoiseGrid';

export interface ArtOfNoiseExportResult { data: Blob; filename: string; warnings: string[] }

export async function exportArtOfNoise(song: TrackerSong): Promise<ArtOfNoiseExportResult> {
  const src = song.artOfNoiseFileData;
  if (!src) throw new Error('Art of Noise export needs the module the song was loaded from');
  const edits: AonGridEdit[] = [];
  song.patterns.forEach((pattern, p) => pattern.channels.forEach((channel, ch) => channel.rows.forEach((cell, row) => {
    edits.push({ pattern: p, row, channel: ch, cell });
  })));
  const data = applyArtOfNoiseGridEdits(new Uint8Array(src), edits);
  const base = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    data: new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer], { type: 'application/octet-stream' }),
    filename: `${base}.aon`,
    warnings: [],
  };
}
