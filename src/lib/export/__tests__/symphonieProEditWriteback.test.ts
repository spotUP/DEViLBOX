/**
 * SymphoniePro export keeps the source module: unedited export is byte-identical, and an edited cell
 * is the only pattern event that changes and reloads as the edit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSymphonieProFile } from '@/lib/import/formats/SymphonieProParser';
import { exportSymphonieProFile } from '../SymphonieProExporter';

const FIXTURE = 'public/data/songs/symphonie/pas 2 jade.symmod';

const load = (b: Uint8Array) => parseSymphonieProFile(new Uint8Array(b), 'pas 2 jade.symmod');

describe('SymphoniePro export keeps the module', () => {
  it('unedited export is byte-identical', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const out = exportSymphonieProFile((await load(raw))!);
    expect(out.length).toBe(raw.length);
    expect(out.every((b, i) => b === raw[i])).toBe(true);
  });

  it('an edited cell reloads as the edit and other cells are unchanged', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = (await load(raw))!;
    const cell = song.patterns[0].channels[1].rows[3];
    const before = song.patterns.map((p) => p.channels.map((c) => c.rows.map((r) => [r.note, r.instrument, r.volume, r.effTyp, r.eff].join(','))));
    cell.note = cell.note === 60 ? 61 : 60;
    cell.instrument = 2;
    const back = (await load(exportSymphonieProFile(song)))!;
    const bc = back.patterns[0].channels[1].rows[3];
    expect([bc.note, bc.instrument]).toEqual([cell.note, 2]);
    const after = back.patterns.map((p) => p.channels.map((c) => c.rows.map((r) => [r.note, r.instrument, r.volume, r.effTyp, r.eff].join(','))));
    let diffs = 0;
    after.forEach((p, i) => p.forEach((c, j) => c.forEach((r, k) => { if (r !== before[i][j][k]) diffs++; })));
    expect(diffs).toBeGreaterThanOrEqual(1);
    expect(diffs).toBeLessThanOrEqual(2); // the edit (a raw pattern block can show in two grid patterns)
  });
});
