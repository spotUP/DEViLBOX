/**
 * MONOTONE parser + grid carrier on the three real .MON files
 * (fixtures/monotone: PRELUDE, NO_ROADS, SWINGIN1 from the MobyGamer/MONOTONE repo).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isMonotoneFormat, parseMonotoneFile } from '../formats/MonotoneParser';
import {
  applyMonotoneGridEdits, decodeMonotoneModule, encodeMonotoneModule, monCellToWord, monWordToCell,
} from '../formats/monotoneGrid';

const load = (name: string): Uint8Array => new Uint8Array(readFileSync(resolve(__dirname, 'fixtures/monotone', name)));

const FIXTURES = [
  { name: 'PRELUDE.MON', patterns: 23, tracks: 4 },
  { name: 'NO_ROADS.MON', patterns: 34, tracks: 4 },
  { name: 'SWINGIN1.MON', patterns: 31, tracks: 3 },
];

describe.each(FIXTURES)('$name', ({ name, patterns, tracks }) => {
  const bytes = load(name);

  it('header numbers match the file size', () => {
    const m = decodeMonotoneModule(bytes)!;
    expect(m.version).toBe(1);
    expect(m.patterns).toBe(patterns);
    expect(m.tracks).toBe(tracks);
    expect(m.cellSize).toBe(2);
    expect(bytes.length).toBe(351 + patterns * 64 * tracks * 2);
  });

  it('parses to a song with one grid pattern per stored pattern and the filename as title', () => {
    const song = parseMonotoneFile(bytes, name)!;
    expect(song.patterns).toHaveLength(patterns);
    expect(song.numChannels).toBe(tracks);
    expect(song.patterns[0].channels).toHaveLength(tracks);
    expect(song.patterns[0].length).toBe(64);
    expect(song.name).toBe(name.replace('.MON', ''));
  });

  it('grid cells back to words and bytes are byte-identical', () => {
    const m = decodeMonotoneModule(bytes)!;
    expect(Array.from(encodeMonotoneModule(m))).toEqual(Array.from(bytes));
    // every word through the grid cell and back (the one note the grid shows as note off aside)
    for (const w of m.words) {
      if (w >> 9 === 88) continue;
      expect(monCellToWord(monWordToCell(w))).toBe(w);
    }
    // an unchanged grid applied as edits changes nothing
    const song = parseMonotoneFile(bytes, name)!;
    const edits = song.patterns.flatMap((p, pattern) => p.channels.flatMap((c, channel) =>
      c.rows.map((cell, row) => ({ pattern, row, channel, cell }))));
    expect(Array.from(applyMonotoneGridEdits(bytes, edits))).toEqual(Array.from(bytes));
  });
});

describe('PRELUDE.MON content', () => {
  const bytes = load('PRELUDE.MON');

  it('pattern 0 row 0 track 0 is word 0x51C8: note 40, effect F, data 08', () => {
    const m = decodeMonotoneModule(bytes)!;
    expect(m.words[0]).toBe(0x51c8);
    const cell = parseMonotoneFile(bytes, 'PRELUDE.MON')!.patterns[0].channels[0].rows[0];
    expect(cell.note).toBe(40 + 9);
    expect(cell.effTyp).toBe(0xf);
    expect(cell.eff).toBe(8);
  });

  it('an edited cell changes exactly its own word', () => {
    const cell = { ...parseMonotoneFile(bytes, 'PRELUDE.MON')!.patterns[0].channels[0].rows[0], note: 50 };
    const out = applyMonotoneGridEdits(bytes, [{ pattern: 0, row: 0, channel: 0, cell }]);
    const diff = Array.from(out, (b, i) => (b !== bytes[i] ? i : -1)).filter((i) => i >= 0);
    expect(diff).toEqual([352]);
    expect(decodeMonotoneModule(out)!.words[0]).toBe((41 << 9) | 0x1c8);
  });
});

describe('MONOTONE detection', () => {
  it('rejects a wrong size, a wrong version and a foreign file', () => {
    const good = load('SWINGIN1.MON');
    expect(isMonotoneFormat(good)).toBe(true);
    expect(isMonotoneFormat(good.slice(0, good.length - 2))).toBe(false);
    const v2 = good.slice(); v2[91] = 2;
    expect(isMonotoneFormat(v2)).toBe(false);
    expect(isMonotoneFormat(new Uint8Array(1000))).toBe(false);
  });

  it('maps the effect nibbles of 0xy and 4xy to x<<4|y and back', () => {
    const word = (30 << 9) | (4 << 6) | (3 << 3) | 5;
    const cell = monWordToCell(word);
    expect([cell.effTyp, cell.eff]).toEqual([4, 0x35]);
    expect(monCellToWord(cell)).toBe(word);
  });
});
