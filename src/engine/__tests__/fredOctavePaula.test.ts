/**
 * Fred Editor octave: the grid names a note by the period Paula plays.
 * Measured on bomb jack.fred through UADE (AUDxPER log, periodToPitch) against the
 * parsed grid, absolute pitch (not intervals). Edit path: byte <-> grid note is one
 * mapping (NOTE_OFFSET in fredEditorGrid.ts) used by fredLineToCell and cellToFredLine.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openUade } from './gridOracle';
import { paulaNotes, type LogModule } from '../../../tools/uade-audit/gridVsPaulaCore';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';
import { parseFredEditorFile } from '@/lib/import/formats/FredEditorParser';
import { fredLineToCell, cellToFredLine } from '@/lib/import/formats/fredEditorGrid';
import { periodToNote } from '@/lib/amiga/periodNotes';

const DIR = join(process.cwd(), 'public/data/songs/formats');
const FILE = 'bomb jack.fred';
let restore = () => {};
let mod: LogModule;
beforeAll(async () => { restore = installDwNodeFetch(); mod = (await openUade()) as unknown as LogModule; });
afterAll(() => { restore(); try { mod._uade_wasm_cleanup(); } catch { /* ignore */ } });

describe('Fred Editor octave', () => {
  it('grid notes equal the pitch Paula plays (absolute), and byte 36 = period 428 = C-2', async () => {
    const bytes = new Uint8Array(readFileSync(join(DIR, FILE)));
    const song = (await parseFredEditorFile(bytes.slice().buffer as ArrayBuffer, FILE))!;
    expect(song).toBeTruthy();
    const grid: number[][] = song.patterns[0].channels.map(() => []);
    const order = song.songPositions?.length ? song.songPositions : song.patterns.map((_, i) => i);
    for (const p of order) song.patterns[p]?.channels.forEach((c, ch) => c.rows.forEach((r) => { if (r.note > 0 && r.note < 97) grid[ch].push(r.note); }));
    const paula = await paulaNotes(mod, bytes, FILE, DIR, 30);
    let matched = 0;
    for (let ch = 0; ch < grid.length; ch++) {
      if (grid[ch].length < 8) continue;
      let best = 0;
      for (let v = 0; v < 4; v++) for (const skip of [0, 1]) {
        const g = grid[ch].slice(skip, skip + 12), p = paula.loose[v].slice(0, 12);
        let k = 0; while (k < Math.min(g.length, p.length) && g[k] === p[k]) k++;
        best = Math.max(best, k);
      }
      if (best >= 6) matched++;
    }
    expect(matched, 'voices whose first notes equal Paula pitch exactly').toBeGreaterThanOrEqual(2);
    expect(periodToNote(428)).toBe(25);
    // byte 36 (period 428 at InsPer 428) is grid C-2 = 25, byte 12 is note 1, byte 107 is note 96
    for (const [byte, note] of [[36, 25], [12, 1], [107, 96]]) {
      const cell = fredLineToCell({ note: byte } as never);
      expect(cell.note).toBe(note);
      expect(cellToFredLine(cell).note, 'encode inverts decode').toBe(byte);
    }
  }, 120_000);
});
