/**
 * NSF import: the wasm converter (furnace-fileops-wasm/src/nsfToFur.cpp)
 * turns one real NSF per sound chip into .fur bytes, and the normal Furnace
 * parser reads notes back on that chip's channels. Channel order is 2A03 (5),
 * then the expansion named in the NSF header, so the expansion starts at 5.
 *
 * Phase 3 (compaction): the converter picks a row length (song speed) from the
 * note onsets, folds per-frame volume/duty/arpeggio/fine pitch into instrument
 * macros and shares identical patterns per channel. Parity is the converter's
 * own replay of the written rows and macros against the GME trace, per frame
 * (nsfLastStatsWasm); it is a model of Furnace's macro and row timing, not a
 * Furnace render.
 */
import fs from 'node:fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { installFurnaceFileOpsWasm, readSong } from '../../lib/import/__tests__/furnaceFileOpsWasmHarness';

const FRAMES = 1200; // 20 s at 60 Hz

// Owner report 2026-11-19 (Metroid Brinstar: "patterns roll very fast and notes are spread out"); outside the repo, run only when present
const METROID = '/Users/spot/Downloads/Metroid (EMU).zophar/Metroid (1986-08)(Nintendo R&D1)(Nintendo).nsf';

type Case = { file: string; track: number; chip: string; chans: number[]; frames?: number; path?: string };

const CASES: Case[] = [
  { file: 'dr mario.nsf', track: 0, chip: '2A03', chans: [0, 1, 2] },
  { file: 'akumajou densetsu.nsf', track: 0, chip: 'VRC6', chans: [5, 6, 7] },
  { file: 'lagrange point.nsf', track: 2, chip: 'VRC7', chans: [5, 6, 7, 8, 9, 10] },
  { file: 'metroid (famicom disk system).nsf', track: 3, chip: 'FDS', chans: [5] },
  { file: 'just breed.nsf', track: 0, chip: 'MMC5', chans: [5, 6] },
  { file: 'king of kings (n106).nsf', track: 0, chip: 'N163', chans: [5, 6, 7, 8, 9, 10, 11, 12] },
  { file: 'gimmick!.nsf', track: 0, chip: 'S5B', chans: [5, 6, 7] },
];
if (fs.existsSync(METROID)) CASES.push({ file: 'metroid.nsf', path: METROID, track: 2, chip: '2A03 Brinstar', chans: [0, 1, 2], frames: 5760 });

beforeAll(async () => {
  installFurnaceFileOpsWasm();
  // first import of the parser and dispatch engine is slow; keep it out of the per-song timeout
  await import('../../lib/import/parsers/FurnaceToSong');
  await import('../../engine/furnace-dispatch/FurnaceDispatchEngine');
}, 300000);

describe('NSF to editable Furnace song', { timeout: 120000 }, () => {
  for (const c of CASES) {
    it(`${c.file} track ${c.track}: ${c.chip} compacts and follows the trace`, async () => {
      const { nsfToFurWasm, nsfLastStatsWasm } = await import('../../lib/import/wasm/FurnaceFileOps');
      const { parseFurnaceFile } = await import('../../lib/import/parsers/FurnaceToSong');
      const bytes = c.path ? fs.readFileSync(c.path) : new Uint8Array(readSong(`nsf/${c.file}`));
      const fur = await nsfToFurWasm(new Uint8Array(bytes), c.track, c.frames ?? FRAMES);
      const st = await nsfLastStatsWasm();
      const song = await parseFurnaceFile(fur, c.file.replace(/\.nsf$/, '.fur'));
      const notesOn = (ch: number): number => song.patterns.reduce((n, p) =>
        n + (p.channels[ch]?.rows.filter((r) => r.note > 0 && r.note < 97).length ?? 0), 0);
      const perChan = c.chans.map(notesOn);
      // non-empty cells (all channels) per 64 rows, over the played order
      let cells = 0, rows = 0;
      for (const pi of song.songPositions) {
        const p = song.patterns[pi];
        rows += p.length;
        for (const ch of p.channels) cells += ch.rows.filter((r) => r.note || r.instrument || r.volume || r.effTyp || r.eff).length;
      }
      const per64 = (cells * 64) / rows;
      console.log(`${c.chip} ${c.file}: speed ${song.initialSpeed}, orders ${song.songPositions.length}, patterns ${song.patterns.length}, channel patterns ${st.channelPatterns}, instruments ${song.instruments.length}, cells/64 rows ${per64.toFixed(1)}, grid fit ${(st.gridFit / 10).toFixed(1)}%, parity ${(st.parity / 10).toFixed(1)}% (${st.matchFrames}/${st.activeFrames}), DPCM ${st.dpcmHits}/${st.dpcmTrigs}, notes ${perChan.join('/')}`);
      expect(perChan.filter((n) => n > 0).length, `${c.chip} channels with notes`).toBeGreaterThanOrEqual(c.chip === 'N163' ? 2 : Math.min(2, c.chans.length));
      expect(song.initialSpeed).toBe(st.speed);
      expect(st.parity, `${c.chip} per-frame parity (permille)`).toBeGreaterThanOrEqual(950);
      // shortcut: a second DPCM trigger inside one row is dropped (one note per row); measured, 2 of 123 on VRC6
      expect(st.dpcmHits * 100, 'DPCM triggers kept').toBeGreaterThanOrEqual(st.dpcmTrigs * 98);
      // compacted rows are sparse: at most one non-empty cell per two rows per channel
      if (st.speed > 1) expect(per64, `${c.chip} cells per 64 rows`).toBeLessThan(32 * song.patterns[0].channels.length);
    });
  }
});
