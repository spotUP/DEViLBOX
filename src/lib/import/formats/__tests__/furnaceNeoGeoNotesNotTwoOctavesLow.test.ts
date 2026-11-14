import { describe, it, expect } from 'vitest';
import { CHIP_SYNTH_IDS } from '../FurnaceSongParser';
import { convertFurnaceCell } from '../furnace/FurnacePatternParser';

// Gumbirds arena.fur (YM2610 ext, 0xa6): SSG arps on F-4 played two octaves low because
// the platform was not a chip synth, so convertFurnaceCell applied the Amiga -24 offset.
describe('Neo Geo .fur notes keep their Furnace octave', () => {
  it('treats every YM2610 platform as a chip synth', () => {
    for (const id of [0x9e, 0xa5, 0xa6]) expect(CHIP_SYNTH_IDS.has(id)).toBe(true);
  });
  it('F-4 on a Neo Geo song converts like F-4 on an AY song', () => {
    const cell = { note: 5, octave: 4, instrument: 7, volume: -1, effects: [] } as unknown as Parameters<typeof convertFurnaceCell>[0];
    const neo = convertFurnaceCell(cell, CHIP_SYNTH_IDS.has(0xa6));
    const ay = convertFurnaceCell(cell, CHIP_SYNTH_IDS.has(0x80));
    expect(neo.note).toBe(ay.note);
    expect(neo.note).toBe(4 * 12 + 5 + 1);
  });
});
