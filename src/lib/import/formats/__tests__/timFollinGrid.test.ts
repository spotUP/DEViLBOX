/**
 * Tim Follin phase A: the read-only grid, through the parser on the corpus song follin_smallest.tf.
 *
 * Expected values come from third-party/nuade/players/timfollin (tfol_module.c locate/read_event, tfol.c fetch and
 * play_note) applied by hand to the file bytes, not from the decoder under test:
 *  - Subsong 0 plays song number 1; the song has 4 voices. Voice streams sit at file offsets 24714, 24852, 24906, 24978.
 *  - Voice 0 @24714: Instrument 4, then note 0x32 with length 2 on tick 0. Period 213 = tracker note 37, instrument
 *    column 4 + 1 = 5. Next fetch on tick 2: Instrument 5, Transpose 0xf4, note 0x3b (+0xf4 = 47), period 253 =
 *    tracker note 34, instrument column 6.
 *  - Voice 1 @24852: note 0x32 length 2, then on tick 2 note 0x1c = tracker note 15 (column 8), length 45, so the next
 *    note, 0x1a = tracker note 13, starts on tick 47.
 *  - Voice 2 @24906: note 0x32 length 3, Portamento rate 4 keeps the previous note: tick 3 shows note 37, column 10.
 *  - Voice 3 @24978: note 0x32 length 2; on tick 2 note 0x34 = tracker note 39 (column 7), tick 3 note 39 (column 5).
 *  - Per-voice note starts before the pass repeats: 47, 19, 14, 21; the longest voice defines 588 rows.
 *  - Carriers: the executed event spans are {24714,191}, {24906,71}, {24978,28} (merged); one cell per byte.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parseTimFollinFile, isTimFollinFormat } from '../TimFollinParser';
import { timFollinEncoder } from '@/engine/uade/encoders/TimFollinEncoder';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const NAME = 'follin_smallest.tf';
const raw = readFileSync(`${process.cwd()}/public/data/songs/formats/${NAME}`);
const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

const cellAt = (s: TrackerSong, v: number, tick: number) => {
  const c = s.patterns[Math.floor(tick / 64)].channels[v].rows[tick % 64];
  return [c.note, c.instrument];
};

describe('Tim Follin read-only grid', () => {
  it('notes per voice, first notes, byte-exact carriers', () => {
    expect(isTimFollinFormat(ab, NAME)).toBe(true);
    const song = parseTimFollinFile(ab, NAME);
    expect(song.gridUnmatchedReason).toBeUndefined();
    expect(song.patterns.reduce((n, p) => n + p.length, 0)).toBe(588);

    expect(cellAt(song, 0, 0)).toEqual([37, 5]);
    expect(cellAt(song, 0, 1)).toEqual([0, 0]);
    expect(cellAt(song, 0, 2)).toEqual([34, 6]);
    expect(cellAt(song, 1, 2)).toEqual([15, 8]);
    expect(cellAt(song, 1, 47)).toEqual([13, 8]);
    expect(cellAt(song, 2, 3)).toEqual([37, 10]);
    expect(cellAt(song, 3, 2)).toEqual([39, 7]);
    expect(cellAt(song, 3, 3)).toEqual([39, 5]);

    const counts = [0, 1, 2, 3].map((v) =>
      song.patterns.reduce((n, p) => n + p.channels[v].rows.filter((r) => r.note > 0).length, 0));
    expect(counts).toEqual([47, 19, 14, 21]);

    const layout = (song as unknown as { uadeVariableLayout: UADEVariablePatternLayout }).uadeVariableLayout;
    expect(layout.formatId).toBe('timFollin');
    expect(layout.filePatternAddrs).toEqual([24714, 24906, 24978]);
    expect(layout.filePatternSizes).toEqual([191, 71, 28]);
    layout.blockRows!.forEach((cells, i) => {
      const addr = layout.filePatternAddrs[i];
      const rebuilt = timFollinEncoder.encodePattern(cells, 0);
      expect(Array.from(rebuilt)).toEqual(Array.from(raw.subarray(addr, addr + layout.filePatternSizes[i])));
    });
  });
});
