/**
 * A JayTrax file named two.jxs routes to the native JayTrax parser, not to UADE. Its first segment ("two")
 * is the NTSP prefix; a name that ends in a registered extension is that format's file, so the prefix form
 * must not claim it.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('@lib/import/formats/JxsParser', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@lib/import/formats/JxsParser')>();
  return { ...mod, parseJxsFile: vi.fn(mod.parseJxsFile) };
});

import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { parseJxsFile } from '@lib/import/formats/JxsParser';

describe('prefix-form names', () => {
  it('a .jxs named two.jxs routes to the native JayTrax parser, not UADE', async () => {
    const raw = new Uint8Array(readFileSync('public/data/songs/formats/popcorn.jxs'));
    vi.mocked(parseJxsFile).mockClear();
    const song = await parseModuleToSong(new File([raw], 'two.jxs'));
    expect(vi.mocked(parseJxsFile)).toHaveBeenCalledTimes(1);
    expect(song.format).not.toMatch(/uade/i);
  });
});
