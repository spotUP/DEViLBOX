/**
 * MONOTONE defects found in review: note 88 vs note off, Fxx with data 0,
 * a note off surviving export, and the note-to-divisor table.
 * Fixture: PRELUDE.MON with every cell cleared, then hand-built cells.
 * Reference: monotone-wasm/reference/MT_GLOB.PAS, MT_PLAY.PAS.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { loadWebBundle } from '@/test/wasm/webBundle';
import { parseMonotoneFile } from '../formats/MonotoneParser';
import { decodeMonotoneModule, encodeMonotoneModule, monCellToWord, monWordToCell, monWordIndex } from '../formats/monotoneGrid';
import { exportMonotone } from '@lib/export/MonotoneExporter';

const ROOT = resolve(dirname(__filename), '../../../..');
const prelude = (): Uint8Array =>
  new Uint8Array(readFileSync(resolve(__dirname, 'fixtures/monotone/PRELUDE.MON')));

/** PRELUDE with all cells cleared and `cells` ([pattern,row,track] -> word) written. */
function build(cells: Array<[number, number, number, number]>): Uint8Array {
  const m = decodeMonotoneModule(prelude())!;
  m.words.fill(0);
  for (const [p, r, t, w] of cells) m.words[monWordIndex(m, p, r, t)] = w;
  return encodeMonotoneModule(m);
}

const exported = async (bytes: Uint8Array, edit?: (song: NonNullable<ReturnType<typeof parseMonotoneFile>>) => void) => {
  const song = parseMonotoneFile(bytes, 'T.MON')!;
  edit?.(song);
  return new Uint8Array(await (await exportMonotone(song)).data.arrayBuffer());
};

describe('MONOTONE note 88 is a note, not a note off', () => {
  it('note 88 (word 88<<9) shows as a note other than note off and exports back unchanged', async () => {
    const bytes = build([[0, 0, 0, 88 << 9]]);
    const song = parseMonotoneFile(bytes, 'T.MON')!;
    const cell = song.patterns[0].channels[0].rows[0];
    expect(cell.note).not.toBe(97);
    expect(cell.note).toBeGreaterThan(0);
    // Editing a different cell must keep this one as it is.
    const out = await exported(bytes, (s) => { s.patterns[0].channels[0].rows[1] = { ...s.patterns[0].channels[0].rows[1], note: 50 }; });
    const m = decodeMonotoneModule(out)!;
    expect(m.words[monWordIndex(m, 0, 0, 0)]).toBe(88 << 9);
    expect(m.words[monWordIndex(m, 0, 1, 0)]).toBe(41 << 9);
  });

  it('every MONOTONE note 1..100 and note off 127 round-trips word -> cell -> word, and only 127 is grid 97', () => {
    for (const n of [...Array.from({ length: 100 }, (_, i) => i + 1), 127]) {
      const cell = monWordToCell(n << 9);
      expect(monCellToWord(cell)).toBe(n << 9);
      expect(cell.note === 97).toBe(n === 127);
    }
  });

  it('a note typed on the grid at the note-88 position is written as note 88, and note off stays 127', async () => {
    const bytes = build([[0, 0, 0, 88 << 9]]);
    const g = parseMonotoneFile(bytes, 'T.MON')!.patterns[0].channels[0].rows[0].note;
    const out = await exported(bytes, (s) => {
      s.patterns[0].channels[0].rows[2] = { ...s.patterns[0].channels[0].rows[2], note: g };
      s.patterns[0].channels[0].rows[3] = { ...s.patterns[0].channels[0].rows[3], note: 97 };
    });
    const m = decodeMonotoneModule(out)!;
    expect(m.words[monWordIndex(m, 0, 2, 0)]).toBe(88 << 9);
    expect(m.words[monWordIndex(m, 0, 3, 0)]).toBe(127 << 9);
  });
});

describe('MONOTONE Fxx with data 0 (MT_PLAY.PAS:556: Tempo:=parm1, so F00 is speed 0, a real command)', () => {
  it('F00 imports as effect F with data 0 and exports back to the same word', async () => {
    const F00 = (7 << 6) | 0;
    const bytes = build([[0, 4, 1, F00]]);
    const cell = parseMonotoneFile(bytes, 'T.MON')!.patterns[0].channels[1].rows[4];
    expect([cell.effTyp, cell.eff]).toEqual([0xf, 0]);
    expect(monCellToWord(cell)).toBe(F00);
    // Edit the note beside it: the F00 must not be dropped.
    const out = await exported(bytes, (s) => { s.patterns[0].channels[1].rows[4] = { ...s.patterns[0].channels[1].rows[4], note: 50 }; });
    const m = decodeMonotoneModule(out)!;
    expect(m.words[monWordIndex(m, 0, 4, 1)]).toBe((41 << 9) | F00);
  });

  it('a grid cell typed as F00 is written as effect index 7, data 0 (not dropped as empty)', async () => {
    const bytes = build([]);
    const out = await exported(bytes, (s) => { s.patterns[0].channels[0].rows[6] = { ...s.patterns[0].channels[0].rows[6], effTyp: 0xf, eff: 0 }; });
    const m = decodeMonotoneModule(out)!;
    expect(m.words[monWordIndex(m, 0, 6, 0)]).toBe(7 << 6);
  });
});

describe('MONOTONE note off survives export and re-import at its row', () => {
  it('a note off typed at rows 0, 9, 63 is still a note off at that row after export and parse', async () => {
    const bytes = build([[0, 0, 0, 40 << 9]]);
    const rows = [0, 9, 31, 63];
    const out = await exported(bytes, (s) => { for (const r of rows) s.patterns[0].channels[0].rows[r] = { ...s.patterns[0].channels[0].rows[r], note: 97 }; });
    const back = parseMonotoneFile(out, 'T.MON')!.patterns[0].channels[0].rows;
    for (const r of rows) expect(back[r].note).toBe(97);
    expect(back[1].note).toBe(0);
    const m = decodeMonotoneModule(out)!;
    expect(m.words[monWordIndex(m, 0, 9, 0)]).toBe(127 << 9);
  });
});

describe('MONOTONE note frequency / PIT divisor table (MT_PLAY.PAS Init, PITfreq div Hz)', () => {
  // Pascal: notesHz[n*8] = Round(27.5 * 2^((n-1)/12)), accumulated by multiplying with 2^(1/96) per interval.
  const PIT = 1193182;
  const hz = (n: number): number => {
    let t = 27.5;
    const iv = Math.pow(2, 1 / 96);
    for (let i = 8; i < n * 8; i++) t *= iv;
    return Math.round(t);
  };
  // Hand-checked exact values: A0 27.5 -> 28, A4 (note 49) 440, C4 (note 40) 262, A8 (note 97) 7040.
  it('reference formula gives the known frequencies', () => {
    expect(hz(1)).toBe(28);
    expect(hz(49)).toBe(440);
    expect(hz(40)).toBe(262);
    expect(hz(97)).toBe(7040);
  });

  it('the WASM player sounds divisor PITfreq div Round(Hz) for notes 1, 40, 49, 88 and 100', async () => {
    const dir = join(ROOT, 'public/monotone');
    const b = await loadWebBundle<{
      _malloc(n: number): number; _free(p: number): void;
      _mt_create(d: number, s: number, r: number): number; _mt_render(m: number, o: number, f: number): number;
      _mt_get_divisor(m: number): number; _mt_get_speed(m: number): number;
    }>(join(dir, 'Monotone.js'), join(dir, 'Monotone.wasm'), 'createMonotone');
    const mod = b.module;
    for (const n of [1, 40, 49, 88, 100]) {
      const song = build([[0, 0, 0, n << 9]]);
      const ptr = mod._malloc(song.length);
      b.heap().set(song, ptr);
      const m = mod._mt_create(ptr, song.length, 48000);
      const frames = 4800;
      const out = mod._malloc(frames * 4);
      mod._mt_render(m, out, frames);
      expect(mod._mt_get_divisor(m)).toBe(Math.floor(PIT / hz(n)));
      mod._free(out); mod._free(ptr);
    }
  });
});
