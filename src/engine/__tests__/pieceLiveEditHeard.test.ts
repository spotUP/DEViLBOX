/**
 * A grid edit on a P/ECE song is heard from its row on while the song plays.
 *
 * Drives the store's route (sendCellEditsToEngine -> 'piece-module' -> C++ piece_edit_cell ->
 * PieceEngine.replaceModule -> worklet 'replace' -> piece_replace) into the real worklet and WASM
 * mid-play. Three players of the same song: untouched, edited while playing, edited before play.
 * The live one equals the pre-edited one sample for sample, and equals the untouched one until
 * the edited row plays, then differs.
 */
import { describe, it, expect, vi } from 'vitest';
import { join } from 'path';
import { readFileSync } from 'fs';
import { startWorklet, songBuffer, stereoOutputs, ROOT } from './workletHarness';
import { PieceEngine } from '@engine/piece/PieceEngine';
import type { CreatePieceEdit } from '@engine/piece/pieceEditWasm';
import { parsePieceFile, PIECE_ROWS } from '@lib/import/formats/PieceParser';
import { liveEditRoute, sendCellEditsToEngine } from '@engine/replayer/liveCellEdits';

// The browser build loads the edit wasm from BASE_URL; here its fetch is answered from public/piece.
const create: CreatePieceEdit = async () => {
  vi.stubGlobal('fetch', async (url: string) => {
    if (/piece\/PieceEdit\.wasm$/.test(String(url))) return new Response(readFileSync(join(ROOT, 'public/piece/PieceEdit.wasm')), { status: 200, headers: { 'Content-Type': 'application/wasm' } });
    throw new Error(`unexpected fetch in test: ${url}`);
  });
  return (await import('../../../public/piece/PieceEdit.js')).default({ locateFile: (f: string) => join(ROOT, 'public/piece', f) });
};
vi.mock('@engine/piece/pieceEditWasm', async (orig) => {
  const real = await orig<typeof import('@engine/piece/pieceEditWasm')>();
  return { ...real, pieceEditModule: () => create(), pieceEditCells: (b: Uint8Array, e: Parameters<typeof real.pieceEditCells>[1]) => real.pieceEditCells(b, e, create) };
});

const SONG = 'public/data/songs/formats/piece-ff-prelude.pmd';
type PieceProc = { _piece_ticks(): number };

describe('P/ECE live edit', () => {
  it('plays an edited note from its row on while the song plays', async () => {
    const song = (await parsePieceFile(new Uint8Array(songBuffer(SONG)), 'piece-ff-prelude.pmd', create))!;
    expect(liveEditRoute(song).route).toBe('piece-module');

    // The first note cell from row 8 of the first pattern on, raised an octave.
    const p = song.songPositions[0];
    let at: { row: number; ch: number } | null = null;
    for (let r = 8; r < song.patterns[p].length && !at; r++) for (let c = 0; c < song.numChannels && !at; c++) {
      const n = song.patterns[p].channels[c].rows[r].note;
      if (n > 0 && n < 85) at = { row: r, ch: c };
    }
    expect(at).not.toBeNull();
    const { row, ch } = at!;
    const edit = { pattern: p, row, channel: ch, cell: { ...song.patterns[p].channels[ch].rows[row], note: song.patterns[p].channels[ch].rows[row].note + 12 } };
    const original = song.pieceFileData!;

    const players = await Promise.all([0, 1, 2].map(async () => {
      const w = await startWorklet('piece', 'Piece');
      await w.send({ type: 'loadModule', moduleData: songBuffer(SONG) });
      return w;
    }));
    // The store's engine, posting into a given worklet; each edit starts from the unedited song.
    const editVia = async (w: (typeof players)[number]) => {
      song.pieceFileData = original;
      const engine = Object.create(PieceEngine.prototype) as PieceEngine;
      (engine as unknown as { workletNode: { port: { postMessage(m: unknown): void } } }).workletNode = { port: { postMessage: (m) => { void w.send(m); } } };
      vi.spyOn(PieceEngine, 'hasInstance').mockReturnValue(true);
      vi.spyOn(PieceEngine, 'getInstance').mockReturnValue(engine);
      await sendCellEditsToEngine(song, [edit]);
      await new Promise((res) => setTimeout(res, 0));
      vi.restoreAllMocks(); // spies only; the fetch stub stays
      expect(song.pieceFileData, 'the edit changed the song').not.toBe(original);
    };
    await editVia(players[2]); // edited before play
    for (const w of players) await w.send({ type: 'play' });

    const frames = 128;
    const rowTick = (p * PIECE_ROWS + row) * song.initialSpeed;
    const outs = stereoOutputs(3, frames);
    const audio: number[][] = [[], [], []];
    let rowChunk = -1;
    const render = (chunk: number) => players.forEach((w, i) => {
      w.proc.process([], [outs[i]]);
      for (let f = 0; f < frames; f++) audio[i].push(outs[i][0][f], outs[i][1][f]);
      if (i === 0 && rowChunk < 0 && (w.proc.module as PieceProc)._piece_ticks() >= rowTick) rowChunk = chunk;
    });
    let chunk = 0;
    render(chunk++); // playing before the edit
    await editVia(players[1]); // edited while playing
    for (; chunk < 48000 * 60 / frames && (rowChunk < 0 || chunk < rowChunk + 2000); chunk++) render(chunk);

    expect(rowChunk, `pattern ${p} row ${row} reached`).toBeGreaterThan(1);
    const firstDiff = (a: number[], b: number[]) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return i; return -1; };
    expect(firstDiff(audio[1], audio[2]), 'live edit = edit before play').toBe(-1);
    const d = firstDiff(audio[0], audio[1]);
    expect(d, 'the edit is heard').toBeGreaterThan(-1);
    // Same audio until about the chunk the row starts in (16 kHz driver frames lag a chunk), changed after.
    expect(Math.floor(d / 2 / frames), `row ${row} part ${ch}`).toBeGreaterThanOrEqual(rowChunk - 1);
  }, 120_000);
});
