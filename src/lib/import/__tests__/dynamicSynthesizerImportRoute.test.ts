/**
 * Dynamic Synthesizer phase A: loading dns.ptc through the app's import entry point (parseModuleToSong) yields the
 * decoder's time-aligned grid with byte-exact stream carriers.
 *
 * Expected values come from the decoder run on public/data/songs/formats/dns.ptc (14096 bytes): fixed-pattern
 * sequencer (0x60-byte patterns of 48 steps, 100 Hz tick), song speed 3 -> BPM 250. Eight pattern streams at
 * 0x292c + n*0x60 (n = 0..7), twelve song positions of 48 rows = 576 rows. Voice 1 (track 0) starts on row 0 with
 * note 28 and instrument 0, note off on row 5, then note 28 again on row 6. Tracks 4 and 5 never play.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@lib/import/formats/DynamicSynthesizerParser', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../formats/DynamicSynthesizerParser')>();
  return {
    ...orig,
    parseDynamicSynthesizerFile: (...a: Parameters<typeof orig.parseDynamicSynthesizerFile>) => {
      sentinel.calls++;
      return orig.parseDynamicSynthesizerFile(...a);
    },
  };
});

const DIR = join(process.cwd(), 'public/data/songs/formats');

function notesOf(song: TrackerSong, v: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  song.patterns.forEach((p, pi) => p.channels[v].rows.forEach((c, r) => {
    if (c.note) out.push([pi * 48 + r, c.note, c.instrument]);
  }));
  return out;
}

describe('dns import route', () => {
  it('dns.ptc', async () => {
    const { parseModuleToSong } = await import('../parseModuleToSong');
    const raw = new Uint8Array(readFileSync(join(DIR, 'dns.ptc')));
    const before = sentinel.calls;
    const song = await parseModuleToSong(new File([raw], 'dns.ptc'));
    expect(sentinel.calls).toBeGreaterThan(before);
    const layout = (song as unknown as { uadeVariableLayout: UADEVariablePatternLayout }).uadeVariableLayout;
    expect(layout.formatId).toBe('dynamicSynthesizer');
    expect(song.gridUnmatchedReason).toBeUndefined();

    const v = [0, 1, 2, 3, 4, 5].map((i) => notesOf(song, i));
    expect(song.numChannels).toBe(6);
    expect(v.map((n) => n.filter((x) => x[1] !== 97).length)).toEqual([132, 96, 10, 8, 0, 0]);
    expect(song.patterns.length).toBe(12);
    expect(song.patterns.every((p) => p.length === 48)).toBe(true);
    expect(v[0].slice(0, 3)).toEqual([[0, 28, 0], [5, 97, 0], [6, 28, 0]]);
    expect(v[1].slice(0, 2)).toEqual([[0, 23, 10], [1, 97, 0]]);
    expect(song.initialSpeed).toBe(3);
    expect(song.initialBPM).toBe(250);
    expect(layout.filePatternAddrs.length).toBe(8);

    expect(layout.blockRows?.length).toBeGreaterThan(0);
    layout.blockRows?.forEach((cells, i) => {
      const bytes = layout.encoder.encodePattern(cells, 0);
      const off = layout.filePatternAddrs[i];
      expect(Array.from(bytes)).toEqual(Array.from(raw.subarray(off, off + layout.filePatternSizes[i])));
      expect(bytes.length).toBe(layout.filePatternSizes[i]);
    });
  });
});
