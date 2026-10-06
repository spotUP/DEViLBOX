/**
 * JochenHippelSTExporter - write a Jochen Hippel Atari ST song back to its
 * own file (.hst with its replay code, .soc packed COSO, .sog raw TFMX), with
 * the grid's edits.
 *
 * UADE plays a playback image of the song (one event per pattern row,
 * JochenHippelSTSong.ts); the image carries the file it was built from.
 * That file is decoded, every grid cell that differs from the song as decoded
 * is written into it - a raw TFMX pattern row in place, a COSO pattern packed
 * again - and the file is encoded: byte-exact where nothing was edited.
 *
 * Not the chip-RAM readback: that is the playback image.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { HstSongEdit, applyHstGrid, hstSourceOfImage } from '@lib/import/formats/JochenHippelSTSong';

export function exportJochenHippelST(song: TrackerSong): { data: Uint8Array; filename: string; warnings: string[] } {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Jochen Hippel ST export needs the song the grid was loaded from');
  const image = new Uint8Array(src);
  const edit = new HstSongEdit(hstSourceOfImage(image) ?? image);
  const refused = applyHstGrid(edit, song.patterns);
  const m = edit.module;
  const ext = m.song.kind === 'raw' ? 'sog' : m.prefix.length > 0 ? 'hst' : 'soc';
  const stem = song.name.replace(/\s*\[Jochen Hippel ST\]$/, '') || 'song';
  return {
    data: edit.exportFile(),
    filename: `${stem}.${ext}`,
    warnings: refused.length ? [`${refused.length} edited cell(s) cannot be written (note or instrument out of the step's transpose range): ${refused.slice(0, 8).join(', ')}`] : [],
  };
}
