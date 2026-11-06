/**
 * Sound Factory octave: the grid names the AUDIBLE pitch (owner decision 2026-11-04), i.e.
 * periodToPitch(period Paula plays) + the instrument's audible shift (soundFactoryAudibleShift).
 * Measured through the UADE AUDxPER log on real songs, not from the replayer source: every grid
 * channel that lines up with a Paula voice differs from that voice's period pitch by exactly the
 * shift of the instrument on the matched note, on every matched note.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openUade } from './gridOracle';
import { paulaNotes, type LogModule } from '../../../tools/uade-audit/gridVsPaulaCore';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { soundFactoryAudibleShift } from '@/lib/import/formats/soundFactoryPitch';

const ROOT = join(process.cwd(), 'public/data/songs');
let restore = () => {};
let mod: LogModule;
beforeAll(async () => { restore = installDwNodeFetch(); mod = (await openUade()) as unknown as LogModule; });
afterAll(() => { restore(); try { mod._uade_wasm_cleanup(); } catch { /* ignore */ } });

describe('Sound Factory octave', { timeout: 180_000 }, () => {
  for (const rel of ['formats/goldrunner.psf']) {
    it(`${rel}: grid note = Paula period pitch + instrument audible shift`, async () => {
      const name = rel.split('/').pop()!;
      const bytes = new Uint8Array(readFileSync(join(ROOT, rel)));
      const song = await parseModuleToSong(new File([bytes], name));
      const shiftOf = new Map(song.instruments.map((i) => [i.id, soundFactoryAudibleShift(i.metadata!.soundFactoryPitch!)]));
      const order = song.songPositions?.length ? song.songPositions : song.patterns.map((_, i) => i);
      const grid: { note: number; shift: number }[][] = song.patterns[0].channels.map(() => []);
      for (const p of order) song.patterns[p]?.channels.forEach((c, ch) => c.rows.forEach((r) => {
        if (r.note > 0 && r.note < 97) grid[ch].push({ note: r.note, shift: shiftOf.get(r.instrument) ?? 0 });
      }));
      const paula = await paulaNotes(mod, bytes, name, join(ROOT, rel, '..'), 30);
      expect([...shiftOf.values()].some((s) => s >= 12), 'looped short waves sound octaves above their period naming').toBe(true);
      const allNotes = grid.flat().map((c) => Math.floor((c.note - 1) / 12) + 1);
      expect(allNotes.filter((o) => o >= 2 && o <= 6).length / allNotes.length, 'most notes sit in octaves 2..6').toBeGreaterThan(0.6);
      let matched = 0;
      for (let ch = 0; ch < grid.length; ch++) {
        if (grid[ch].length < 8) continue;
        let ok = false;
        for (let v = 0; v < 4 && !ok; v++) for (const skip of [0, 1]) {
          const g = grid[ch].slice(skip, skip + 12), p = paula.loose[v].slice(0, 12);
          const n = Math.min(g.length, p.length);
          if (n >= 6 && g.slice(0, n).every((c, k) => c.note - c.shift === p[k])) ok = true;
        }
        if (ok) matched++;
      }
      expect(matched, 'channels whose first notes equal Paula pitch + audible shift').toBeGreaterThanOrEqual(2);
    });
  }
});
