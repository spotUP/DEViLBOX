import { describe, it, expect } from 'vitest';
import { harvestSongWaves, type CorpusWave } from './corpusWaves';

const ramp = (len: number, max: number) => Array.from({ length: len }, (_, i) => Math.round((i / (len - 1)) * max));

describe('harvestSongWaves', () => {
  it('tags waves only with chips of the song whose wave size matches', () => {
    const bank: CorpusWave[] = [];
    // Game Boy (32x16) + PC Engine (32x32) song; one 64x64 wave matches neither.
    harvestSongWaves(bank, new Map(), 'song.fur', [0x04, 0x05], [
      { max: 15, data: ramp(32, 15) },
      { max: 31, data: ramp(32, 31) },
      { max: 63, data: ramp(64, 63) },
    ]);
    expect(bank.map((w) => [w.name, w.chips])).toEqual([
      ['song.fur #0', ['Game Boy']],
      ['song.fur #1', ['PC Engine']],
    ]);
  });

  it('dedupes across songs, keeps the first name and merges chips', () => {
    const bank: CorpusWave[] = [];
    const seen = new Map<string, CorpusWave>();
    harvestSongWaves(bank, seen, 'a.dmf', [0x04], [{ max: 15, data: ramp(32, 15) }]);
    harvestSongWaves(bank, seen, 'b.fur', [0x96], [{ max: 15, data: ramp(32, 15) }]);
    expect(bank).toHaveLength(1);
    expect(bank[0].name).toBe('a.dmf #0');
    expect(bank[0].chips).toEqual(['Game Boy', 'WonderSwan']);
  });

  it('accepts N163 lengths in steps of 4 and drops out-of-range data', () => {
    const bank: CorpusWave[] = [];
    harvestSongWaves(bank, new Map(), 'n.fur', [0x8c], [
      { max: 15, data: ramp(24, 15) },
      { max: 15, data: ramp(30, 15) },
      { max: 15, data: [...ramp(23, 15), 16] },
    ]);
    expect(bank.map((w) => w.len)).toEqual([24]);
  });

  it('keeps an SCC song wave of another depth as the SCC plays it (Furnace scaling)', () => {
    const bank: CorpusWave[] = [];
    harvestSongWaves(bank, new Map(), 'msx.fur', [0xa1], [{ max: 15, data: ramp(32, 15) }]);
    expect(bank.map((w) => [w.chips, w.len, w.max])).toEqual([[['SCC'], 32, 255]]);
    expect(bank[0].data[1]).toBe(Math.trunc((ramp(32, 15)[1] * 255) / 15));
    expect(bank[0].data[31]).toBe(255);
  });
});
