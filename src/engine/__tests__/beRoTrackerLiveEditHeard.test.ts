/**
 * A grid edit on a BeRoTracker song is heard from its row on while the song plays.
 *
 * Drives the store's route (sendCellEditsToEngine -> 'berotracker-module' -> C++ brt_encode_cell ->
 * BeRoTrackerEngine.poke) into the real worklet and WASM mid-play. Three players of the same song:
 * untouched, edited while playing, edited before play. The live one equals the pre-edited one sample
 * for sample, and equals the untouched one until the edited row plays, then differs.
 */
import { describe, it, expect, vi } from 'vitest';
import { join } from 'path';
import { readFileSync } from 'fs';
import { startWorklet, songBuffer, stereoOutputs, ROOT } from './workletHarness';
import { BeRoTrackerEngine } from '@engine/berotracker/BeRoTrackerEngine';
import type { BeRoTrackerEditModule } from '@engine/berotracker/beRoTrackerEditWasm';
import { parseBeRoTrackerFile } from '@lib/import/formats/BeRoTrackerParser';
import { liveEditRoute, sendCellEditsToEngine } from '@engine/replayer/liveCellEdits';

// The browser build loads the edit wasm from BASE_URL; here its fetch is answered from public/berotracker.
const create = async (): Promise<BeRoTrackerEditModule> => {
  vi.stubGlobal('fetch', async (url: string) => {
    if (/berotracker\/BeRoTrackerEdit\.wasm$/.test(String(url))) return new Response(readFileSync(join(ROOT, 'public/berotracker/BeRoTrackerEdit.wasm')), { status: 200, headers: { 'Content-Type': 'application/wasm' } });
    throw new Error(`unexpected fetch in test: ${url}`);
  });
  return (await import('../../../public/berotracker/BeRoTrackerEdit.js')).default({ locateFile: (f: string) => join(ROOT, 'public/berotracker', f) });
};
vi.mock('@engine/berotracker/beRoTrackerEditWasm', async (orig) => ({
  ...(await orig<typeof import('@engine/berotracker/beRoTrackerEditWasm')>()),
  beRoTrackerEditModule: () => create(),
}));

const SONG = 'public/data/songs/berotracker/wonderful-dream-landscapes.brt';
type BrtProc = { _brt_position(): number };

describe('BeRoTracker live edit', () => {
  it('plays an edited note from its row on while the song plays', async () => {
    const song = (await parseBeRoTrackerFile(new Uint8Array(songBuffer(SONG)), 'wonderful-dream-landscapes.brt', create))!;
    expect(liveEditRoute(song).route).toBe('berotracker-module');

    // The first note cell from row 8 of the first order on, raised an octave.
    const p = song.songPositions[0];
    let at: { row: number; ch: number } | null = null;
    for (let r = 8; r < song.patterns[p].length && !at; r++) for (let c = 0; c < song.numChannels && !at; c++) {
      const n = song.patterns[p].channels[c].rows[r].note;
      if (n > 0 && n < 85) at = { row: r, ch: c };
    }
    expect(at).not.toBeNull();
    const { row, ch } = at!;
    const edit = { pattern: p, row, channel: ch, cell: { ...song.patterns[p].channels[ch].rows[row], note: song.patterns[p].channels[ch].rows[row].note + 12 } };

    const players = await Promise.all([0, 1, 2].map(async () => {
      const w = await startWorklet('berotracker', 'BeRoTracker');
      await w.send({ type: 'loadModule', moduleData: songBuffer(SONG) });
      return w;
    }));
    // The store's engine, posting into a given worklet.
    const editVia = async (w: (typeof players)[number]) => {
      const engine = Object.create(BeRoTrackerEngine.prototype) as BeRoTrackerEngine;
      (engine as unknown as { workletNode: { port: { postMessage(m: unknown): void } } }).workletNode = { port: { postMessage: (m) => { void w.send(m); } } };
      vi.spyOn(BeRoTrackerEngine, 'hasInstance').mockReturnValue(true);
      vi.spyOn(BeRoTrackerEngine, 'getInstance').mockReturnValue(engine);
      await sendCellEditsToEngine(song, [edit]);
      await new Promise((res) => setTimeout(res, 0));
      vi.restoreAllMocks();
    };
    await editVia(players[2]); // edited before play
    for (const w of players) await w.send({ type: 'play' });

    const frames = 128;
    const outs = stereoOutputs(3, frames);
    const audio: number[][] = [[], [], []];
    let rowChunk = -1;
    const render = (chunk: number) => players.forEach((w, i) => {
      w.proc.process([], [outs[i]]);
      for (let f = 0; f < frames; f++) audio[i].push(outs[i][0][f], outs[i][1][f]);
      const pos = (w.proc.module as BrtProc)._brt_position();
      if (i === 0 && rowChunk < 0 && pos >>> 16 === 0 && (pos & 0xffff) === row) rowChunk = chunk;
    });
    let chunk = 0;
    render(chunk++); // playing before the edit
    await editVia(players[1]); // edited while playing
    for (; chunk < 48000 * 20 / frames && (rowChunk < 0 || chunk < rowChunk + 2000); chunk++) render(chunk);

    expect(rowChunk, `order 0 row ${row} reached`).toBeGreaterThan(1);
    const firstDiff = (a: number[], b: number[]) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return i; return -1; };
    expect(firstDiff(audio[1], audio[2]), 'live edit = edit before play').toBe(-1);
    const d = firstDiff(audio[0], audio[1]);
    expect(d, 'the edit is heard').toBeGreaterThan(-1);
    // Same audio until the chunk the row starts in, changed after (sample index / 2 channels / frames).
    expect(Math.floor(d / 2 / frames), `row ${row} channel ${ch}`).toBeGreaterThanOrEqual(rowChunk);
  }, 120_000);
});
