/**
 * The step grid (thoughts/shared/plans/2026-11-05-step-grid.md), David Whittaker pilot and Ben Daglish, through the product's
 * importer (parseModuleToSong): one row is one song step, so garfield2+.dw (speed 10) shows 1 row where it showed 10.
 * The sentinel proves the row clock ran during the import; the rest asserts the plan's stated numbers.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../formats/stepRowClock', async (orig) => {
  const m = await orig<typeof import('../formats/stepRowClock')>();
  return { ...m, makeRowClock: vi.fn(m.makeRowClock), mainStepFromOnsets: vi.fn(m.mainStepFromOnsets) };
});
vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});

import { makeRowClock, mainStepFromOnsets } from '../formats/stepRowClock';
import { parseModuleToSong } from '../parseModuleToSong';
import { walkDavidWhittaker, DW_WALK } from '../formats/DavidWhittakerWasmExtractor';
import { dwRowClock } from '../formats/davidWhittakerGrid';
import { parseBenDaglishFile } from '../formats/BenDaglishParser';
import { walkBenDaglish } from '../formats/BenDaglishWasmExtractor';
import { bdNotePlacements, bdRowClock } from '../formats/benDaglishGrid';
import { BD_FX } from '../formats/benDaglishEffectGlyphs';
import { installWasmNodeFetches } from './helpers/dwNodeFetch';
import type { TrackerSong } from '@/engine/TrackerReplayer';

let restore = () => {};
beforeAll(() => { restore = installWasmNodeFetches([['davidwhittaker', 'DavidWhittaker'], ['bd', 'Bd']]); });
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
    expect(song.patterns.length, 'ceil(1216 rows / 64), not 191').toBe(Math.ceil(12160 / 10 / 64));

    const walk = await walkDavidWhittaker(ab.slice(0), 60_000, 0);
    const clock = dwRowClock(walk);
    // (a note on the wrap tick starts the next pass: the order loop plays it at row 0, so the grid does not draw it)
    // note rows per channel over the song order, against the walk's own note ticks
    const rows: number[][] = Array.from({ length: walk.channels }, () => []);
    song.songPositions.forEach((pi, pos) => {
      song.patterns[pi].channels.forEach((ch, c) => ch.rows.forEach((cell, r) => { if (cell.note > 0 && cell.note < 97) rows[c].push(pos * 64 + r); }));
    });
    for (let c = 0; c < walk.channels; c++) {
      const ticks = walk.events.filter((e) => e.channel === c && e.kind === DW_WALK.note && e.ptick < walk.processedTicks).map((e) => e.ptick);
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

const BD_SONGS = [
  { path: 'ben-daglish/motorhead-titleandingame.bd', step: 5, delayed: 32, clashes: 16, delayedVoice: 3 },
  { path: 'formats/mickey_mouse.bd', step: 8, delayed: 118, clashes: 0, delayedVoice: 1 },
];

describe('step grid: Ben Daglish through parseBenDaglishFile', () => {
  for (const s of BD_SONGS) {
    it(`${s.path}: step ${s.step}, ${s.delayed} delayed notes, ${s.clashes} same-row clashes`, async () => {
      const ab = bytesOf(s.path);
      const clockCalls = vi.mocked(makeRowClock).mock.calls.length;
      const stepCalls = vi.mocked(mainStepFromOnsets).mock.calls.length;
      const song = await parseBenDaglishFile(ab.slice(0), s.path.split('/').pop()!) as unknown as TrackerSong;
      expect(vi.mocked(makeRowClock).mock.calls.length, 'the row clock ran during the import').toBeGreaterThan(clockCalls);
      expect(vi.mocked(mainStepFromOnsets).mock.calls.length, 'the shared step function ran during the import').toBeGreaterThan(stepCalls);

      expect(song.initialSpeed).toBe(s.step);

      const walk = await walkBenDaglish(ab.slice(0), 0);
      const { placed, unplaced } = bdNotePlacements(walk, bdRowClock(walk));
      expect(unplaced.length).toBe(0);
      const delayed = placed.filter((p) => p.offset > 0);
      const clashes = placed.filter((p) => p.col === 1);
      expect(delayed.length, 'delayed notes').toBe(s.delayed);
      expect(clashes.length, 'same-row clashes').toBe(s.clashes);
      expect(new Set(delayed.map((p) => p.voice)), 'delayed voices').toEqual(new Set([s.delayedVoice]));
      if (s.clashes) expect(new Set(clashes.map((p) => p.voice)), 'clash voices').toEqual(new Set([s.delayedVoice]));

      // the song shows them: a delayed note carries its offset in the first effect slot, a clash is in note column 2 with its own delay
      let shownOffsets = 0, shownNote2 = 0, shownDelay2 = 0;
      song.songPositions.forEach((pi) => song.patterns[pi].channels.forEach((ch) => ch.rows.forEach((cell) => {
        if (cell.effTyp === BD_FX.rowOffset) shownOffsets++;
        if (cell.note2) { shownNote2++; if ((cell.delay2 ?? 0) > 0) shownDelay2++; }
      })));
      expect(shownNote2).toBe(s.clashes);
      expect(shownDelay2, 'note column 2 delays shown').toBe(clashes.filter((p) => p.offset > 0).length);
      expect(shownOffsets, 'offset effects in the first slot').toBe(placed.filter((p) => p.col === 0 && p.offset > 0).length);
    });
  }
});
