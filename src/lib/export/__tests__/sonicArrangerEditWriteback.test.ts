/**
 * Sonic Arranger (SOARV1.0): an unedited export is the source bytes; a note, instrument or effect edit is written in place into the
 * shared track line and re-imports to the edited grid; a note on an empty row (no place in the module) is refused with a warning and
 * the source kept. Real song (mega end.sa), no fakes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { parseSonicArrangerFile } from '@lib/import/formats/SonicArrangerParser';
import { exportSonicArranger } from '../SonicArrangerExporter';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';

const FILE = join(process.cwd(), 'public/data/songs/sonic-arranger/mega end.sa');
const src = () => new Uint8Array(readFileSync(FILE));
const parse = (b: Uint8Array): Promise<TrackerSong> => parseSonicArrangerFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer, 'mega end.sa');
const load = async () => { const s = await parse(src()); setGridBaseline(baselineOf(s.patterns)); return s; };
const out = async (s: TrackerSong) => { const r = await exportSonicArranger(s); return { bytes: new Uint8Array(await r.data.arrayBuffer()), warnings: r.warnings }; };
const find = (s: TrackerSong, ok: (c: { note: number; instrument: number }) => boolean) => {
  for (let p = 0; p < s.patterns.length; p++) for (let c = 0; c < 4; c++) {
    const rows = s.patterns[p].channels[c].rows;
    for (let r = 0; r < rows.length; r++) if (ok(rows[r])) return { p, c, r };
  }
  throw new Error('no cell');
};
const diffs = (a: Uint8Array, b: Uint8Array) => [...a.keys()].filter((i) => a[i] !== b[i]);

describe('Sonic Arranger edit write-back', () => {
  it('exports an unedited song as the source bytes', async () => {
    expect((await out(await load())).bytes).toEqual(src());
  });

  it('writes a note edit into the track line and re-imports it', async () => {
    const song = await load();
    const { p, c, r } = find(song, (x) => x.note > 20 && x.note < 70);
    const was = song.patterns[p].channels[c].rows[r].note;
    song.patterns[p].channels[c].rows[r].note = was + 2;
    const { bytes, warnings } = await out(song);
    expect(warnings).toEqual([]);
    expect(bytes.length).toBe(src().length);
    expect(diffs(bytes, src()).length).toBeGreaterThan(0);
    expect((await parse(bytes)).patterns[p].channels[c].rows[r].note).toBe(was + 2);
  });

  it('writes an instrument edit and re-imports it', async () => {
    const song = await load();
    const { p, c, r } = find(song, (x) => x.note > 0 && x.note < 90 && x.instrument > 1);
    const cell = song.patterns[p].channels[c].rows[r];
    const was = cell.instrument;
    cell.instrument = was - 1;
    const { bytes, warnings } = await out(song);
    expect(warnings).toEqual([]);
    expect(diffs(bytes, src()).length).toBeGreaterThan(0);
    expect((await parse(bytes)).patterns[p].channels[c].rows[r].instrument).toBe(was - 1);
  });

  it('writes an effect edit (set speed) and re-imports it', async () => {
    const song = await load();
    const { p, c, r } = find(song, (x) => x.note > 0 && x.note < 90);
    const cell = song.patterns[p].channels[c].rows[r];
    cell.effTyp = 0x0F; cell.eff = 5; cell.volume = 0;
    const { bytes, warnings } = await out(song);
    expect(warnings).toEqual([]);
    const again = (await parse(bytes)).patterns[p].channels[c].rows[r];
    expect([again.effTyp, again.eff]).toEqual([0x0F, 5]);
  });

  it('names an effect the track line cannot store instead of dropping it silently', async () => {
    const song = await load();
    const { p, c, r } = find(song, (x) => x.note > 0 && x.note < 90);
    const cell = song.patterns[p].channels[c].rows[r];
    cell.effTyp = 0x04; cell.eff = 0x33; // vibrato: Sonic Arranger has no such effect
    const { bytes, warnings } = await out(song);
    expect(warnings.some((w) => w.includes('not written'))).toBe(true);
    expect(bytes).toEqual(src());
  });
});
