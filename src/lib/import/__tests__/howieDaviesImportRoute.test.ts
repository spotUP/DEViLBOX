/**
 * Howie Davies phase A: loading .hd files through the app's import entry point (parseModuleToSong) yields the decoder's
 * time-aligned grid with byte-exact stream carriers.
 *
 * Expected values come from the decoder run on the corpus: blazing_thunder.hd (Blazing Thunder replayer, 92244 bytes):
 * four voices, one row = 6 ticks (BPM 125 = 50 Hz), 2752 rows in 43 patterns of 64 rows, 473 / 1221 / 620 / 802 notes per
 * voice, 84 byte streams (4 position lists from file offset 86630 plus the executed patterns), 4672 carrier bytes.
 * The tick rate is the 50 Hz assumption of the decoder.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@lib/import/formats/HowieDaviesParser', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../formats/HowieDaviesParser')>();
  return {
    ...orig,
    parseHowieDaviesFile: (...a: Parameters<typeof orig.parseHowieDaviesFile>) => {
      sentinel.calls++;
      return orig.parseHowieDaviesFile(...a);
    },
  };
});

const ROOT = process.cwd();

function playedNotes(song: TrackerSong, voice: number): number[] {
  return song.patterns.flatMap((p) => p.channels[voice].rows.map((c) => c.note)).filter((n) => n > 0 && n !== 97);
}

async function load(path: string): Promise<{ song: TrackerSong; raw: Uint8Array; layout: UADEVariablePatternLayout }> {
  const { parseModuleToSong } = await import('../parseModuleToSong');
  const raw = new Uint8Array(readFileSync(join(ROOT, path)));
  const before = sentinel.calls;
  const song = await parseModuleToSong(new File([raw], path.split('/').pop() as string));
  expect(sentinel.calls).toBeGreaterThan(before);
  const layout = (song as unknown as { uadeVariableLayout: UADEVariablePatternLayout }).uadeVariableLayout;
  expect(layout.formatId).toBe('howieDavies');
  expect(song.gridUnmatchedReason).toBeUndefined();
  return { song, raw, layout };
}

function expectCarriers(layout: UADEVariablePatternLayout, raw: Uint8Array): void {
  expect(layout.blockRows?.length).toBe(layout.filePatternAddrs.length);
  layout.blockRows?.forEach((cells, i) => {
    const bytes = layout.encoder.encodePattern(cells, 0);
    const off = layout.filePatternAddrs[i];
    expect(Array.from(bytes)).toEqual(Array.from(raw.subarray(off, off + layout.filePatternSizes[i])));
  });
}

describe('howie davies import route', () => {
  it('blazing_thunder.hd (Blazing Thunder)', async () => {
    const { song, raw, layout } = await load('public/data/songs/formats/blazing_thunder.hd');
    expect(song.numChannels).toBe(4);
    expect([0, 1, 2, 3].map((v) => playedNotes(song, v).length)).toEqual([473, 1221, 620, 802]);
    expect(song.patterns.length).toBe(43);
    expect(song.patterns.reduce((n, p) => n + p.length, 0)).toBe(2752);
    expect(song.initialSpeed).toBe(6);
    expect(song.initialBPM).toBe(125);
    expect(layout.filePatternAddrs.length).toBe(84);
    expect(layout.filePatternAddrs[0]).toBe(86630);
    expect(layout.filePatternSizes.reduce((a, b) => a + b, 0)).toBe(4672);
    expect([0, 1, 2, 3].map((v) => playedNotes(song, v).slice(0, 3))).toEqual([[18, 18, 18], [18, 18, 18], [37, 33, 26], [25, 48, 30]]);
    expectCarriers(layout, raw);
  });
});
