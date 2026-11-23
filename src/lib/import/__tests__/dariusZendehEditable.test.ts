/**
 * Darius Zendeh (crash and burn.dz) is editable: every grid cell encodes back to its file bytes, an unedited export
 * is byte-identical, an edited note changes only its note byte and reloads as the new note.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDariusZendehFile } from '@/lib/import/formats/DariusZendehParser';
import { exportDariusZendeh } from '@/lib/export/DariusZendehExporter';
import { exportNativeSong } from '@/lib/export/nativeExportRouter';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';

const NAME = 'crash and burn.dz';
const raw = readFileSync(`public/data/songs/darius-zendeh/${NAME}`);
const bytes = new Uint8Array(raw);
const load = async () => (await parseDariusZendehFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, NAME))!;
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);

describe('Darius Zendeh grid and export', () => {
  it('every cell encodes back to its file bytes and shows a played note', async () => {
    const song = await load();
    const layout = song.uadePatternLayout!;
    expect(layout.formatId).toBe('dariusZendeh');
    let notes = 0;
    song.patterns.forEach((p, pat) => p.channels.forEach((c, ch) => c.rows.forEach((cell, row) => {
      const at = layout.getCellFileOffset!(pat, row, ch);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(Array.from(layout.encodeCell(cell))).toEqual(Array.from(bytes.subarray(at, at + 4)));
      if (cell.note > 0) notes++;
    })));
    expect(notes).toBeGreaterThan(0);
  });

  it('an unedited song exports byte-identical', async () => {
    const song = await load();
    setGridBaseline(baselineOf(song.patterns));
    const r = await exportDariusZendeh(song);
    expect(diffAt(r.data, bytes)).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('an edited note changes only its note byte, through the export router, and reloads', async () => {
    const song = await load();
    setGridBaseline(baselineOf(song.patterns));
    const layout = song.uadePatternLayout!;
    // A cell whose pattern plays at one step only, and whose note one semitone up exists in the period table.
    const uses = new Map<number, number>();
    song.songPositions.forEach((p) => uses.set(p, (uses.get(p) ?? 0) + 1));
    let hit: { pat: number; ch: number; row: number; at: number; note: number } | null = null;
    song.patterns.forEach((p, pat) => p.channels.forEach((c, ch) => c.rows.forEach((cell, row) => {
      if (hit || cell.note <= 0 || uses.get(pat) !== 1) return;
      if (layout.storeNote!(pat, row, ch, cell.note + 1)) hit = { pat, ch, row, at: layout.getCellFileOffset!(pat, row, ch), note: cell.note };
    })));
    expect(hit).not.toBeNull();
    const x = hit!;
    song.patterns[x.pat].channels[x.ch].rows[x.row].note = x.note + 1;
    const out = await exportNativeSong(song, {});
    expect(out).not.toBeNull();
    const data = out!.data instanceof Blob ? new Uint8Array(await out!.data.arrayBuffer()) : new Uint8Array(out!.data as unknown as Uint8Array);
    expect(diffAt(data, bytes)).toEqual([x.at + 1]);
    const re = (await parseDariusZendehFile(data.slice().buffer as ArrayBuffer, NAME))!;
    expect(re.patterns[x.pat].channels[x.ch].rows[x.row].note).toBe(x.note + 1);
  });
});
