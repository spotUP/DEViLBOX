/**
 * Tim Follin phase A: loading follin_smallest.tf through the app's import entry point (parseModuleToSong) yields
 * the Follin decoder's read-only grid with byte-exact stream carriers, while playback stays on UADE / nuade.
 *
 * Expected values are derived by hand from third-party/nuade/players/timfollin (see formats/__tests__/timFollinGrid.test.ts
 * for the per-voice derivation): subsong 0 plays song 1 with 4 voices; voice 0 starts note 0x32 (period 213 = tracker
 * note 37) with Instrument 4 (column 5) on tick 0 and note 34 (column 6) on tick 2; voice 1 plays note 15 on tick 2
 * and note 13 on tick 47; voice 2 portamento keeps note 37 on tick 3; voice 3 plays note 39 on ticks 2 and 3.
 * Per-voice note starts are 47, 19, 14, 21 over 588 rows. The executed stream regions are {24714,191}, {24906,71},
 * {24978,28}. The sentinel proves the route reached parseTimFollinFile.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { timFollinEncoder } from '@/engine/uade/encoders/TimFollinEncoder';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@lib/import/formats/TimFollinParser', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../formats/TimFollinParser')>();
  return { ...orig, parseTimFollinFile: (...a: Parameters<typeof orig.parseTimFollinFile>) => { sentinel.calls++; return orig.parseTimFollinFile(...a); } };
});

describe('Tim Follin .tf import route', () => {
  it('parseModuleToSong gives the Follin grid with byte-exact carriers and keeps UADE playback', async () => {
    const { parseModuleToSong } = await import('../parseModuleToSong');
    const raw = readFileSync(join(process.cwd(), 'public/data/songs/formats/follin_smallest.tf'));
    const song = await parseModuleToSong(new File([new Uint8Array(raw)], 'follin_smallest.tf'));
    expect(sentinel.calls).toBeGreaterThan(0);
    expect(song.gridUnmatchedReason).toBeUndefined();

    // one row = one song step (15 ticks): ceil(588 / 15) rows in 64-row patterns
    expect(song.initialSpeed).toBe(15);
    expect(song.patterns.reduce((n, p) => n + p.length, 0)).toBe(Math.ceil(588 / song.initialSpeed));

/** The note starting on `tick` of a voice: one row is one song step, a note inside its row has a 0xD7 delay or sits in note column 2. */
const at = (v: number, tick: number): number[] => noteAtFor(song, v, tick);
function noteAtFor(song: TrackerSong, v: number, tick: number): number[] {
  const step = song.initialSpeed;
  const row = Math.floor(tick / step), off = tick % step;
  const c = song.patterns[Math.floor(row / 64)].channels[v].rows[row % 64] as unknown as Record<string, number>;
  if (c.note > 0 && (c.effTyp === 0xd7 ? c.eff : 0) === off) return [c.note, c.instrument];
  const x = (c as unknown as { extraNotes?: Array<{ note?: number; instrument?: number; delay?: number }> }).extraNotes?.[0];
  if (x && (x.note ?? 0) > 0 && (x.delay ?? 0) === off) return [x.note!, x.instrument ?? 0];
  return [0, 0];
}
const countNotesFor = (song: TrackerSong, v: number): number =>
  song.patterns.reduce((n, p) => n + p.channels[v].rows.filter((r) => r.note > 0).length + p.channels[v].rows.filter((r) => (r.extraNotes?.[0]?.note ?? 0) > 0).length, 0);

    expect(at(0, 0)).toEqual([37, 5]);
    expect(at(0, 2)).toEqual([34, 6]);
    expect(at(1, 0)).toEqual([37, 5]);
    expect(at(1, 2)).toEqual([15, 8]);
    expect(at(1, 47)).toEqual([13, 8]);
    expect(at(2, 3)).toEqual([37, 10]);
    expect(at(3, 2)).toEqual([39, 7]);
    // a third onset in one row of one voice has no note column left (grid.unplacedNotes)
    // a hold is an empty row
    expect(at(0, 1)).toEqual([0, 0]);

    const counts = [0, 1, 2, 3].map((v) => countNotesFor(song, v));
    expect(counts).toEqual([42, 19, 14, 20]) // 47, 19, 14, 21 walk onsets; the 6 left out are third onsets in one 15-tick row;

    // carriers: the executed stream regions, rebuilt through the encoder, equal the original file bytes
    const layout = (song as unknown as { uadeVariableLayout?: UADEVariablePatternLayout }).uadeVariableLayout;
    expect(layout?.formatId).toBe('timFollin');
    expect(layout?.filePatternAddrs).toEqual([24714, 24906, 24978]);
    expect(layout?.filePatternSizes).toEqual([191, 71, 28]);
    layout?.blockRows?.forEach((cells, i) => {
      const addr = layout.filePatternAddrs[i];
      const rebuilt = timFollinEncoder.encodePattern(cells, 0);
      expect(Array.from(rebuilt)).toEqual(Array.from(raw.subarray(addr, addr + layout.filePatternSizes[i])));
    });
    // playback unchanged: the whole module goes to the engine that plays it (nuade by default for timfollin, which
    // takes the UADE file data field over), not to the grid decoder
    const played = song as unknown as { nuadeFileData?: ArrayBuffer; uadeEditableFileData?: ArrayBuffer; nuadePlayerId?: string };
    expect((played.nuadeFileData ?? played.uadeEditableFileData)?.byteLength).toBe(raw.byteLength);
  });
});
