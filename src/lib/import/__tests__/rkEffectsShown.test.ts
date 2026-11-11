/**
 * Ron Klaren: the arguments of SetArpeggio (0x80), SetPortamento (0x81) and ChangeAdsrSpeed (0x84) show in the grid's effect
 * columns (RK_FX, 0x550..0x554) and an edited effect writes back to the module bytes through the layout's effectPatches hook.
 * Real song: public/data/songs/ron-klaren/astra 2.rk.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseRonKlarenFile } from '../formats/RonKlarenParser';
import { RK_FX } from '../formats/commandStreamEffectGlyphs';
import { cellEffects } from '../formats/cellEffectSlots';
import { patchModuleByLayout } from '@/lib/export/layoutPatch';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';

const file = new Uint8Array(readFileSync('public/data/songs/ron-klaren/astra 2.rk'));
const isRk = (t: number): boolean => t >= RK_FX.arpeggio && t <= RK_FX.adsrSpeed;

describe('Ron Klaren command arguments as effects', () => {
  const song = parseRonKlarenFile(file, 'astra 2.rk');
  if (!song || !song.uadePatternLayout) throw new Error('parse failed');
  const layout = song.uadePatternLayout;
  const fxCells: Array<{ p: number; c: number; r: number }> = [];
  song.patterns.forEach((pat, p) => pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
    if (cellEffects(cell).some(([t]) => isRk(t))) fxCells.push({ p, c, r });
  })));

  it('the parser output has effect cells carrying the stream argument bytes', () => {
    expect(fxCells.length).toBeGreaterThan(0);
    console.log('rk effect cells', fxCells.length);
    const { p, c, r } = fxCells[0];
    expect(cellEffects(song.patterns[p].channels[c].rows[r]).length).toBeGreaterThan(0);
  });

  it('an unedited song patches to the same bytes; one edited effect changes only its argument byte', () => {
    setGridBaseline(baselineOf(song.patterns));
    expect(patchModuleByLayout(file, layout, song.patterns).patched).toBe(0);

    const { p, c, r } = fxCells[0];
    const edited = song.patterns.map((pat) => ({ ...pat, channels: pat.channels.map((ch) => ({ ...ch, rows: ch.rows.map((x) => ({ ...x })) })) }));
    const cell = edited[p].channels[c].rows[r];
    const slot = cellEffects(cell).findIndex(([t]) => isRk(t));
    const key = (['eff', 'eff2', 'eff3', 'eff4'] as const)[slot];
    const before = cell[key] ?? 0;
    cell[key] = (before + 1) & 0xff;
    const out = patchModuleByLayout(file, layout, edited);
    const diff = [...out.bytes].map((v, i) => (v !== file[i] ? i : -1)).filter((i) => i >= 0);
    expect(diff.length).toBe(1);
    expect(out.bytes[diff[0]]).toBe((file[diff[0]] + 1) & 0xff);
    expect(file[diff[0]]).toBe(before);
    setGridBaseline(null);
  });
});
