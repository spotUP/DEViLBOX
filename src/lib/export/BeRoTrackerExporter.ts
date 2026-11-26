/**
 * BeRoTrackerExporter.ts - write a BeRoTracker song back to its own .brt file.
 *
 * The C++ export in the BeRoTrackerEdit build (brt_export_*) takes the file the song was loaded
 * from (beRoTrackerFileData), the grid's cells and its order list; every chunk whose pattern did
 * not change is carried, so an unedited song exports byte-identical. This file only copies
 * numbers in.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { beRoTrackerEditModule, type CreateBeRoTrackerEdit } from '@/engine/berotracker/beRoTrackerEditWasm';

export interface BeRoTrackerExportResult { data: Blob; filename: string; warnings: string[] }

/** The .brt bytes for the song with its grid edits. */
export async function buildBeRoTrackerFile(song: TrackerSong, create?: CreateBeRoTrackerEdit): Promise<Uint8Array> {
  const src = song.beRoTrackerFileData;
  if (!src) throw new Error('BeRoTracker export needs the song file it was loaded from');
  const m = await beRoTrackerEditModule(create);
  const bytes = new Uint8Array(src);
  const ptr = m._malloc(bytes.length);
  m.HEAPU8.set(bytes, ptr);
  const ok = m._brt_export_open(ptr, bytes.length);
  m._free(ptr);
  if (!ok) throw new Error(`BeRoTracker song does not open: ${m.UTF8ToString(m._brt_error())}`);
  try {
    // Pattern index = BeRoTracker pattern number (BeRoTrackerParser).
    song.patterns.forEach((pattern, p) => pattern.channels.forEach((channel, c) => channel.rows.forEach((cell, r) => {
      m._brt_export_cell(p, r, c, cell.note ?? 0, cell.instrument ?? 0, cell.volume ?? 0, cell.effTyp ?? 0, cell.eff ?? 0);
    })));
    const order = song.songPositions.slice(0, 256);
    const op = m._malloc(Math.max(order.length, 1));
    m.HEAPU8.set(order, op);
    const orderOk = m._brt_export_order(op, order.length);
    m._free(op);
    if (!orderOk) throw new Error('BeRoTracker order list must have 1 to 256 positions of patterns 0 to 239');
    const out = m._brt_export_build();
    return m.HEAPU8.slice(out, out + m._brt_export_size());
  } finally {
    m._brt_export_close();
  }
}

export async function exportBeRoTracker(song: TrackerSong): Promise<BeRoTrackerExportResult> {
  const data = await buildBeRoTrackerFile(song);
  const warnings = song.songPositions.length > 256 ? ['BeRoTracker holds 256 order positions; the rest were left out'] : [];
  const base = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return { data: new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' }), filename: `${base}.brt`, warnings };
}
