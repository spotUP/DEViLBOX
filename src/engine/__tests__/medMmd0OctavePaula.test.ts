/**
 * OctaMED MMD0/MMD1 octave (MMD2: no song in the repo; MMD3: UADE cannot play it): the grid names a note by the period Paula plays (UADE AUDxPER log, periodToNote 428 = C-2 = 25),
 * absolute pitch, on real songs. Mapping: MEDParser noteBaseTranspose (rawNote + 24 + playTranspose for MMD0).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openUade } from './gridOracle';
import { paulaNotes, type LogModule } from '../../../tools/uade-audit/gridVsPaulaCore';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';
import { parseMEDFile } from '@/lib/import/formats/MEDParser';

const ROOT = join(process.cwd(), 'public/data/songs');
let restore = () => {};
let mod: LogModule;
beforeAll(async () => { restore = installDwNodeFetch(); mod = (await openUade()) as unknown as LogModule; });
afterAll(() => { restore(); try { mod._uade_wasm_cleanup(); } catch { /* ignore */ } });

describe('OctaMED MMD0/MMD1 octave', { timeout: 180_000 }, () => {
  for (const rel of ['octamed-mmd0/universal monsters - title.mmd0', 'formats/universal monsters - dracula.mmd0', 'formats/funky nightmare.mmd1']) {
    it(`${rel}: grid notes equal the pitch Paula plays (absolute)`, async () => {
      const name = rel.split('/').pop() ?? rel;
      const bytes = new Uint8Array(readFileSync(join(ROOT, rel)));
      const song = parseMEDFile(bytes.slice().buffer as ArrayBuffer, name);
      const order = song.songPositions?.length ? song.songPositions : song.patterns.map((_, i) => i);
      const grid: number[][] = song.patterns[0].channels.map(() => []);
      for (const p of order) song.patterns[p]?.channels.forEach((c, ch) => c.rows.forEach((r) => { if (r.note > 0 && r.note < 97) grid[ch][grid[ch].length] = r.note; }));
      const paula = await paulaNotes(mod, bytes, name, join(ROOT, rel, '..'), 30);
      if (process.env.OCT_DBG) {
        grid.forEach((g, ch) => console.log('GRID', ch, g.slice(0, 14).join(',')));
        paula.loose.forEach((p, v) => console.log('PAULA', v, p.slice(0, 14).join(',')));
      }
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
      const octs = grid.flat().map((n) => Math.floor((n - 1) / 12) + 1);
      expect(octs.filter((o) => o >= 2 && o <= 5).length / octs.length).toBeGreaterThan(0.6);
    });
  }
});
