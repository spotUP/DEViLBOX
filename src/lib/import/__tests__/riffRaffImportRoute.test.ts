/**
 * Riff Raff phase A: loading .riff files through the app's import entry point (parseModuleToSong) yields the decoder's
 * time-aligned grid with byte-exact stream carriers.
 *
 * Expected values come from the decoder run on the corpus: riffraff_smallest.riff (Side Winder II replayer, 20976
 * bytes): four voices, one row = 3 ticks (BPM 125 = 50 Hz), 1409 rows in 23 patterns of 64 rows, 99 / 151 / 385 / 349
 * notes per voice, 17 byte streams. bombfusion.riff (Bomb Fusion replayer, One Shot driver): one row = 6 ticks, 1408
 * rows in 22 patterns, 350 / 174 / 298 / 530 notes, 35 streams. The tick rate is the 50 Hz assumption of the decoder.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@lib/import/formats/RiffRaffParser', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../formats/RiffRaffParser')>();
  return {
    ...orig,
    parseRiffRaffFile: (...a: Parameters<typeof orig.parseRiffRaffFile>) => {
      sentinel.calls++;
      return orig.parseRiffRaffFile(...a);
    },
  };
});

const ROOT = process.cwd();

function notesPerVoice(song: TrackerSong): number[] {
  return [0, 1, 2, 3].map((v) => song.patterns.reduce((n, p) => n + p.channels[v].rows.filter((c) => c.note > 0 && c.note !== 97).length, 0));
}

async function load(path: string): Promise<{ song: TrackerSong; raw: Uint8Array; layout: UADEVariablePatternLayout }> {
  const { parseModuleToSong } = await import('../parseModuleToSong');
  const raw = new Uint8Array(readFileSync(join(ROOT, path)));
  const before = sentinel.calls;
  const song = await parseModuleToSong(new File([raw], path.split('/').pop() as string));
  expect(sentinel.calls).toBeGreaterThan(before);
  const layout = (song as unknown as { uadeVariableLayout: UADEVariablePatternLayout }).uadeVariableLayout;
  expect(layout.formatId).toBe('riffRaff');
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

describe('riff raff import route', () => {
  it('riffraff_smallest.riff (Side Winder II)', async () => {
    const { song, raw, layout } = await load('public/data/songs/formats/riffraff_smallest.riff');
    expect(song.numChannels).toBe(4);
    expect(notesPerVoice(song)).toEqual([99, 151, 385, 349]);
    expect(song.patterns.length).toBe(23);
    expect(song.patterns.reduce((n, p) => n + p.length, 0)).toBe(1409);
    expect(song.initialSpeed).toBe(3);
    expect(song.initialBPM).toBe(125);
    expect(layout.filePatternAddrs.length).toBe(17);
    expect(layout.filePatternAddrs[0]).toBe(2734);
    expect(song.patterns[0].channels[3].rows.slice(0, 6).map((c) => c.note)).toEqual([5, 36, 0, 0, 0, 36]);
    expectCarriers(layout, raw);
  });

  it('bombfusion.riff (Bomb Fusion, One Shot driver)', async () => {
    const { song, raw, layout } = await load('public/data/songs/riff-raff/bombfusion.riff');
    expect(notesPerVoice(song)).toEqual([350, 174, 298, 530]);
    expect(song.patterns.length).toBe(22);
    expect(song.patterns.reduce((n, p) => n + p.length, 0)).toBe(1408);
    expect(song.initialSpeed).toBe(6);
    expect(layout.filePatternAddrs.length).toBe(35);
    expect(song.patterns[0].channels[0].rows.slice(0, 15).map((c) => c.note)).toEqual([30, 0, 0, 0, 0, 0, 29, 0, 0, 0, 0, 0, 0, 0, 97]);
    expectCarriers(layout, raw);
  });
});
