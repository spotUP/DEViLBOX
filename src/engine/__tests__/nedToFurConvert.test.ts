/**
 * NerdTracker II import: the wasm converter (furnace-fileops-wasm/src/nedToFur.cpp)
 * turns a real .ned song into .fur bytes, and the normal Furnace parser reads
 * it back as a 5-channel NES song. Expected counts come from the .ned header
 * read here, independent of the converter (wrapper at 0x2a/0x2c, temp.dat at
 * 0x34 + n*229 + sample bytes: speed t[3], instruments t[5], song length t[7]).
 *
 * The songs live outside the repo (~/Downloads/NerdTracker 2) and are never
 * committed; the suite skips when the folder is missing.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { installFurnaceFileOpsWasm } from '../../lib/import/__tests__/furnaceFileOpsWasmHarness';

const DIR = path.join(os.homedir(), 'Downloads', 'NerdTracker 2');
const HAVE = fs.existsSync(DIR);

function header(b: Uint8Array): { nDpcm: number; speed: number; nIns: number; songLen: number } {
  const nDpcm = b[0x2a] | (b[0x2b] << 8);
  const smp = (b[0x2c] | (b[0x2d] << 8) | (b[0x2e] << 16) | (b[0x2f] << 24)) >>> 0;
  const t = 0x34 + nDpcm * 229 + smp;
  return { nDpcm, speed: b[t + 3] || 6, nIns: b[t + 5], songLen: b[t + 7] };
}

function listNed(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return listNed(p);
    return /\.ned$/i.test(e.name) ? [p] : [];
  });
}

// dpcmNotes: the reference dump (nt2dump.c) shows notes in the DMC column
type Case = { file: string; dpcmNotes: boolean };
const CASES: Case[] = [
  { file: 'Memblers/kungfu.ned', dpcmNotes: false },
  { file: 'Memblers/gradius.ned', dpcmNotes: true },
  // one 2-byte DPCM instrument, never played
  { file: "Memblers/super fighter (lan's theme).ned", dpcmNotes: false },
];

beforeAll(async () => {
  if (!HAVE) return;
  installFurnaceFileOpsWasm();
  await import('../../lib/import/parsers/FurnaceToSong');
  await import('../../engine/furnace-dispatch/FurnaceDispatchEngine');
}, 300000);

describe.skipIf(!HAVE)('NerdTracker II to editable Furnace song', { timeout: 120000 }, () => {
  for (const c of CASES) {
    it(`${c.file}: orders, speed, instruments and cells`, async () => {
      const { nedToFurWasm } = await import('../../lib/import/wasm/FurnaceFileOps');
      const { parseFurnaceFile } = await import('../../lib/import/parsers/FurnaceToSong');
      const bytes = new Uint8Array(fs.readFileSync(path.join(DIR, c.file)));
      const h = header(bytes);
      const song = await parseFurnaceFile(await nedToFurWasm(bytes), c.file.replace(/\.ned$/, '.fur'));
      const notes = (ch: number): number => song.songPositions.reduce((n, pi) =>
        n + (song.patterns[pi].channels[ch]?.rows.filter((r) => r.note > 0 && r.note < 97).length ?? 0), 0);
      const perChan = [0, 1, 2, 3, 4].map(notes);
      console.log(`${c.file}: speed ${song.initialSpeed}, orders ${song.songPositions.length}, patterns ${song.patterns.length}, instruments ${song.instruments.length}, DPCM ${h.nDpcm}, notes ${perChan.join('/')}`);
      expect(song.patterns[0].channels.length).toBe(5);
      expect(song.songPositions.length).toBe(h.songLen);
      expect(song.initialSpeed).toBe(h.speed);
      expect(song.patterns[0].length).toBe(64);
      // pulse 1, pulse 2 and triangle carry notes in all three songs
      expect(perChan.slice(0, 3).every((n) => n > 0), 'notes on pulse 1/2 and triangle').toBe(true);
      if (c.dpcmNotes) expect(perChan[4], 'DPCM notes').toBeGreaterThan(0);
      else expect(perChan[4], 'DPCM notes').toBe(0);
      // at least one instrument per used NT2 instrument kind, plus one per DPCM instrument
      expect(song.instruments.length).toBeGreaterThanOrEqual(Math.min(1, h.nIns) + h.nDpcm);
      // every note cell names an instrument that exists
      const ids = new Set(song.instruments.map((i) => i.id));
      for (const pi of song.songPositions) for (const ch of song.patterns[pi].channels) for (const r of ch.rows) {
        if (r.note > 0 && r.note < 97 && r.instrument) expect(ids.has(r.instrument), `instrument ${r.instrument}`).toBe(true);
      }
    });
  }

  it('every .ned in the folder converts', async () => {
    const { nedToFurWasm } = await import('../../lib/import/wasm/FurnaceFileOps');
    const { parseFurnaceFile } = await import('../../lib/import/parsers/FurnaceToSong');
    const failed: string[] = [];
    const files = listNed(DIR);
    for (const f of files) {
      const bytes = new Uint8Array(fs.readFileSync(f));
      try {
        const song = await parseFurnaceFile(await nedToFurWasm(bytes), 'x.fur');
        if (song.songPositions.length !== header(bytes).songLen) failed.push(`${f}: order count`);
      } catch (e) { failed.push(`${f}: ${(e as Error).message}`); }
    }
    console.log(`NED sweep: ${files.length - failed.length}/${files.length} converted\n${failed.join('\n')}`);
    expect(failed).toEqual([]);
  }, 600000);
});
