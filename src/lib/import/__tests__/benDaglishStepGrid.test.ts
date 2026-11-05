/**
 * Ben Daglish step grid behaviour (thoughts/shared/plans/2026-11-05-step-grid.md): the step function and the edit
 * layer. That the import runs the shared clock is proved once, in stepGridReachability.test.ts.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});

import { mainStepFromOnsets } from '../formats/stepRowClock';
import { parseBenDaglishFile } from '../formats/BenDaglishParser';
import { walkBenDaglish } from '../formats/BenDaglishWasmExtractor';
import { applyBdGridEdits } from '../formats/benDaglishEdits';
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

describe('Ben Daglish edits (the wiring is proved in stepGridReachability.test.ts)', () => {
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

  it('motorhead: a delay2 edit on a clash row moves that note onset in the module, nothing else', async () => {
    const path = 'ben-daglish/motorhead-titleandingame.bd';
    const ab = bytesOf(path);
    const song = await parseBenDaglishFile(ab.slice(0), 'motorhead-titleandingame.bd') as unknown as TrackerSong;
    const walk = await walkBenDaglish(ab.slice(0), 0);
    const edited = song.patterns.map((p) => ({ ...p, channels: p.channels.map((c) => ({ ...c, rows: c.rows.map((r) => ({ ...r })) })) }));
    let cell: (typeof edited)[0]['channels'][0]['rows'][0] | undefined;
    for (const p of edited) for (const c of p.channels) for (const r of c.rows) if (!cell && r.note2 && (r.delay2 ?? 0) >= 2) cell = r;
    expect(cell, 'a clash cell with room to move is in the grid').toBeTruthy();
    cell!.delay2 = cell!.delay2! - 1;
    const res = applyBdGridEdits(new Uint8Array(ab), walk, song.uadeVariableLayout!.filePatternAddrs!, edited);
    expect(res.warnings).toEqual([]);
    expect(res.patched, 'two duration bytes').toBe(2);
    // the re-walk: exactly one note starts one tick earlier, the song is as long as before
    const out = res.data.buffer.slice(res.data.byteOffset, res.data.byteOffset + res.data.byteLength) as ArrayBuffer;
    const walk2 = await walkBenDaglish(out, 0);
    // a track plays again on every pass, so an event is told apart by its place and its n-th play
    const keyed = (w: typeof walk) => { const seen = new Map<string, number>(); return new Map(w.events.map((e) => { const k = `${e.voice}:${e.track}:${e.pos}`; const n = seen.get(k) ?? 0; seen.set(k, n + 1); return [`${k}#${n}`, e.ptick] as const; })); };
    const before = keyed(walk), after = keyed(walk2);
    const deltas = [...before].filter(([k, t]) => after.get(k) !== t).map(([k, t]) => t - after.get(k)!);
    expect(deltas.length, 'the edited note moved on every play').toBeGreaterThan(0);
    expect(new Set(deltas), 'each moved one tick earlier, nothing else moved').toEqual(new Set([1]));
    expect(walk2.processedTicks, 'song length unchanged').toBe(walk.processedTicks);
  });
});
