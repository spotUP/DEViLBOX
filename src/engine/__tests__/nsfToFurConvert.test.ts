/**
 * NSF import Phase 2: the wasm converter (furnace-fileops-wasm/src/nsfToFur.cpp)
 * turns one real NSF per sound chip into .fur bytes, and the normal Furnace
 * parser reads notes back on that chip's channels. Channel order is 2A03 (5),
 * then the expansion named in the NSF header, so the expansion starts at 5.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installFurnaceFileOpsWasm, readSong } from '../../lib/import/__tests__/furnaceFileOpsWasmHarness';

const FRAMES = 1200; // 20 s at 60 Hz

const CASES: { file: string; track: number; chip: string; chans: number[] }[] = [
  { file: 'dr mario.nsf', track: 0, chip: '2A03', chans: [0, 1, 2] },
  { file: 'akumajou densetsu.nsf', track: 0, chip: 'VRC6', chans: [5, 6, 7] },
  { file: 'lagrange point.nsf', track: 2, chip: 'VRC7', chans: [5, 6, 7, 8, 9, 10] },
  { file: 'metroid (famicom disk system).nsf', track: 3, chip: 'FDS', chans: [5] },
  { file: 'just breed.nsf', track: 0, chip: 'MMC5', chans: [5, 6] },
  { file: 'king of kings (n106).nsf', track: 0, chip: 'N163', chans: [5, 6, 7, 8, 9, 10, 11, 12] },
  { file: 'gimmick!.nsf', track: 0, chip: 'S5B', chans: [5, 6, 7] },
];

beforeAll(async () => {
  installFurnaceFileOpsWasm();
  // first import of the parser and dispatch engine is slow; keep it out of the per-song timeout
  await import('../../lib/import/parsers/FurnaceToSong');
  await import('../../engine/furnace-dispatch/FurnaceDispatchEngine');
}, 300000);

describe('NSF to editable Furnace song', { timeout: 120000 }, () => {
  for (const c of CASES) {
    it(`${c.file} track ${c.track}: notes on the ${c.chip} channels`, async () => {
      const { nsfToFurWasm } = await import('../../lib/import/wasm/FurnaceFileOps');
      const { parseFurnaceFile } = await import('../../lib/import/parsers/FurnaceToSong');
      const fur = await nsfToFurWasm(new Uint8Array(readSong(`nsf/${c.file}`)), c.track, FRAMES);
      const song = await parseFurnaceFile(fur, c.file.replace(/\.nsf$/, '.fur'));
      const notesOn = (ch: number): number => song.patterns.reduce((n, p) =>
        n + (p.channels[ch]?.rows.filter((r) => r.note > 0 && r.note < 97).length ?? 0), 0);
      const perChan = c.chans.map(notesOn);
      console.log(`${c.chip} ${c.file}: channels ${song.patterns[0].channels.length}, patterns ${song.patterns.length}, instruments ${song.instruments.length}, notes ${perChan.join('/')}`);
      expect(song.patterns.length).toBe(Math.ceil(FRAMES / 64));
      expect(perChan.filter((n) => n > 0).length, `${c.chip} channels with notes`).toBeGreaterThanOrEqual(c.chip === 'N163' ? 2 : Math.min(2, c.chans.length));
    });
  }
});
