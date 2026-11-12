/**
 * Sawteeth: the part-step effect byte (high nibble effect, low nibble value) shows in the grid effect column as a
 * format-private effect (ST_FX, 0x560..0x56F). Display only: Sawteeth has no pattern layout or exporter, so there is no write-back.
 * Real song: public/data/songs/sawteeth/okolaNUKE.st (62 part steps with a non-zero effect byte, counted from the file).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSawteethFile } from '../formats/SawteethParser';
import { ST_FX_BASE, commandStreamEffectToString } from '../formats/commandStreamEffectGlyphs';

const file = new Uint8Array(readFileSync('public/data/songs/sawteeth/okolaNUKE.st'));

describe('Sawteeth effect bytes as effects', () => {
  const song = parseSawteethFile(file, 'okolaNUKE.st');
  if (!song) throw new Error('parse failed');
  const cells = song.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows)).filter((c) => c.effTyp >= ST_FX_BASE && c.effTyp <= ST_FX_BASE + 15);

  it('shows the effect cells and a known cell keeps its nibbles', () => {
    console.log('sawteeth effect cells', cells.length);
    expect(cells.length).toBeGreaterThan(0);
    // part byte 0xC8 (15 uses in the file) -> effTyp base+0xC, parameter 8
    const c8 = cells.find((c) => c.effTyp === ST_FX_BASE + 0xc && c.eff === 8);
    expect(c8).toBeDefined();
    expect(commandStreamEffectToString(c8!.effTyp, c8!.eff)).toBe('C08');
  });

  it('no export path: the parser exposes no pattern layout, so nothing is rewritten', () => {
    expect(song.uadePatternLayout).toBeUndefined();
  });
});
