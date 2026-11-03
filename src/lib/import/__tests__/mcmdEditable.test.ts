import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseModuleToSong } from '../parseModuleToSong';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';

const PATH = 'public/data/songs/formats/ep-trmonsterbusiness.mcmd';

// One reachability test: the corpus MCMD song through the importer's entry point.
describe('MCMD editable grid', () => {
  it('imports with a grid, round-trips byte-exact, and an edit lands in the native export', async () => {
    const raw = readFileSync(PATH);
    const bytes = new Uint8Array(raw);
    const song = await parseModuleToSong(new File([bytes], 'ep-trmonsterbusiness.mcmd'));

    const layout = song.uadePatternLayout!;
    expect(layout.formatId).toBe('mcmd');
    expect(song.numChannels).toBe(4);

    let notes = 0;
    const out = new Uint8Array(bytes);
    song.patterns.forEach((pat, p) => pat.channels.forEach((chan, ch) => chan.rows.forEach((cell, row) => {
      if (cell.note > 0) notes++;
      const off = layout.getCellFileOffset!(p, row, ch);
      out.set(layout.encodeCell(cell, bytes.subarray(off, off + 2)), off);
    })));
    expect(notes).toBeGreaterThan(50);
    expect(Buffer.from(out).equals(raw)).toBe(true);

    setGridBaseline(baselineOf(song.patterns));
    const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
    expect(Buffer.from((await exportNativeSong(song))!.data as Uint8Array).equals(raw)).toBe(true);

    const row = song.patterns[0].channels[1].rows.findIndex((c) => c.note === 0);
    const off = layout.getCellFileOffset!(0, row, 1);
    song.patterns[0].channels[1].rows[row] = { ...song.patterns[0].channels[1].rows[row], note: 37, instrument: 5 };
    const changed = (await exportNativeSong(song))!.data as Uint8Array;
    expect(changed[off]).toBe(36);
    expect(changed[off + 1]! & 0x3F).toBe(4);
    expect(changed.length).toBe(bytes.length);
    let diff = 0;
    for (let i = 0; i < bytes.length; i++) if (changed[i] !== bytes[i]) diff++;
    expect(diff).toBeLessThanOrEqual(2);
  }, 120_000);
});
