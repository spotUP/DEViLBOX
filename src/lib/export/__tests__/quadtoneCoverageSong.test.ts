import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFurnaceSong } from '@/lib/import/formats/FurnaceSongParser';
import { buildModule, sectionTable } from '../../../../tools/zx/make-quadtone-coverage-song';

const FILE = resolve(__dirname, '../../../../public/data/songs/furnace/misc/QuadTone Coverage Test.fur');

describe('QuadTone coverage song', () => {
  it('the committed .fur is what the script generates', () => {
    expect(Buffer.from(readFileSync(FILE)).equals(Buffer.from(buildModule()))).toBe(true);
  });

  it('parses as a 5 channel QuadTone module with 8 sections', async () => {
    const bytes = readFileSync(FILE);
    const m = await parseFurnaceSong(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer);
    expect(m.systems[0]).toBe(0xca);
    expect(m.chans).toBe(5);
    expect(sectionTable()).toHaveLength(8);
    expect(m.subsongs[0].orders[0].length).toBe(22);
    expect(m.samples.length).toBe(4);
    expect(m.comment).toContain('Sections');
  });
});
