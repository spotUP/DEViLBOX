/**
 * Tim Follin and Sound Programming Language: a volume edit on a note row has no per-note byte to land in (Follin: voice-wide
 * Set Envelope command; SPL: shared instrument record). It is refused with that reason and the file stays byte-identical.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pattern } from '@/types';
import { buildTimFollinGrid } from '@lib/import/formats/timFollinGrid';
import { applyTimFollinGridEdits } from '@lib/import/formats/timFollinEdits';
import { buildSplGrid } from '@lib/import/formats/soundProgrammingLanguageGrid';
import { applySplGridEdits } from '@lib/import/formats/soundProgrammingLanguageEdits';

const read = (f: string): Uint8Array => new Uint8Array(readFileSync(join(process.cwd(), f)));

function firstNote(patterns: Pattern[]): [number, number, number] {
  for (let p = 0; p < patterns.length; p++) for (let c = 0; c < patterns[p].channels.length; c++) {
    const r = patterns[p].channels[c].rows.findIndex((x) => x.note > 0 && x.note < 97);
    if (r >= 0) return [p, c, r];
  }
  throw new Error('no note');
}

describe('volume edits refused with the build-specific reason', () => {
  it.each(['follin-player-ii/sly spy title.tf', 'formats/follin_smallest.tf'])('Tim Follin %s', (name) => {
    const raw = read(`public/data/songs/${name}`);
    const g = buildTimFollinGrid(raw);
    if (!g) return;
    const patterns = structuredClone(g.patterns);
    const [p, c, r] = firstNote(patterns);
    patterns[p].channels[c].rows[r].volume = 0x30;
    const res = applyTimFollinGridEdits(raw, patterns);
    expect(res.warnings.some((w) => /Set Envelope/.test(w))).toBe(true);
    expect(Buffer.from(res.data).equals(Buffer.from(raw))).toBe(true);
  });
  it('Sound Programming Language boulderdash.spl', () => {
    const raw = read('public/data/songs/formats/boulderdash.spl');
    const g = buildSplGrid(raw);
    if (typeof g === 'string') throw new Error(g);
    const patterns = structuredClone(g.patterns);
    const [p, c, r] = firstNote(patterns);
    patterns[p].channels[c].rows[r].volume = 0x30;
    const res = applySplGridEdits(raw, patterns);
    expect(res.warnings.some((w) => /instrument record/.test(w))).toBe(true);
    expect(Buffer.from(res.data).equals(Buffer.from(raw))).toBe(true);
  });
});
