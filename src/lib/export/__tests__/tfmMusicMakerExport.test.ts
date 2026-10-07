/**
 * G24: a TFM Music Maker edit reaches the module the next play loads (the export had no writer and no layout:
 * the engine played the loaded file). The RLE pack is the inverse of the parser's unpack; an edited note
 * reloads in its cell, unedited cells and the instrument names stay.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseTfmMusicMakerFile, decompressTfm, compressTfm, hasSignature, V05, V13 } from '@/lib/import/formats/TFMMusicMakerParser';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';
import { exportTfmMusicMaker } from '../TfmMusicMakerExporter';

const bytes = new Uint8Array(readFileSync('public/data/songs/tfm-music-maker/rainstorm.tfe'));

describe('TFM Music Maker export', () => {
  it('packs the unpacked header back to a stream that unpacks to the same header', () => {
    const layout = hasSignature(bytes) ? V13 : V05;
    const h = decompressTfm(bytes, layout)!;
    expect(decompressTfm(compressTfm(h, layout), layout)).toEqual(h);
  });

  it('reloads an edited note in its cell and leaves every other cell', async () => {
    const song = await parseTfmMusicMakerFile(bytes, 'rainstorm.tfe');
    setGridBaseline(baselineOf(song.patterns));
    const before = structuredClone(song.patterns);
    let at: { p: number; ch: number; r: number } | null = null;
    song.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, r) => { if (!at && cell.note > 0 && cell.note < 90) at = { p, ch, r }; })));
    const e = at!;
    song.patterns[e.p].channels[e.ch].rows[e.r].note += 2;
    const out = exportTfmMusicMaker(song);
    const back = await parseTfmMusicMakerFile(out.data, 'rainstorm.tfe');
    expect(back.patterns[e.p].channels[e.ch].rows[e.r].note).toBe(before[e.p].channels[e.ch].rows[e.r].note + 2);
    back.patterns[e.p].channels[e.ch].rows[e.r].note -= 2;
    expect(back.patterns.map((p) => p.channels.map((c) => c.rows))).toEqual(before.map((p) => p.channels.map((c) => c.rows)));
    expect(back.instruments.map((i) => i.name)).toEqual(song.instruments.map((i) => i.name));
  });
});
