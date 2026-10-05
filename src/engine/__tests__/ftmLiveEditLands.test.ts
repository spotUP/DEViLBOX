/**
 * A grid edit on a Face The Music song lands in the FTM replayer on the row
 * it was typed on, and every other event keeps its row.
 *
 * The worklet passed ftm_set_cell its arguments in the wrong order, and
 * ftm_set_cell addressed a track's line list (spacing lines included), not a
 * row: an edit landed on some other event, and a note typed on an empty row
 * had no line to go to. ftm_set_cell now takes the song row and re-spaces the
 * track; FaceTheMusicEngine converts the grid cell through ftmCellFields, the
 * mapping the file encoder uses.
 *
 * Drives FaceTheMusicEngine.setCell -> the real worklet and WASM and reads
 * the track back with ftm_get_cell. The grid FaceTheMusicParser builds must
 * put every note on the row the replayer plays it.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer } from './workletHarness';
import { FaceTheMusicEngine } from '@engine/facethemusic/FaceTheMusicEngine';
import { ftmCellFields } from '@engine/uade/encoders/FaceTheMusicEncoder';
import { parseFaceTheMusicFile } from '@lib/import/formats/FaceTheMusicParser';

type FtmModule = {
  _malloc(n: number): number;
  _free(p: number): void;
  _ftm_get_cell(h: number, ch: number, row: number, note: number, effect: number, arg: number): void;
  HEAPU8: Uint8Array;
};

const SONG = 'public/data/songs/face-the-music/rock.ftm';

describe('Face The Music live edit', () => {
  it('writes the typed cell on its row and keeps every other event in place', async () => {
    const { proc, send } = await startWorklet('facethemusic', 'FaceTheMusic');
    await send({ type: 'loadModule', moduleData: songBuffer(SONG) });
    const mod = proc.module as FtmModule;
    const handle = proc.handle as number;
    const p = mod._malloc(8);
    const cellAt = (ch: number, row: number) => {
      mod._ftm_get_cell(handle, ch, row, p, p + 1, p + 2);
      const h = mod.HEAPU8;
      return { note: h[p], effect: h[p + 1], arg: h[p + 2] | (h[p + 3] << 8) };
    };

    const song = parseFaceTheMusicFile(new Uint8Array(songBuffer(SONG)), 'rock.ftm')!;
    const rpm = song.patterns[0].length;
    const totalRows = song.patterns.length * rpm;
    const notesOf = (ch: number) => Array.from({ length: totalRows }, (_, r) => cellAt(ch, r).note);

    // The grid and the replayer agree on where every note is.
    for (let ch = 0; ch < 8; ch++) {
      const grid = song.patterns.flatMap((pat) => pat.channels[ch].rows.map((c) => ftmCellFields(c).note));
      expect(notesOf(ch), `channel ${ch}`).toEqual(grid);
    }

    const engine = Object.create(FaceTheMusicEngine.prototype) as FaceTheMusicEngine;
    (engine as unknown as { workletNode: { port: { postMessage(m: unknown): void } } }).workletNode = { port: { postMessage: (m) => { void send(m); } } };

    // An empty row between two events of channel 2.
    const ch = 2;
    const before = notesOf(ch);
    const events = before.map((n, r) => (n ? r : -1)).filter((r) => r >= 0);
    const target = events.findIndex((r, i) => i > 0 && r - events[i - 1] > 2);
    const row = events[target] - 1;
    expect(before[row]).toBe(0);

    // C-5 in the grid (48 + FTM note 13), instrument 3.
    engine.setCell(Math.floor(row / rpm), row % rpm, ch, 61, 3, 0, 0);
    await new Promise((res) => setTimeout(res, 0));
    expect(cellAt(ch, row)).toEqual({ note: 13, effect: 0, arg: 3 });
    const after = notesOf(ch);
    expect(after.filter((_, r) => r !== row)).toEqual(before.filter((_, r) => r !== row));

    // Clearing it gives the original track back.
    engine.setCell(Math.floor(row / rpm), row % rpm, ch, 0, 0, 0, 0);
    await new Promise((res) => setTimeout(res, 0));
    expect(notesOf(ch)).toEqual(before);
    mod._free(p);
  });
});
