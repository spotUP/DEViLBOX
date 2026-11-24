/**
 * Tim Follin: a note on an empty row inside a held note splits that note ([note][len] -> [note][d][new][len-d]) and
 * moves the later bytes by 2 with every stream address raised (timFollinEdits.ts addNote). Real songs: the .tf corpus.
 * Reloaded, the note stands on that row, the song has the same length and every other cell is unchanged.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pattern } from '@/types';
import { buildTimFollinGrid } from '@lib/import/formats/timFollinGrid';
import { applyTimFollinGridEdits } from '@lib/import/formats/timFollinEdits';

const FILES = ['public/data/songs/formats/follin_smallest.tf', 'public/data/songs/follin-player-ii/sly spy title.tf'];
const clone = (ps: Pattern[]): Pattern[] => structuredClone(ps);

describe.each(FILES)('Tim Follin note on an empty row: %s', (file) => {
  const raw = new Uint8Array(readFileSync(join(process.cwd(), file)));

  it('lands on that row, grows the module by 2 bytes, keeps every other cell', () => {
    const g = buildTimFollinGrid(raw)!;
    const patterns = clone(g.patterns);
    let hit: [number, number, number] | null = null;
    patterns.forEach((pat, p) => pat.channels.forEach((ch, c) => ch.rows.forEach((row, r) => {
      if (!hit && r > 0 && row.note === 0 && ch.rows[r - 1].note > 0) hit = [p, c, r];
    })));
    const [p, c, r] = hit as unknown as [number, number, number];
    expect(hit).not.toBeNull();
    patterns[p].channels[c].rows[r].note = 40;
    const res = applyTimFollinGridEdits(raw, patterns);
    if (res.warnings.length > 0) console.log(file, res.warnings);
    expect(res.data.length).toBe(raw.length + 2);
    const again = buildTimFollinGrid(res.data)!;
    expect(again.rows).toBe(g.rows);
    expect(again.patterns[p].channels[c].rows[r].note).toBe(40);
    let changed = 0;
    g.patterns.forEach((pt, pi) => pt.channels.forEach((ch, ci) => ch.rows.forEach((was, ri) => {
      const now = again.patterns[pi].channels[ci].rows[ri];
      if (now.note !== was.note) { changed++; expect(was.note).toBe(0); expect(now.note).toBe(40); }
    })));
    expect(changed).toBeGreaterThanOrEqual(1);
  });

  it('writes a note with another instrument through Instrument commands, every other cell keeping its instrument', () => {
    const g = buildTimFollinGrid(raw)!;
    const used = new Set<number>();
    g.rowSources.forEach((p) => p.forEach((v) => v.forEach((s) => { if (s && s.instrument > 0) used.add(s.instrument); })));
    let done = 0;
    g.patterns.forEach((pat, p) => pat.channels.forEach((ch, c) => ch.rows.forEach((row, r) => {
      if (done || r === 0 || row.note !== 0 || ch.rows[r - 1].note === 0) return;
      const was = g.rowSources[p][c][r - 1]?.instrument ?? 0;
      const want = [...used].find((i) => i !== was);
      if (!want || was === 0) return;
      const patterns = clone(g.patterns);
      patterns[p].channels[c].rows[r].note = 40;
      patterns[p].channels[c].rows[r].instrument = want;
      const res = applyTimFollinGridEdits(raw, patterns);
      if (res.data.length !== raw.length + 6) return;
      done++;
      const again = buildTimFollinGrid(res.data)!;
      expect(again.rows).toBe(g.rows);
      const cell = again.patterns[p].channels[c].rows[r];
      expect([cell.note, cell.instrument]).toEqual([40, want]);
      g.patterns.forEach((pt, pi) => pt.channels.forEach((ch2, ci) => ch2.rows.forEach((w, ri) => {
        const now = again.patterns[pi].channels[ci].rows[ri];
        if (now.note === w.note) expect(now.instrument).toBe(w.instrument);
      })));
    })));
    expect(done).toBeGreaterThanOrEqual(1);
  });

  it('refuses a different instrument and a note outside the table, writing nothing', () => {
    const g = buildTimFollinGrid(raw)!;
    const patterns = clone(g.patterns);
    const rows = patterns[0].channels[0].rows;
    const r = rows.findIndex((x, i) => i > 0 && x.note === 0 && rows[i - 1].note > 0);
    rows[r].note = 40;
    rows[r].instrument = 99;
    const res = applyTimFollinGridEdits(raw, patterns);
    expect(res.warnings.some((w) => /not written/.test(w))).toBe(true);
    expect(Buffer.from(res.data).equals(Buffer.from(raw))).toBe(true);
  });
});
