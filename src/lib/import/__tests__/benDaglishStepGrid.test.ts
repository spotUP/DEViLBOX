/**
 * The step grid (thoughts/shared/plans/2026-11-05-step-grid.md), Ben Daglish, through the product's importer
 * (parseBenDaglishFile): one fixed clock per song, a note off the step carries its delay in the first effect slot, a second
 * note on one row goes to note column 2. The sentinel proves the shared row clock and step function ran during the import.
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
import { parseBenDaglishFile } from '../formats/BenDaglishParser';
import { walkBenDaglish } from '../formats/BenDaglishWasmExtractor';
import { bdNotePlacements, bdRowClock } from '../formats/benDaglishGrid';
import { applyBdGridEdits } from '../formats/benDaglishEdits';
import { BD_FX } from '../formats/benDaglishEffectGlyphs';
import { installWasmNodeFetch } from './helpers/dwNodeFetch';
import type { TrackerSong } from '@/engine/TrackerReplayer';

let restore = () => {};
beforeAll(() => { restore = installWasmNodeFetch('bd', 'Bd'); });
afterAll(() => restore());

const bytesOf = (rel: string): ArrayBuffer => {
  const f = readFileSync(resolve(process.cwd(), 'public/data/songs', rel));
  return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
};

describe('mainStepFromOnsets', () => {
  it('GCD of the two most common gaps', () => {
    expect(mainStepFromOnsets([[0, 5, 10, 20, 25, 30, 40]])).toBe(5);
    expect(mainStepFromOnsets([[0, 8, 16, 32, 40, 48, 64]])).toBe(8);
    expect(mainStepFromOnsets([])).toBe(1);
  });
});

const SONGS = [
  { path: 'ben-daglish/motorhead-titleandingame.bd', step: 5, delayed: 32, clashes: 16, delayedVoice: 3 },
  { path: 'formats/mickey_mouse.bd', step: 8, delayed: 118, clashes: 0, delayedVoice: 1 },
];

describe('step grid: Ben Daglish through parseBenDaglishFile', () => {
  for (const s of SONGS) {
    it(`${s.path}: step ${s.step}, ${s.delayed} delayed notes, ${s.clashes} same-row clashes`, async () => {
      const ab = bytesOf(s.path);
      const clockCalls = vi.mocked(makeRowClock).mock.calls.length;
      const stepCalls = vi.mocked(mainStepFromOnsets).mock.calls.length;
      const song = await parseBenDaglishFile(ab.slice(0), s.path.split('/').pop()!) as unknown as TrackerSong;
      expect(vi.mocked(makeRowClock).mock.calls.length, 'the row clock ran during the import').toBeGreaterThan(clockCalls);
      expect(vi.mocked(mainStepFromOnsets).mock.calls.length, 'the shared step function ran during the import').toBeGreaterThan(stepCalls);

      expect(song.initialSpeed).toBe(s.step);

      const walk = await walkBenDaglish(ab.slice(0), 0);
      const clock = bdRowClock(walk);
      const { placed, unplaced } = bdNotePlacements(walk, clock);
      expect(unplaced.length).toBe(0);
      const delayed = placed.filter((p) => p.offset > 0);
      const clashes = placed.filter((p) => p.col === 1);
      expect(delayed.length, 'delayed notes').toBe(s.delayed);
      expect(clashes.length, 'same-row clashes').toBe(s.clashes);
      expect(new Set(delayed.map((p) => p.voice)), 'delayed voices').toEqual(new Set([s.delayedVoice]));
      if (s.clashes) expect(new Set(clashes.map((p) => p.voice)), 'clash voices').toEqual(new Set([s.delayedVoice]));

      // the song shows them: every delayed col-0 note carries the offset in its first effect slot, every clash is in note column 2 with its delay
      let shownOffsets = 0, shownNote2 = 0;
      song.songPositions.forEach((pi) => song.patterns[pi].channels.forEach((ch) => ch.rows.forEach((cell) => {
        if (cell.effTyp === BD_FX.rowOffset) shownOffsets++;
        if (cell.note2) shownNote2++;
      })));
      expect(shownNote2).toBe(s.clashes);
      expect(shownOffsets, 'offset effects in the first slot').toBe(placed.filter((p) => p.col === 0 && p.offset > 0).length);
    });
  }

  it('motorhead: an edit of a note in note column 2 is written to the module', async () => {
    const path = 'ben-daglish/motorhead-titleandingame.bd';
    const ab = bytesOf(path);
    const song = await parseBenDaglishFile(ab.slice(0), 'motorhead-titleandingame.bd') as unknown as TrackerSong;
    const walk = await walkBenDaglish(ab.slice(0), 0);
    const edited = song.patterns.map((p) => ({ ...p, channels: p.channels.map((c) => ({ ...c, rows: c.rows.map((r) => ({ ...r })) })) }));
    let done = false;
    for (const p of edited) { for (const c of p.channels) { for (const r of c.rows) { if (!done && r.note2 && r.note2 < 90) { r.note2 += 1; done = true; } } } }
    expect(done, 'a note column 2 exists').toBe(true);
    const res = applyBdGridEdits(new Uint8Array(ab), walk, song.uadeVariableLayout!.filePatternAddrs!, edited);
    expect(res.warnings).toEqual([]);
    expect(res.patched, 'one byte changed').toBe(1);
  });
});
