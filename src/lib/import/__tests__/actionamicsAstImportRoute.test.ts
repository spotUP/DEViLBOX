/**
 * Actionamics .ast phase A: loading dynablaster.ast through the app's import entry point (parseModuleToSong) goes to
 * the native Actionamics parser (grid), not the UADE-only prefix list.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@lib/import/formats/ActionamicsParser', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../formats/ActionamicsParser')>();
  return {
    ...orig,
    parseActionamicsFile: (...a: Parameters<typeof orig.parseActionamicsFile>) => {
      sentinel.calls++;
      return orig.parseActionamicsFile(...a);
    },
  };
});

const DIR = join(process.cwd(), 'public/data/songs/formats');

describe('actionamics .ast import route', () => {
  it.each(['dynablaster.ast', 'ast.dynablaster'])('%s', async (name) => {
    const { parseModuleToSong } = await import('../parseModuleToSong');
    const raw = new Uint8Array(readFileSync(join(DIR, 'dynablaster.ast')));
    const before = sentinel.calls;
    const song = await parseModuleToSong(new File([raw], name));
    expect(sentinel.calls).toBeGreaterThan(before);
    expect(song.numChannels).toBe(4);
    expect(song.patterns.map((p) => p.length)).toEqual([50, 49, 64]);
    const notes = (v: number) => song.patterns.reduce((a, p) => a + p.channels[v].rows.filter((c) => c.note).length, 0);
    expect([0, 1, 2, 3].map(notes)).toEqual([61, 70, 59, 42]);
    const v1 = song.patterns.map((p) => p.channels[0].rows.map((c, r) => [r, c.note, c.instrument]).filter((x) => x[1]).slice(0, 4));
    expect(v1).toEqual([[[36, 21, 23]], [[0, 24, 1], [1, 24, 1], [2, 36, 1], [3, 24, 1]], [[0, 31, 1], [1, 31, 1], [3, 31, 1], [4, 31, 1]]]);
    expect(song.initialSpeed).toBe(3);
    expect(song.initialBPM).toBe(125);
    expect(song.gridUnmatchedReason).toBeUndefined();
  });
});
