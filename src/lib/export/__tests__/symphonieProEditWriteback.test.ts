/**
 * SymphoniePro export keeps the source module: unedited export is byte-identical, and an edited cell
 * is the only pattern event that changes and reloads as the edit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSymphonieProFile } from '@/lib/import/formats/SymphonieProParser';
import { sharedCellEdits } from '@/lib/song/sharedCellEdits';
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

  const view = (song: NonNullable<Awaited<ReturnType<typeof load>>>) => song.patterns.map((p) => p.channels.map((c) => c.rows.map((r) => JSON.stringify([r.note, r.instrument, r.volume, r.effTyp, r.eff]))));

  it('an edit changes exactly the cells sharing it', async () => {
    const song = (await load(new Uint8Array(readFileSync(FIXTURE))))!;
    const layout = song.uadePatternLayout!;
    const linear = (p: number, r: number, c: number) => (p * layout.rowsPerPattern * layout.numChannels + r * layout.numChannels + c) * 4;
    // The fixture plays raw blocks out of grid order, so a linear guess is wrong for some grid pattern.
    const p = song.patterns.findIndex((_, i) => layout.getCellFileOffset!(i, 0, 0) !== linear(i, 0, 0));
    expect(p).toBeGreaterThanOrEqual(0);
    const r = 2; const ch = 3;
    const at = layout.getCellFileOffset!(p, r, ch);
    const sharing = new Set<string>();
    song.patterns.forEach((pt, pi) => pt.channels.forEach((c, ci) => c.rows.forEach((_, ri) => { if (layout.getCellFileOffset!(pi, ri, ci) === at) sharing.add(`${pi}/${ci}/${ri}`); })));
    const before = view(song);
    const cell = song.patterns[p].channels[ch].rows[r];
    Object.assign(cell, { note: 50, instrument: 2, volume: 0, effTyp: 0, eff: 0 });
    const beforePattern = { channels: before[p].map((c) => ({ rows: c.map((v) => { const [note, instrument, volume, effTyp, eff] = JSON.parse(v); return { note, instrument, volume, effTyp, eff }; }) })) };
    for (const e of sharedCellEdits(layout, p, beforePattern as never, song.patterns[p] as never, song.patterns as never)) Object.assign(song.patterns[e.pattern].channels[e.channel].rows[e.row], e.values);
    const back = view((await load(exportSymphonieProFile(song)))!);
    const changed = new Set<string>();
    back.forEach((pt, pi) => pt.forEach((c, ci) => c.forEach((v, ri) => { if (v !== before[pi][ci][ri]) changed.add(`${pi}/${ci}/${ri}`); })));
    expect([...changed].sort()).toEqual([...sharing].sort());
    expect(sharing.has(`${p}/${ch}/${r}`)).toBe(true);
  });

  it('effects the encoder can express (tremolo, sample offset) reload as written', async () => {
    const song = (await load(new Uint8Array(readFileSync(FIXTURE))))!;
    const a = song.patterns[0].channels[1].rows[3];
    const b = song.patterns[0].channels[2].rows[5];
    Object.assign(a, { note: 40, instrument: 1, volume: 0, effTyp: 0x07, eff: 0x38 });
    Object.assign(b, { note: 41, instrument: 1, volume: 0, effTyp: 0x09, eff: 0x20 });
    const back = (await load(exportSymphonieProFile(song)))!;
    const [ba, bb] = [back.patterns[0].channels[1].rows[3], back.patterns[0].channels[2].rows[5]];
    expect([ba.effTyp, ba.eff]).toEqual([0x07, 0x38]);
    expect([bb.effTyp, bb.eff]).toEqual([0x09, 0x20]);
  });

  it('an effect with no Symphonie event keeps the source event instead of dropping to a plain key-on', async () => {
    const song = (await load(new Uint8Array(readFileSync(FIXTURE))))!;
    const cell = song.patterns[2].channels[6].rows[1]; // a volume slide in the fixture
    expect(cell.effTyp).toBe(0x0A);
    const orig = JSON.stringify(cell);
    cell.effTyp = 0x0C;
    cell.eff = 0x40;
    const back = (await load(exportSymphonieProFile(song)))!;
    expect(JSON.stringify(back.patterns[2].channels[6].rows[1])).toBe(orig);
  });
});
