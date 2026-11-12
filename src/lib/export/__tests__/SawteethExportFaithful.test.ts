/**
 * Sawteeth exporter is the inverse of the parser: parse -> export of an unedited song gives the original bytes,
 * a grid edit changes only the edited stored part step, and a song the stored structure cannot express falls back
 * to the flatten export with a warning. Real songs, no mocks. Unverified by ear: nothing here plays audio.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSawteethFile } from '../../import/formats/SawteethParser';
import { exportSawteeth } from '../SawteethExporter';
import { ST_FX_BASE } from '../../import/formats/commandStreamEffectGlyphs';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const DIR = 'public/data/songs/sawteeth/';
const FILES = ['okolaNUKE.st', 'TEST-all-effects-okolaNUKE.st'];

async function exportBytes(song: TrackerSong): Promise<{ bytes: Uint8Array; warnings: string[] }> {
  const { data, warnings } = await exportSawteeth(song);
  return { bytes: new Uint8Array(await data.arrayBuffer()), warnings };
}

describe.each(FILES)('Sawteeth faithful export: %s', (file) => {
  const original = new Uint8Array(readFileSync(DIR + file));

  it('parse -> export gives the original bytes, no warning', async () => {
    const song = parseSawteethFile(original, file)!;
    const { bytes, warnings } = await exportBytes(song);
    expect(warnings).toEqual([]);
    expect(bytes.length).toBe(original.length);
    expect(bytes).toEqual(original);
  });

  it('one note edit and one effect edit change only those stored bytes; part count and size unchanged', async () => {
    const song = parseSawteethFile(original, file)!;
    const src = (song as unknown as { sawteethGridSource: Array<Array<{ partIdx: number; row: number } | null>> }).sawteethGridSource;
    // first channel-0 row that starts a step with a note and no effect
    const flatCell = (ch: number, r: number) => {
      let rest = r;
      for (const p of song.patterns) {
        if (rest < p.length) return p.channels[ch].rows[rest];
        rest -= p.length;
      }
      throw new Error('row outside song');
    };
    let noteRow = -1;
    let effRow = -1;
    for (let r = 0; r < src[0].length; r++) {
      const c = src[0][r] ? flatCell(0, r) : null;
      if (c && c.note > 0 && c.effTyp === 0) {
        if (noteRow < 0) noteRow = r;
        else if (effRow < 0 && src[0][r]!.partIdx !== src[0][noteRow]!.partIdx) effRow = r;
      }
    }
    expect(noteRow).toBeGreaterThanOrEqual(0);
    expect(effRow).toBeGreaterThanOrEqual(0);
    const noteCell = flatCell(0, noteRow);
    // the store reaches every grid row that plays the same stored step
    const same = (a: { partIdx: number; row: number }, ch: number) => src[ch].flatMap((s, r) => (s && s.partIdx === a.partIdx && s.row === a.row ? [flatCell(ch, r)] : []));
    for (const c of same(src[0][noteRow]!, 0)) c.note = Math.min(95, c.note + 1);
    for (const c of same(src[0][effRow]!, 0)) { c.effTyp = ST_FX_BASE + 0x9; c.eff = 0x5; }

    const { bytes, warnings } = await exportBytes(song);
    expect(warnings).toEqual([]);
    expect(bytes.length).toBe(original.length);
    const diff: number[] = [];
    bytes.forEach((b, i) => { if (b !== original[i]) diff.push(i); });
    // note step: 1 byte (note, +1 whatever the transpose); effect step: 1 byte (effect)
    expect(diff.length).toBe(2);
    const again = parseSawteethFile(bytes, file)!;
    const readBack = (s: TrackerSong, ch: number, r: number) => {
      let rest = r;
      for (const p of s.patterns) {
        if (rest < p.length) return p.channels[ch].rows[rest];
        rest -= p.length;
      }
      throw new Error('row outside song');
    };
    expect(readBack(again, 0, noteRow).note).toBe(noteCell.note);
    expect(readBack(again, 0, effRow).effTyp).toBe(ST_FX_BASE + 0x9);
    expect(readBack(again, 0, effRow).eff).toBe(0x5);
    expect((again as unknown as { sawteethStored: { parts: unknown[] } }).sawteethStored.parts.length)
      .toBe((song as unknown as { sawteethStored: { parts: unknown[] } }).sawteethStored.parts.length);
  });

  it('structural edits fall back to the flatten export and warn', async () => {
    const added = parseSawteethFile(original, file)!;
    added.patterns.push(JSON.parse(JSON.stringify(added.patterns[0])));
    added.songPositions.push(added.patterns.length - 1);
    const a = await exportBytes(added);
    expect(a.warnings.length).toBeGreaterThan(0);
    expect(a.bytes.length).toBeGreaterThan(original.length);

    const reordered = parseSawteethFile(original, file)!;
    if (reordered.songPositions.length > 1) {
      reordered.songPositions.reverse();
      const r = await exportBytes(reordered);
      expect(r.warnings.length).toBeGreaterThan(0);
    }

    const scratch = parseSawteethFile(original, file)!;
    delete (scratch as unknown as { sawteethStored?: unknown }).sawteethStored;
    expect((await exportBytes(scratch)).warnings.length).toBeGreaterThan(0);
  });
});
