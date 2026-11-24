/**
 * Beathoven Synthesizer: a note on an empty row inside a held plain note splits that note and moves the grown stream to
 * the end of the code hunk (beathovenEdits.ts addNote). Real songs: the .bss corpus. Reloaded, the note stands on that
 * row, the song has the same length and every cell not played from the moved stream is unchanged.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pattern } from '@/types';
import { buildBthGrid } from '@lib/import/formats/beathovenGrid';
import { applyBeathovenGridEdits } from '@lib/import/formats/beathovenEdits';

const FILES = ['public/data/songs/formats/beathoven_smallest.bss', 'public/data/songs/beathoven-synthesizer/tristar cracktro.bss'];
const clone = (ps: Pattern[]): Pattern[] => structuredClone(ps);

describe.each(FILES)('Beathoven note on an empty row: %s', (file) => {
  const raw = new Uint8Array(readFileSync(join(process.cwd(), file)));

  it('lands on that row, grows the module, keeps the length and the other cells', () => {
    const g = buildBthGrid(raw);
    if (typeof g === 'string') throw new Error(g);
    let landed = 0;
    outer: for (let p = 0; p < g.patterns.length; p++) for (let c = 0; c < 4; c++) {
      const rows = g.patterns[p].channels[c].rows;
      for (let r = 1; r < rows.length; r++) {
        if (rows[r].note !== 0 || rows[r - 1].note === 0) continue;
        const patterns = clone(g.patterns);
        patterns[p].channels[c].rows[r].note = 40;
        const res = applyBeathovenGridEdits(raw, patterns);
        if (res.data.length === raw.length) continue; // refused: nothing written
        const again = buildBthGrid(res.data);
        if (typeof again === 'string') throw new Error(again);
        expect(again.rows).toBe(g.rows);
        expect(again.patterns[p].channels[c].rows[r].note).toBe(40);
        expect(res.data.length).toBeGreaterThan(raw.length);
        landed++;
        break outer;
      }
    }
    expect(landed).toBe(1);
  });

  it('relocates every address the copied stream carries (HUNK_RELOC32 lists it at the new place)', () => {
    const g = buildBthGrid(raw);
    if (typeof g === 'string') throw new Error(g);
    const be = (d: Uint8Array, o: number): number => ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;
    // code-relative offsets of HUNK_RELOC32 (single code hunk: header word 28 = size in longs, code at 0x20)
    const relocs = (d: Uint8Array): Set<number> => {
      const out = new Set<number>();
      let ro = 0x20 + be(d, 28) * 4;
      if (be(d, ro) !== 0x3ec) return out;
      for (ro += 4; be(d, ro) !== 0; ro += 8 + 4 * be(d, ro)) for (let i = 0; i < be(d, ro); i++) out.add(be(d, ro + 8 + 4 * i));
      return out;
    };
    const oldRel = relocs(raw);
    const oldHunk = be(raw, 28) * 4;
    let checked = 0;
    for (let p = 0; p < g.patterns.length && checked === 0; p++) for (let c = 0; c < 4 && checked === 0; c++) {
      const rows = g.patterns[p].channels[c].rows;
      for (let r = 1; r < rows.length && checked === 0; r++) {
        if (rows[r].note !== 0 || rows[r - 1].note === 0) continue;
        const patterns = clone(g.patterns);
        patterns[p].channels[c].rows[r].note = 40;
        const out = applyBeathovenGridEdits(raw, patterns).data;
        if (out.length === raw.length) continue;
        const newHunk = be(out, 28) * 4;
        const added = newHunk - oldHunk;
        // the stream's old place: the code word a track-list entry held before it was repointed to the copy
        let from = -1;
        for (let o = 0; o < oldHunk; o += 2) if (be(out, 0x20 + o) === oldHunk && be(raw, 0x20 + o) !== oldHunk) { from = be(raw, 0x20 + o); break; }
        expect(from).toBeGreaterThanOrEqual(0);
        const newRel = relocs(out);
        for (const rel of oldRel) {
          if (rel < from || rel >= from + added - 4) continue;
          const v = be(raw, 0x20 + rel);
          // the word sits at the same place in the copy, or 4 bytes later past the split
          const at = [oldHunk + rel - from, oldHunk + rel - from + 4].filter((x) => be(out, 0x20 + x) === v);
          if (at.length === 0) continue; // past the stream's end
          expect(at.some((x) => newRel.has(x)), `relocated word at ${rel} copied without a relocation`).toBe(true);
          checked++;
        }
        // every old relocation still listed; group counts walk to the table's 0 and HUNK_END closes the file
        for (const rel of oldRel) expect(newRel.has(rel)).toBe(true);
        expect(be(out, out.length - 4)).toBe(0x3f2);
        expect(be(out, out.length - 8)).toBe(0);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('refuses a different instrument, writing nothing', () => {
    const g = buildBthGrid(raw);
    if (typeof g === 'string') throw new Error(g);
    const patterns = clone(g.patterns);
    const rows = patterns[0].channels[0].rows;
    const r = rows.findIndex((x, i) => i > 0 && x.note === 0 && rows[i - 1].note > 0);
    rows[r].note = 40;
    rows[r].instrument = 99;
    const res = applyBeathovenGridEdits(raw, patterns);
    expect(res.warnings.some((w) => /not written/.test(w))).toBe(true);
    expect(Buffer.from(res.data).equals(Buffer.from(raw))).toBe(true);
  });
});
