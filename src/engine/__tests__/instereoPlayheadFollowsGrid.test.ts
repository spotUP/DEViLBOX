/**
 * InStereo! 1.0 and 2.0: the pattern editor's playhead is the replayer's own
 * song position and row, so it is on the row whose note is sounding.
 *
 * The WASM replayers had a position getter (is1/is2_get_position) that reads
 * the edit table, not the player, and the engines reported no playhead: the
 * grid followed the TypeScript scheduler while the audio free-ran. The
 * replayers now export the live position (get_play_pattern / get_play_row,
 * the grid's pattern index and row) and the worklet posts it when it moves.
 *
 * Oracle: the voices' own output. A voice that starts a note out of silence
 * (energy jumps) does so on a row whose grid cell holds a note; with the
 * playhead one row off, onsets land on empty rows.
 */
import { describe, it, expect } from 'vitest';
import { loadSharedWorkletScripts, startWorklet, songBuffer, stereoOutputs } from './workletHarness';
import { instereo1Transform } from '@/engine/instereo1/InStereo1Engine';
import { instereo2Transform } from '@/engine/instereo2/InStereo2Engine';
import { parseInStereo1File } from '@/lib/import/formats/InStereo1Parser';
import { parseInStereo2File } from '@/lib/import/formats/InStereo2Parser';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const XM_KEY_OFF = 97;

interface Case {
  name: string;
  dir: string;
  stem: string;
  transform: (code: string) => string;
  file: string;
  parse: (bytes: Uint8Array, filename: string) => TrackerSong | null;
}

const CASES: Case[] = [
  { name: 'InStereo1 fantasi8.is', dir: 'instereo1', stem: 'InStereo1', transform: instereo1Transform, file: 'public/data/songs/formats/fantasi8.is', parse: parseInStereo1File },
  { name: 'InStereo2 stereo_feeling.is20', dir: 'instereo2', stem: 'InStereo2', transform: instereo2Transform, file: 'public/data/songs/formats/stereo_feeling.is20', parse: parseInStereo2File },
];

describe('InStereo playhead follows the grid row', () => {
  it.each(CASES)('$name: every note onset is on a grid row that holds a note', async ({ dir, stem, transform, file, parse }) => {
    loadSharedWorkletScripts();
    const buf = songBuffer(file);
    const song = parse(new Uint8Array(buf.slice(0)), file)!;
    expect(song.patterns.length).toBeGreaterThan(2);

    const { proc, send, posted } = await startWorklet(dir, stem, transform);
    await send({ type: 'loadModule', moduleData: buf.slice(0) });
    await send({ type: 'play' });
    const outs = stereoOutputs(5);

    let read = 0;
    let head = { songPos: -1, row: -1 };
    const prev = [0, 0, 0, 0];
    const wrong: string[] = [];
    let onsets = 0;
    let maxPattern = 0;
    for (let block = 0; block < 12000; block++) {
      proc.process([], outs);
      for (; read < posted.length; read++) {
        const p = posted[read] as { type?: string; songPos?: number; row?: number };
        if (p.type === 'position') head = { songPos: p.songPos!, row: p.row! };
      }
      maxPattern = Math.max(maxPattern, head.songPos);
      const chBufs = (proc as unknown as { chBufs: Float32Array[] }).chBufs;
      for (let ch = 0; ch < 4; ch++) {
        let e = 0;
        for (let k = 0; k < 128; k++) e += Math.abs(chBufs[ch][k]);
        e /= 128;
        if (e > 0.01 && e > 3 * prev[ch]) {
          onsets++;
          const cell = song.patterns[head.songPos]?.channels[ch].rows[head.row];
          if (!cell || cell.note <= 0 || cell.note >= XM_KEY_OFF) {
            if (wrong.length < 5) wrong.push(`block ${block} voice ${ch}: onset while the playhead is on pattern ${head.songPos} row ${head.row}, whose cell has note ${cell?.note}`);
          }
        }
        prev[ch] = e;
      }
    }
    expect(onsets, 'the voices start notes').toBeGreaterThan(20);
    expect(maxPattern, 'the playhead crosses pattern boundaries').toBeGreaterThan(1);
    expect(wrong).toEqual([]);
  }, 60000);
});
