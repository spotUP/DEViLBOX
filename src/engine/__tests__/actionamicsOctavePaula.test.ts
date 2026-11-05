/**
 * Actionamics octave: the grid names a note by the period Paula plays.
 * Measured on dynablaster.ast through UADE (AUDxPER log, periodToPitch) against the
 * parsed grid, absolute pitch. One mapping (AST_NOTE_OFFSET + AST_PERIODS in
 * actionamicsGrid.ts) serves the parser walk (cellOf) and the edit encoder (cellToAstEvent).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openUade } from './gridOracle';
import { paulaNotes, lcs, type LogModule } from '../../../tools/uade-audit/gridVsPaulaCore';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';
import { parseActionamicsFile } from '@/lib/import/formats/ActionamicsParser';
import { AST_NOTE_OFFSET, AST_PERIODS } from '@/lib/import/formats/actionamicsGrid';
import { periodToNote } from '@/lib/amiga/periodNotes';

const DIR = join(process.cwd(), 'public/data/songs/actionamics');
const FILE = 'dynablaster.ast';
let restore = () => {};
let mod: LogModule;
beforeAll(async () => { restore = installDwNodeFetch(); mod = (await openUade()) as unknown as LogModule; });
afterAll(() => { restore(); try { mod._uade_wasm_cleanup(); } catch { /* ignore */ } });

describe('Actionamics octave', () => {
  it('table index i shows periodToNote(AST_PERIODS[i]); 856 = C-1, 428 = C-2', () => {
    expect(periodToNote(428)).toBe(25);
    for (let i = 22; i < AST_PERIODS.length; i++) {
      if (AST_PERIODS[i] < 107 || AST_PERIODS[i] === 3816) continue;
      expect(i - AST_NOTE_OFFSET, `index ${i} period ${AST_PERIODS[i]}`).toBe(periodToNote(AST_PERIODS[i]));
    }
    expect(AST_PERIODS[34 + 12]).toBe(428);
  });

  it('grid notes equal the pitch Paula plays (absolute)', async () => {
    const bytes = new Uint8Array(readFileSync(join(DIR, FILE)));
    const song = parseActionamicsFile(bytes, FILE)!;
    expect(song).toBeTruthy();
    const grid: number[][] = song.patterns[0].channels.map(() => []);
    const order = song.songPositions?.length ? song.songPositions : song.patterns.map((_, i) => i);
    for (const p of order) song.patterns[p]?.channels.forEach((c, ch) => c.rows.forEach((r) => { if (r.note > 0 && r.note < 97) grid[ch].push(r.note); }));
    const paula = await paulaNotes(mod, bytes, FILE, DIR, 30);
    let matched = 0;
    const report: string[] = [];
    for (let ch = 0; ch < grid.length; ch++) {
      if (grid[ch].length < 8) continue;
      let best = 0;
      for (let v = 0; v < 4; v++) best = Math.max(best, lcs(grid[ch].slice(0, 24), paula.loose[v].slice(0, 30)));
      report.push(`ch${ch}:${best}`);
      if (best >= 16) matched++;
    }
    expect(matched, `voices with 16+ of the first 24 grid notes in order, absolute (${report.join(' ')})`).toBeGreaterThanOrEqual(1);
  }, 120_000);
});
