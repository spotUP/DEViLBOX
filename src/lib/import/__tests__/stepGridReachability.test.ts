/**
 * The step grid (thoughts/shared/plans/2026-11-05-step-grid.md), David Whittaker pilot, through the product's
 * importer (parseModuleToSong): one row is one song step, so garfield2+.dw (speed 10) shows 1 row where it showed 10.
 * The sentinel proves the row clock ran during the import; the rest asserts the plan's stated numbers.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../formats/stepRowClock', async (orig) => {
  const m = await orig<typeof import('../formats/stepRowClock')>();
  return { ...m, makeRowClock: vi.fn(m.makeRowClock) };
});

import { makeRowClock } from '../formats/stepRowClock';
import { parseModuleToSong } from '../parseModuleToSong';
import { walkDavidWhittaker, DW_WALK } from '../formats/DavidWhittakerWasmExtractor';
import { dwRowClock } from '../formats/davidWhittakerGrid';
import { installDwNodeFetch } from './helpers/dwNodeFetch';

let restore = () => {};
beforeAll(() => { restore = installDwNodeFetch(); });
afterAll(() => restore());

const bytesOf = (rel: string): ArrayBuffer => {
  const f = readFileSync(resolve(process.cwd(), 'public/data/songs', rel));
  return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
};

describe('step grid: David Whittaker through parseModuleToSong', () => {
  it('garfield2+.dw: one row per song step, speed 10, 19 patterns, every note on its walk tick', async () => {
    const ab = bytesOf('david-whittaker/garfield2+.dw');
    const before = vi.mocked(makeRowClock).mock.calls.length;
    const song = await parseModuleToSong(new File([ab.slice(0)], 'garfield2+.dw'));
    expect(vi.mocked(makeRowClock).mock.calls.length, 'the row clock ran during the import').toBeGreaterThan(before);

    expect(song.initialSpeed).toBe(10);
    expect(song.initialBPM).toBe(125);                       // no frame skip on this tune
    for (const pat of song.patterns) for (const ch of pat.channels) {
      expect(ch.channelMeta?.effectCols, 'the editor shows every effect slot the grid fills').toBeGreaterThanOrEqual(5);
    }
    expect(song.patterns.length, 'ceil(1217 rows / 64), not 191').toBe(Math.ceil(12161 / 10 / 64));

    const walk = await walkDavidWhittaker(ab.slice(0), 60_000, 0);
    const clock = dwRowClock(walk);
    // note rows per channel over the song order, against the walk's own note ticks
    const rows: number[][] = Array.from({ length: walk.channels }, () => []);
    song.songPositions.forEach((pi, pos) => {
      song.patterns[pi].channels.forEach((ch, c) => ch.rows.forEach((cell, r) => { if (cell.note > 0 && cell.note < 97) rows[c].push(pos * 64 + r); }));
    });
    for (let c = 0; c < walk.channels; c++) {
      const ticks = walk.events.filter((e) => e.channel === c && e.kind === DW_WALK.note).map((e) => e.ptick);
      expect(rows[c].length, `voice ${c + 1} note count`).toBe(ticks.length);
      rows[c].forEach((row, i) => expect(row * song.initialSpeed, `voice ${c + 1} note ${i}`).toBe(ticks[i]));
      expect(ticks.every((t) => clock.tickToRow(t).offset === 0), 'no note off the step').toBe(true);
    }
    const deltas = new Map<number, number>();
    for (const list of rows) for (let i = 1; i < list.length; i++) deltas.set(list[i] - list[i - 1], (deltas.get(list[i] - list[i - 1]) ?? 0) + 1);
    const most = [...deltas.entries()].sort((a, b) => b[1] - a[1])[0][0];
    expect(most, 'the most common gap between notes is 1 row (10 ticks before)').toBe(1);
  });
});
