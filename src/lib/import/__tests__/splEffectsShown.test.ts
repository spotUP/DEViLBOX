/**
 * Sound Programming Language: the extra note bytes of a note command show in the grid's effect columns (SPL_FX, glyph N)
 * and edits to them write back to the module bytes. Real song: public/data/songs/formats/boulderdash.spl.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildSplGrid } from '../formats/soundProgrammingLanguageGrid';
import { applySplGridEdits } from '../formats/soundProgrammingLanguageEdits';
import { parseSoundProgrammingLanguageFile } from '../formats/SoundProgrammingLanguageParser';
import { SPL_FX } from '../formats/commandStreamEffectGlyphs';
import { cellEffects } from '../formats/cellEffectSlots';

const file = new Uint8Array(readFileSync('public/data/songs/formats/boulderdash.spl'));

describe('SPL extra note bytes as effects', () => {
  const grid = buildSplGrid(file);
  if (typeof grid === 'string') throw new Error(grid);
  const fxCells: Array<{ p: number; c: number; r: number }> = [];
  grid.patterns.forEach((pat, p) => pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
    if (cellEffects(cell).some(([t]) => t >= SPL_FX.extraNote1 && t <= SPL_FX.extraNote3)) fxCells.push({ p, c, r });
  })));

  it('the parser output has effect cells carrying the stream bytes', () => {
    expect(fxCells.length).toBeGreaterThan(0);
    const { p, c, r } = fxCells[0];
    const cell = grid.patterns[p].channels[c].rows[r];
    const src = grid.effectSources[c][p * 64 + r];
    expect(cellEffects(cell).map(([, v]) => v)).toEqual(src.map((s) => file[s.at]));
    console.log('spl effect cells', fxCells.length);
  });

  it('an unedited song writes back byte-identical and one edited command changes only its argument byte', () => {
    const same = applySplGridEdits(file, grid.patterns);
    expect(same.patched).toBe(0);
    expect(Buffer.from(same.data).equals(Buffer.from(file))).toBe(true);

    const { p, c, r } = fxCells[0];
    const edited = grid.patterns.map((pat) => ({ ...pat, channels: pat.channels.map((ch) => ({ ...ch, rows: ch.rows.map((x) => ({ ...x })) })) }));
    const cell = edited[p].channels[c].rows[r];
    const at = grid.effectSources[c][p * 64 + r][0].at;
    cell.eff = (cell.eff + 1) & 0xff;
    const out = applySplGridEdits(file, edited);
    const diff = [...out.data].map((v, i) => (v !== file[i] ? i : -1)).filter((i) => i >= 0);
    expect(diff).toEqual([at]);
    expect(out.data[at]).toBe((file[at] + 1) & 0xff);
  });

  it('the song parser (top-level entry) carries the effect cells', async () => {
    const song = await parseSoundProgrammingLanguageFile(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer, 'boulderdash.spl');
    let n = 0;
    for (const pat of song.patterns) for (const ch of pat.channels) for (const cell of ch.rows) if (cell.effTyp >= SPL_FX.extraNote1 && cell.effTyp <= SPL_FX.extraNote3) n++;
    expect(n).toBeGreaterThan(0);
  });
});
