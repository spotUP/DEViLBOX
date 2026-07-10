import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMaxTraxFile } from '@/lib/import/formats/MaxTraxParser';

const buf = () => readFileSync(join(process.cwd(), 'public/data/songs/maxtrax', 'contraptionzack-march.mxtx'));

describe('MaxTrax import', () => {
  it('attaches the parsed MaxTraxData to the song for the store', () => {
    const song = parseMaxTraxFile(buf().buffer as ArrayBuffer, 'contraptionzack-march.mxtx') as any;
    expect(song.maxTraxData).toBeDefined();
    expect(song.maxTraxData.scores.length).toBeGreaterThan(0);
  });

  it('does not silently drop notes to a 64-row cap (uses derived row count)', () => {
    const song = parseMaxTraxFile(buf().buffer as ArrayBuffer, 'contraptionzack-march.mxtx') as any;
    // march spans many ticks -> >64 display rows at TPR=24 -> more than one pattern
    const totalRows = song.patterns.reduce((n: number, p: any) => n + p.length, 0);
    expect(totalRows).toBeGreaterThan(64);
  });
});
