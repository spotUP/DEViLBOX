/**
 * Sonix TINY (.tiny): Export writes the module with each edited voice stream re-encoded over its slot; unedited, the file comes back byte-identical.
 * Goes through exportNativeSong, the route the Export menu takes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSonixFile } from '@lib/import/formats/SonixMusicDriverParser';
import { exportNativeSong } from '@/lib/export/nativeExportRouter';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';

const FIXTURE = join(process.cwd(), 'public/data/songs/sonix/tiny/It Came From The Desert/maintitle.tiny');

async function load() {
  const b = readFileSync(FIXTURE);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return { ab, raw: new Uint8Array(ab), song: await parseSonixFile(ab.slice(0), 'maintitle.tiny') };
}

describe('Sonix TINY export', () => {
  it('exports unedited byte for byte', async () => {
    const { raw, song } = await load();
    setGridBaseline(baselineOf(song.patterns));
    const out = await exportNativeSong(song);
    setGridBaseline(null);
    expect(out).toBeTruthy();
    expect(Buffer.from(out!.data as Uint8Array).equals(Buffer.from(raw))).toBe(true);
  });

  it('a note edit survives export and reimport', async () => {
    const { raw, song } = await load();
    let at: { p: number; c: number; r: number } | null = null;
    song.patterns.forEach((pat, p) => pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
      if (!at && (cell.note ?? 0) >= 13 && (cell.note ?? 0) < 90) at = { p, c, r };
    })));
    if (!at) throw new Error('no note in fixture');
    const { p, c, r } = at as { p: number; c: number; r: number };
    setGridBaseline(baselineOf(song.patterns));
    const cell = song.patterns[p].channels[c].rows[r];
    const was = cell.note!;
    cell.note = was + 2;
    const out = await exportNativeSong(song);
    setGridBaseline(null);
    const data = out!.data as Uint8Array;
    expect(out!.warnings).toEqual([]);
    expect(data.length).toBe(raw.length);
    expect(Buffer.from(data).equals(Buffer.from(raw))).toBe(false);
    const again = await parseSonixFile(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer, 'maintitle.tiny');
    expect(again.patterns[p].channels[c].rows[r].note).toBe(was + 2);
    // The edited voice keeps every other row: same notes on the same rows, holds stay holds.
    const noteRows = (rows: { note?: number }[]) => rows.map(x => x.note ?? 0);
    const want = noteRows(song.patterns[p].channels[c].rows);
    const got = noteRows(again.patterns[p].channels[c].rows);
    expect(got.slice(0, want.length)).toEqual(want);
  });
});
