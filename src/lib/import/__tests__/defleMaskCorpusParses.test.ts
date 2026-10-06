/**
 * The DefleMask modules behind the owner's verdicts import through the
 * Furnace file-ops WASM with patterns, instruments and notes.
 *
 * The jukebox marked deflemask (root), 0xfroman, 220hertz and 85NESplayer
 * "Load Failed: DefleMask import requires Furnace WASM engine (WASM error:
 * ...)" or "Silent" on 2026-09-24. The import half is provable headless;
 * this is that proof, file by file, so a WASM regression names the module
 * (2026-10-05 broken-formats sweep, B15). The whole corpus (1810 .dmf) is
 * too slow for test:ci: `DMF_ALL=1` sweeps it and writes the failures to
 * DMF_OUT (a scratch path) for the ledger.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { installFurnaceFileOpsWasm, readSong, repoRoot } from './furnaceFileOpsWasmHarness';

const SONGS = join(repoRoot, 'public/data/songs');
const ROOT = join(SONGS, 'deflemask');
const VERDICT_DIRS = ['', '0xfroman', '220hertz', '85NESplayer', 'CrazySoundEnginer', 'DevEd', 'MegaSphere'];
/** Genuinely broken files: the zlib adler32 is wrong AND the header's custom-Hz
 *  field is short, so the pattern-row count reads 0x08000000 and Furnace
 *  refuses it ("pattern length is too large"). Not a DEViLBOX defect. */
const KNOWN_BROKEN = new Set(['deflemask/CrazySoundEnginer/Sonic The Hedgehog - Bridge Zone.dmf']);
const ALL = process.env.DMF_ALL === '1';

function dmfFiles(dir: string, recurse: boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (recurse) out.push(...dmfFiles(p, true)); }
    else if (/\.dmf$/i.test(name)) out.push(p);
  }
  return out.sort();
}
const files = (ALL ? dmfFiles(ROOT, true) : VERDICT_DIRS.flatMap((d) => dmfFiles(join(ROOT, d), false)))
  .map((p) => relative(SONGS, p))
  .filter((rel) => !KNOWN_BROKEN.has(rel));
const failures: Record<string, string> = {};

beforeAll(() => { installFurnaceFileOpsWasm(); });
afterAll(() => { if (ALL && process.env.DMF_OUT) writeFileSync(process.env.DMF_OUT, JSON.stringify({ total: files.length, failures }, null, 2)); });

describe('DefleMask corpus imports', () => {
  it('every CrazySoundEnginer, DevEd and MegaSphere DefleMask song is in the run', () => {
    for (const d of ['CrazySoundEnginer', 'DevEd', 'MegaSphere']) {
      expect(files.some((f) => f.startsWith(`deflemask/${d}/`)), d).toBe(true);
    }
  });
  it('finds the verdict files', () => { expect(files.length).toBeGreaterThanOrEqual(12); });
  for (const rel of files) {
    it(`${rel} imports with patterns and instruments`, async () => {
      const { parseFurnaceFile } = await import('../parsers/FurnaceToSong');
      try {
        const song = await parseFurnaceFile(readSong(rel), rel.split('/').pop()!);
        expect(song.patterns.length).toBeGreaterThan(0);
        expect(song.instruments.length).toBeGreaterThan(0);
        const notes = song.patterns.reduce((n, p) => n + p.channels.reduce((m, c) => m + c.rows.filter((r) => r.note > 0).length, 0), 0);
        expect(notes, 'has notes').toBeGreaterThan(0);
      } catch (e) {
        failures[rel] = String((e as Error).message).slice(0, 200);
        throw e;
      }
    }, 60_000);
  }
});
