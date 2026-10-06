/**
 * Fred Editor: the module decodes to its own structures and encodes back byte
 * for byte, and every grid cell is the line it shows.
 *
 * Regression for the grid built one pattern per track-list position with all
 * four voices in step and each pattern cut at 64 rows (holds counted as rows,
 * not lines): voices are not in step (rebels.fred voice 1 plays 16-line
 * patterns where voice 0 plays 128-line ones), so notes were dropped and
 * shifted - gridVsPaula 0.89/0.44/0.71/0.88 on fireworks ii.fred. The bytes
 * were carried as per-byte carrier cells; the module had no decoder.
 * Research: thoughts/shared/research/2026-10-06_fred-editor-format.md
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  decodeFredModule, encodeFredModule, encodeFredPattern, fredSections, FRED_END, type FredLine,
} from '../FredEditorModule';
import {
  FRED_ROWS_PER_PATTERN, applyFredGridEdits, cellToFredLine, fredLineToCell, fredLinesEqual, walkFredSong,
} from '../fredEditorGrid';
import { parseFredEditorFile } from '../FredEditorParser';
import { exportFredEditor } from '@/lib/export/FredEditorExporter';

const CORPUS = [
  'public/data/songs/formats/bomb jack.fred',
  'public/data/songs/formats/fuzzball-title.fred',
  'public/data/songs/formats/rebels.fred',
  'public/data/songs/fredmon/fireworks ii.fred',
];
const load = (p: string) => new Uint8Array(readFileSync(join(process.cwd(), p)));
const ab = (b: Uint8Array) => b.slice().buffer as ArrayBuffer;

describe('Fred Editor module codec', () => {
  for (const path of CORPUS) {
    const name = path.split('/').pop()!;
    it(`${name}: decode -> encode is byte-exact, and every pattern is its own canonical encoding`, () => {
      const bytes = load(path);
      const m = decodeFredModule(bytes);
      expect(m.patterns.length).toBe(128); // FrEd's 128 pattern slots
      expect([...encodeFredModule(m)]).toEqual([...bytes]);
      const { patStart } = fredSections(bytes);
      for (const p of m.patterns) {
        const enc = encodeFredPattern(p.lines);
        expect([...enc]).toEqual([...bytes.subarray(patStart + p.offset, patStart + p.offset + enc.length)]);
        expect(enc[enc.length - 1]).toBe(FRED_END);
      }
    });

    it(`${name}: every grid cell is the line it shows, and the cell codec inverts it`, async () => {
      const bytes = load(path);
      const m = decodeFredModule(bytes);
      const song = await parseFredEditorFile(ab(bytes), name);
      const walk = walkFredSong(m);
      expect(song.patterns.reduce((n, p) => n + p.length, 0)).toBe(walk.lines);
      song.patterns.forEach((pat, p) => pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
        const ref = walk.voices[c][p * FRED_ROWS_PER_PATTERN + r];
        const line: FredLine = ref ? m.patterns[ref.pattern].lines[ref.line] : {};
        expect(fredLinesEqual(cellToFredLine(cell), line)).toBe(true);
      })));
      for (const p of m.patterns) for (const l of p.lines) expect(fredLinesEqual(cellToFredLine(fredLineToCell(l)), l)).toBe(true);
    });

    it(`${name}: export of the unedited song is the file`, async () => {
      const bytes = load(path);
      const song = await parseFredEditorFile(ab(bytes), name);
      expect([...(await exportFredEditor(song)).data]).toEqual([...bytes]);
    });
  }

  it('the song length is the longest voice pass; voices are not in step at pattern boundaries', () => {
    const rebels = decodeFredModule(load(CORPUS[2]));
    const walk = walkFredSong(rebels);
    expect(walk.lines).toBe(3040); // voices 1/3 (voices 0/2 jump back at 2912 and go on)
    // Row 128: voice 0 starts its second 128-line entry, voice 1 its third 64-line one.
    expect(walk.voices[0][128]).toEqual({ pattern: walk.voices[0][0]!.pattern, line: 0 });
    expect(walk.voices[1][128]!.line).toBe(0);
    expect(walk.voices[0][2912]).toEqual(walk.voices[0][0]);
  });

  it('a grid edit lands in the line it shows, every other byte stays, and the records move with the patterns', () => {
    const bytes = load(CORPUS[3]);
    const m = decodeFredModule(bytes);
    const walk = walkFredSong(m);
    // A held line of voice 1: a new note splits the hold.
    const r = walk.voices[1].findIndex((ref, i) => i > 0 && !!ref && Object.keys(m.patterns[ref.pattern].lines[ref.line]).length === 0);
    const ref = walk.voices[1][r]!;
    const cell = { note: 25, instrument: 3, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
    const out = applyFredGridEdits(bytes, [{ pattern: Math.floor(r / 64), row: r % 64, channel: 1, cell }]);
    const m2 = decodeFredModule(out);
    expect(m2.patterns[ref.pattern].lines[ref.line]).toEqual({ note: 36, instrument: 2 });
    m2.patterns.forEach((p, i) => { if (i !== ref.pattern) expect(p.lines).toEqual(m.patterns[i].lines); });
    expect(m2.instruments.length).toBe(m.instruments.length);
    expect([...m2.pcm]).toEqual([...m.pcm]);
    // Records keep pointing at their samples.
    const { structStart: s1 } = fredSections(bytes), { structStart: s2 } = fredSections(out);
    const ptr = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset).getUint32(o);
    m.instruments.forEach((_, i) => {
      const a = ptr(bytes, s1 + i * 64), b = ptr(out, s2 + i * 64);
      expect(b ? b - (s2 - s1) : 0).toBe(a);
    });
    expect((s2 & 1)).toBe(0);
  });
});
