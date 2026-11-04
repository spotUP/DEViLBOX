/**
 * Reachability: a .tw file dropped on the product's top-level import (parseModuleToSong) runs the
 * native Tony Williams parser (sentinel: call count 1), yields 4 voices with notes, and the loaded
 * song exports through the native exporter byte-identical to the input.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('@lib/import/formats/TonyWilliamsParser', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@lib/import/formats/TonyWilliamsParser')>();
  return { ...mod, parseTonyWilliamsFile: vi.fn(mod.parseTonyWilliamsFile) };
});

import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { parseTonyWilliamsFile } from '@lib/import/formats/TonyWilliamsParser';
import { exportTonyWilliams } from '@lib/export/TonyWilliamsExporter';

const PATH = 'public/data/songs/formats/future basketball main.tw';

describe('Tony Williams reachability', () => {
  it('top-level import runs the TW parser; song has 4 voices with notes; native export is byte-exact', async () => {
    const raw = readFileSync(PATH);
    const file = new File([new Uint8Array(raw)], 'future basketball main.tw');
    const song = await parseModuleToSong(file);
    expect(vi.mocked(parseTonyWilliamsFile)).toHaveBeenCalledTimes(1);
    const pats = song.patterns;
    expect(pats.length).toBeGreaterThan(0);
    for (const p of pats) expect(p.channels.length).toBe(4);
    const counts = [0, 1, 2, 3].map((c) => pats.reduce((n, p) => n + p.channels[c]!.rows.filter((r) => r.note > 0).length, 0));
    // Regression: voices 2 and 3 were dropped when the grid swept the voice-ordered walk as if tick-ordered.
    expect(counts.every((n) => n > 0)).toBe(true);
    for (let c = 0; c < 4; c++) {
      expect(pats.some((p) => p.channels[c]!.rows.some((r) => r.note > 0))).toBe(true);
    }
    // Regression: the grid played at speed 1 (one row per 50 Hz frame), 6x too fast. The player steps the voices
    // every a5@(18) frames, loaded from the song record's tempo byte (0x06 in future basketball).
    expect(song.initialSpeed).toBe(6);
    expect(song.initialBPM).toBe(125);
    // No invented instrument names: the file names none.
    expect(song.instruments.every((i) => i.name === '')).toBe(true);
    const out = new Uint8Array(await (await exportTonyWilliams(song)).data.arrayBuffer());
    expect(Buffer.from(out).equals(raw)).toBe(true);
  });
});
