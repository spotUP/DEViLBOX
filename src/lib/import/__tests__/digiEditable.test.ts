import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseModuleToSong } from '../parseModuleToSong';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';

const PATH = 'public/data/songs/formats/the_day_after.digi';

// One reachability test: the corpus DigiBooster 1.x song (packed patterns) through the importer's entry point.
describe('DigiBooster 1.x editable grid', () => {
  it('imports with a grid, exports byte-exact, and edits repack only their pattern', async () => {
    const raw = readFileSync(PATH);
    const bytes = new Uint8Array(raw);
    const song = await parseModuleToSong(new File([bytes], 'the_day_after.digi'));

    const layout = song.uadePatternLayout!;
    expect(layout.formatId).toBe('digiBooster1');
    expect(song.numChannels).toBe(8);
    let notes = 0;
    song.patterns.forEach((p) => p.channels.forEach((c) => c.rows.forEach((cell) => { if (cell.note > 0) notes++; })));
    expect(notes).toBeGreaterThan(50);

    setGridBaseline(baselineOf(song.patterns));
    const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
    expect(Buffer.from((await exportNativeSong(song))!.data as Uint8Array).equals(raw)).toBe(true);

    // Edit an empty cell (not in the packed stream): the pattern grows by one cell, every other pattern is untouched.
    const pat = song.patterns[0]!;
    const row = pat.channels[7]!.rows.findIndex((_, r) => layout.getCellFileOffset!(0, r, 7) === -1);
    expect(row).toBeGreaterThanOrEqual(0);
    const offBefore = layout.getCellFileOffset!(0, row, 7);
    expect(offBefore).toBe(-1);
    pat.channels[7]!.rows[row] = { ...pat.channels[7]!.rows[row]!, note: 37, instrument: 5 };
    const changed = (await exportNativeSong(song))!.data as Uint8Array;
    expect(changed.length).toBe(bytes.length + 4);

    // Pattern 0's record ends where the original's did, plus 4 bytes; the size field grew by 4 and the tail is identical.
    const size0 = (bytes[1572]! << 8) | bytes[1573]!;
    const end0 = 1572 + 2 + size0;
    expect(((changed[1572]! << 8) | changed[1573]!)).toBe(size0 + 4);
    expect(Buffer.from(changed.subarray(end0 + 4)).equals(Buffer.from(bytes.subarray(end0)))).toBe(true);
    expect(Buffer.from(changed.subarray(0, 1572)).equals(Buffer.from(bytes.subarray(0, 1572)))).toBe(true);
    const again = await parseModuleToSong(new File([changed], 'the_day_after.digi'));
    const got = again.patterns[0]!.channels[7]!.rows[row]!;
    expect([got.note, got.instrument]).toEqual([37, 5]);

    // Edit a cell that exists: written in place at its own offset, length unchanged.
    const song2 = await parseModuleToSong(new File([bytes], 'the_day_after.digi'));
    const l2 = song2.uadePatternLayout!;
    let target: [number, number, number] | null = null;
    song2.patterns.forEach((p, pi) => p.channels.forEach((c, ci) => c.rows.forEach((cell, ri) => {
      if (!target && cell.note > 0 && l2.getCellFileOffset!(pi, ri, ci) >= 0) target = [pi, ri, ci];
    })));
    const [tp, tr, tc] = target!;
    const off = l2.getCellFileOffset!(tp, tr, tc);
    const old = song2.patterns[tp]!.channels[tc]!.rows[tr]!;
    song2.patterns[tp]!.channels[tc]!.rows[tr] = { ...old, note: old.note === 37 ? 38 : 37 };
    const inPlace = (await exportNativeSong(song2))!.data as Uint8Array;
    expect(inPlace.length).toBe(bytes.length);
    let diff = 0;
    for (let i = 0; i < bytes.length; i++) if (inPlace[i] !== bytes[i]) { diff++; expect(i).toBeGreaterThanOrEqual(off); expect(i).toBeLessThan(off + 4); }
    expect(diff).toBeGreaterThan(0);
    expect(l2.decodeCell!(inPlace.subarray(off, off + 4)).note).toBe(old.note === 37 ? 38 : 37);
  }, 120_000);
});
