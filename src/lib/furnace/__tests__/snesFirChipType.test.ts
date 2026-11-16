import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseFurnaceSong, convertFurnaceToDevilbox } from '@/lib/import/formats/FurnaceSongParser';
import { isSnesInstrument } from '../snesFirBlend';

const SNES_FILE = resolve(__dirname, '../../../../public/data/songs/furnace/snes/tetristheme.fur');

describe('isSnesInstrument (38xx gate)', () => {
  it('accepts every imported SNES instrument, whose chipType is the engine enum 24, not dispatch platform 26', async () => {
    const buf = readFileSync(SNES_FILE);
    const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const { instruments } = convertFurnaceToDevilbox(module, 0);
    expect(instruments.length).toBeGreaterThan(0);
    for (const i of instruments) {
      expect(i.furnace?.chipType).toBe(24);
      expect(isSnesInstrument({ furnace: i.furnace })).toBe(true);
    }
  }, 60000);

  it('rejects other chips, including one whose chipType is the SNES dispatch id', () => {
    expect(isSnesInstrument({ synthType: 'FurnaceOPN', furnace: { synthType: 'FurnaceOPN' } })).toBe(false);
    expect(isSnesInstrument({ synthType: 'FurnaceVERA', furnace: { chipType: 26 } as never })).toBe(false);
  });

  it('accepts a new SNES instrument by synthType or snes config', () => {
    expect(isSnesInstrument({ synthType: 'FurnaceSNES' })).toBe(true);
    expect(isSnesInstrument({ synthType: 'Furnace', furnace: { snes: {} } })).toBe(true);
  });
});
