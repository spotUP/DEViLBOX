/**
 * SynthDream phase A: the read-only grid, through the real entry point (parseSynthDreamFile) on corpus songs.
 *
 * Expected values come from the replayer logic in third-party/nuade/players/synthdream/synthdream.c, applied by
 * hand to the file bytes (not from the decoder under test):
 *  - sdr.monsterbusiness_5, voice 0: track table @0x28 -> entry {commands 0x1E8, transpose 0x27, repeat 0}.
 *    Stream @0x1E8 begins `001C 0004 0060 0000 0000`: word 0x1C = command_forms[14] = duration+note+cut+instrument,
 *    so duration 4, note 0x60, cut 0, instrument 0. Instrument record 0 @0x438 has byte+1 = 0x01 (fixed pitch), so no
 *    transpose: shown note = 0x60 - 60 (C-1 = 60) = 36, tracker note = 36 + 13 = 49, instrument number 0 -> column 1.
 *    The command lasts 4 ticks, so the next one starts on tick 4: `001C 0014 0030 0028 0003` = duration 20, note 0x30,
 *    cut 0x28, instrument 3 (record 0x498 not fixed-pitch): (0x30 + 0x27) & 0xFF = 87, 87 - 60 = 27, +13 = 40, instrument
 *    column 4. The following command starts on tick 4 + 20 = 24 and plays instrument 0 again: note 49, column 1.
 *  - The same derivation per voice gives the other first notes (voice 1 tick 0 note 40 instrument 4, next on tick 32).
 *  - The per-voice counts are the number of commands that start a note or a rest within the timeline.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parseSynthDreamFile, isSynthDreamFormat } from '../SynthDreamParser';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const DIR = `${process.cwd()}/public/data/songs/formats`;

function load(name: string): { bytes: Uint8Array; song: TrackerSong } {
  const raw = readFileSync(`${DIR}/${name}`);
  const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  expect(isSynthDreamFormat(ab, name)).toBe(true);
  return { bytes: new Uint8Array(ab), song: parseSynthDreamFile(ab, name) };
}

function voiceNotes(song: TrackerSong, v: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  song.patterns.forEach((p, pi) => p.channels[v].rows.forEach((c, r) => {
    if (c.note) out.push([pi * 64 + r, c.note, c.instrument]);
  }));
  return out;
}

const layoutOf = (s: TrackerSong): UADEVariablePatternLayout =>
  (s as unknown as { uadeVariableLayout: UADEVariablePatternLayout }).uadeVariableLayout;

describe('SynthDream read-only grid', () => {
  const cases: Array<{ file: string; counts: number[]; first: Record<number, Array<[number, number, number]>> }> = [
    {
      file: 'sdr.monsterbusiness_5',
      counts: [560, 240, 242, 80],
      first: { 0: [[0, 49, 1], [4, 40, 4], [24, 49, 1]], 1: [[0, 40, 4], [32, 25, 3]] },
    },
    {
      file: 'sdr.nobuddiesland_jigsaw',
      counts: [413, 486, 221, 486],
      first: { 1: [[0, 19, 5], [12, 19, 5], [18, 19, 5]] },
    },
  ];

  for (const c of cases) {
    it(`${c.file}: notes per voice, first notes, byte-exact carriers`, () => {
      const { bytes, song } = load(c.file);
      expect(song.gridUnmatchedReason).toBeUndefined();
      const layout = layoutOf(song);
      expect(layout).toBeDefined();

      expect([0, 1, 2, 3].map((v) => voiceNotes(song, v).length)).toEqual(c.counts);
      for (const [v, notes] of Object.entries(c.first)) {
        expect(voiceNotes(song, Number(v)).slice(0, notes.length)).toEqual(notes);
      }

      // every stream's carrier cells re-concatenate to the original bytes at its address
      const blockRows = layout.blockRows ?? [];
      expect(blockRows.length).toBe(layout.numFilePatterns);
      for (let fp = 0; fp < layout.numFilePatterns; fp++) {
        const enc = layout.encoder.encodePattern(blockRows[fp], 0);
        const at = layout.filePatternAddrs[fp];
        expect(enc.length).toBe(layout.filePatternSizes[fp]);
        expect(Array.from(enc)).toEqual(Array.from(bytes.subarray(at, at + enc.length)));
      }
      // the 64-row slicing covers the timeline
      const rpp = layout.rowsPerPattern as number[];
      expect(rpp.every((n) => n > 0 && n <= 64)).toBe(true);
    });
  }
});
