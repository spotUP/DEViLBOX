/**
 * Meaningful Connection (ES5506, Furnace) showed '?XX' in the pattern grid:
 * its panning (80xx) and sample-offset (90xx) commands are Furnace codes above
 * the shared glyph row, which ended at 'Z' and fell through to '?'.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installFurnaceFileOpsWasm, readSong } from './furnaceFileOpsWasmHarness';
import { xmEffectToString } from '@/lib/xmConversions';
import { FURNACE_EFFECT_GLYPH } from '../formats/furnaceEffectGlyphs';

describe('Meaningful Connection (ES5506)', { timeout: 120000 }, () => {
  beforeAll(installFurnaceFileOpsWasm);

  it('shows no unknown ?XX effect commands', async () => {
    const { parseFurnaceFile } = await import('../parsers/FurnaceToSong');
    const song = await parseFurnaceFile(readSong('furnace/misc/meaningful_connection_es5506.fur'), 'm.fur');
    const codes = new Set<number>();
    for (const p of song.patterns) for (const ch of p.channels) for (const r of ch.rows) {
      const cell = r as unknown as Record<string, number | undefined>;
      for (const k of ['', '2', '3', '4', '5', '6', '7', '8']) {
        const t = cell[`effTyp${k}`] ?? 0; const e = cell[`eff${k}`] ?? 0;
        if (t === 0 && e === 0) continue;
        codes.add(t);
        const token = xmEffectToString(t, e);
        expect(token, `effTyp 0x${t.toString(16)}`).toMatch(/^[1-9A-Z][0-9A-F]{2}$|^0[0-9A-F]{2}$/);
        if (t !== 0) expect(token[0], `effTyp 0x${t.toString(16)} fell to the zero fallback`).not.toBe('0');
        // The GL and 2D renderers read this table before their '?' fallback.
        if (t >= 0x80 && t <= 0x9f) expect(FURNACE_EFFECT_GLYPH[t]).toBeDefined();
      }
    }
    expect([...codes].sort((a, b) => a - b)).toEqual([0x4, 0xa, 0xe, 0x80, 0x90]);
  });

  it('still leaves codes outside the Furnace blocks to the shared row', () => {
    expect(FURNACE_EFFECT_GLYPH[0x7f]).toBeUndefined();
    expect(FURNACE_EFFECT_GLYPH[0xa0]).toBeUndefined();
  });
});
