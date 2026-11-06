/**
 * David Whittaker octave: the grid names a note by the period Paula plays, not by a fixed byte offset.
 * Measured through UADE (AUDxPER log, periodToNote) against the parsed grid, absolute pitch. dwByteToNote
 * (davidWhittakerPitch.ts) is the single mapping: byte through the variant's period table, scaled by the sample's
 * fine_tune_period, named by periodToNote (period 428 = C-2 = 25).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openUade } from './gridOracle';
import { paulaNotes, type LogModule } from '../../../tools/uade-audit/gridVsPaulaCore';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';
import { parseDavidWhittakerFile } from '@/lib/import/formats/DavidWhittakerParser';

const ROOT = join(process.cwd(), 'public/data/songs');
let restore = () => {};
let mod: LogModule;
beforeAll(async () => { restore = installDwNodeFetch(); mod = (await openUade()) as unknown as LogModule; });
afterAll(() => { restore(); try { mod._uade_wasm_cleanup(); } catch { /* ignore */ } });

async function voicesMatching(rel: string): Promise<{ matched: number; octaves: number[] }> {
  const name = rel.split('/').pop() ?? rel;
  const bytes = new Uint8Array(readFileSync(join(ROOT, rel)));
  const song = (await parseDavidWhittakerFile(bytes.slice().buffer as ArrayBuffer, name))!;
  expect(song).toBeTruthy();
  const order = song.songPositions?.length ? song.songPositions : song.patterns.map((_, i) => i);
  const grid: number[][] = song.patterns[0].channels.map(() => []);
  for (const p of order) song.patterns[p]?.channels.forEach((c, ch) => c.rows.forEach((r) => { if (r.note > 0 && r.note < 97) grid[ch].push(r.note); }));
  const paula = await paulaNotes(mod, bytes, name, join(ROOT, rel, '..'), 30);
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
  return { matched, octaves: grid.flat().map((n) => Math.floor((n - 1) / 12) + 1) };
}

describe('David Whittaker octave', { timeout: 180_000 }, () => {
  for (const rel of ['formats/apb.dw', 'david-whittaker/garfield2+.dw']) {
    it(`${rel}: grid notes equal the pitch Paula plays (absolute)`, async () => {
      const { matched, octaves } = await voicesMatching(rel);
      expect(matched, 'voices whose first notes equal Paula pitch exactly').toBeGreaterThanOrEqual(2);
      const mid = octaves.filter((o) => o >= 2 && o <= 5).length / octaves.length;
      expect(mid, 'most notes sit in octaves 2..5').toBeGreaterThan(0.6);
    });
  }
});
