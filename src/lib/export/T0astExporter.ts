/**
 * T0astExporter.ts - write a T0AST song back to its own .t0ast file.
 *
 * The C++ export in the T0astEdit build (t0ast_export_*) takes the file the song was loaded from
 * (t0astFileData), the grid's cells and its order list; patterns whose cells did not change and
 * the whole header are carried, so an unedited song exports byte-identical. This file only
 * copies numbers in.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { t0astEditModule, type CreateT0astEdit } from '@/engine/t0ast/t0astEditWasm';

export interface T0astExportResult { data: Blob; filename: string; warnings: string[] }

/** The .t0ast bytes for the song with its grid edits. */
export async function buildT0astFile(song: TrackerSong, create?: CreateT0astEdit): Promise<Uint8Array> {
  const src = song.t0astFileData;
  if (!src) throw new Error('T0AST export needs the song file it was loaded from');
  const m = await t0astEditModule(create);
  const bytes = new Uint8Array(src);
  const ptr = m._malloc(bytes.length);
  m.HEAPU8.set(bytes, ptr);
  const ok = m._t0ast_export_open(ptr, bytes.length);
  m._free(ptr);
  if (!ok) throw new Error(`T0AST song does not open: ${m.UTF8ToString(m._t0ast_error())}`);
  try {
    // Pattern index = T0AST pattern number (T0astParser).
    song.patterns.forEach((pattern, p) => pattern.channels.forEach((channel, c) => channel.rows.forEach((cell, r) => {
      m._t0ast_export_cell(p, r, c, cell.note ?? 0, cell.volume ?? 0, cell.effTyp ?? 0, cell.eff ?? 0, cell.effTyp2 ?? 0, cell.eff2 ?? 0);
    })));
    const order = song.songPositions.slice(0, 256);
    const op = m._malloc(Math.max(order.length, 1));
    m.HEAPU8.set(order, op);
    const orderOk = m._t0ast_export_order(op, order.length);
    m._free(op);
    if (!orderOk) throw new Error('T0AST order list must have 1 to 256 positions');
    const out = m._t0ast_export_build();
    return m.HEAPU8.slice(out, out + m._t0ast_export_size());
  } finally {
    m._t0ast_export_close();
  }
}

export async function exportT0ast(song: TrackerSong): Promise<T0astExportResult> {
  const data = await buildT0astFile(song);
  const warnings = song.songPositions.length > 256 ? ['T0AST holds 256 order positions; the rest were left out'] : [];
  const base = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return { data: new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' }), filename: `${base}.t0ast`, warnings };
}
