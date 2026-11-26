/**
 * A grid edit on a T0AST song is heard from its row on while the song plays, both a changed note
 * and a note put on an empty row; the empty-row note also comes back from the exported file.
 *
 * Drives the store's route (sendCellEditsToEngine -> 't0ast-module' -> C++ t0ast_encode_cell ->
 * T0astEngine.poke) into the real worklet and WASM mid-play. Three players of the same song:
 * untouched, edited while playing, edited before play. The live one equals the pre-edited one sample
 * for sample, and equals the untouched one until the edited row plays, then differs.
 * Real songs in test-data/t0ast (Modland, git-ignored); cases skip without them.
 */
import { describe, it, expect, vi } from 'vitest';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { startWorklet, songBuffer, stereoOutputs, ROOT } from './workletHarness';
import { T0astEngine } from '@engine/t0ast/T0astEngine';
import type { T0astEditModule } from '@engine/t0ast/t0astEditWasm';
import { parseT0astFile } from '@lib/import/formats/T0astParser';
import { buildT0astFile } from '@lib/export/T0astExporter';
import { liveEditRoute, sendCellEditsToEngine } from '@engine/replayer/liveCellEdits';
import type { TrackerSong } from '@engine/TrackerReplayer';

// The browser build loads the edit wasm from BASE_URL; here its fetch is answered from public/t0ast.
const create = async (): Promise<T0astEditModule> => {
  vi.stubGlobal('fetch', async (url: string) => {
    if (/t0ast\/T0astEdit\.wasm$/.test(String(url))) return new Response(readFileSync(join(ROOT, 'public/t0ast/T0astEdit.wasm')), { status: 200, headers: { 'Content-Type': 'application/wasm' } });
    throw new Error(`unexpected fetch in test: ${url}`);
  });
  return (await import('../../../public/t0ast/T0astEdit.js')).default({ locateFile: (f: string) => join(ROOT, 'public/t0ast', f) });
};
vi.mock('@engine/t0ast/t0astEditWasm', async (orig) => ({
  ...(await orig<typeof import('@engine/t0ast/t0astEditWasm')>()),
  t0astEditModule: () => create(),
}));

const SONG = 'test-data/t0ast/BeRo - popcorn.t0ast';
const have = existsSync(join(ROOT, SONG));
type T0Proc = { _t0ast_position(): number };
type At = { row: number; ch: number; note: number };
// Order 1: popcorn's order 0 breaks to order 1 after its first rows (engine position 0 -> 64 within 200 chunks).
const ORD = 1;

/** First cell from row 8 of order ORD on: a note (`empty` false) or an empty cell on a channel that plays notes. */
function pick(song: TrackerSong, empty: boolean): At | null {
  const p = song.songPositions[ORD];
  const chans = song.patterns[p].channels;
  for (let c = 0; c < song.numChannels; c++) {
    const notes = chans[c].rows.map((r) => r.note).filter((n) => n > 0 && n < 97);
    if (notes.length === 0) continue;
    for (let r = 8; r < chans[c].rows.length; r++) {
      const cell = chans[c].rows[r];
      if (!empty && cell.note > 0 && cell.note < 97) return { row: r, ch: c, note: cell.note > 84 ? cell.note - 12 : cell.note + 12 };
      if (empty && cell.note === 0 && cell.instrument === 0 && cell.volume === 0 && cell.effTyp === 0 && cell.effTyp2 === 0) return { row: r, ch: c, note: notes[0] };
    }
  }
  return null;
}

async function heard(song: TrackerSong, at: At): Promise<void> {
  const p = song.songPositions[ORD];
  const edit = { pattern: p, row: at.row, channel: at.ch, cell: { ...song.patterns[p].channels[at.ch].rows[at.row], note: at.note } };
  const players = await Promise.all([0, 1, 2].map(async () => {
    const w = await startWorklet('t0ast', 'T0ast');
    await w.send({ type: 'loadModule', moduleData: songBuffer(SONG) });
    return w;
  }));
  // The store's engine, posting into a given worklet.
  const editVia = async (w: (typeof players)[number]) => {
    const engine = Object.create(T0astEngine.prototype) as T0astEngine;
    (engine as unknown as { workletNode: { port: { postMessage(m: unknown): void } } }).workletNode = { port: { postMessage: (m) => { void w.send(m); } } };
    vi.spyOn(T0astEngine, 'hasInstance').mockReturnValue(true);
    vi.spyOn(T0astEngine, 'getInstance').mockReturnValue(engine);
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
    const pos = (w.proc.module as T0Proc)._t0ast_position();
    if (i === 0 && rowChunk < 0 && pos >> 6 === ORD && (pos & 63) === at.row) rowChunk = chunk;
  });
  let chunk = 0;
  render(chunk++); // playing before the edit
  await editVia(players[1]); // edited while playing
  for (; chunk < 48000 * 20 / frames && (rowChunk < 0 || chunk < rowChunk + 2000); chunk++) render(chunk);

  expect(rowChunk, `order ${ORD} row ${at.row} reached`).toBeGreaterThan(1);
  const firstDiff = (a: number[], b: number[]) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return i; return -1; };
  expect(firstDiff(audio[1], audio[2]), 'live edit = edit before play').toBe(-1);
  const d = firstDiff(audio[0], audio[1]);
  expect(d, 'the edit is heard').toBeGreaterThan(-1);
  // Same audio until the chunk the row starts in, changed after (sample index / 2 channels / frames).
  expect(Math.floor(d / 2 / frames), `row ${at.row} channel ${at.ch}`).toBeGreaterThanOrEqual(rowChunk);
}

const load = async () => {
  const song = (await parseT0astFile(new Uint8Array(songBuffer(SONG)), 'popcorn.t0ast', create))!;
  expect(liveEditRoute(song).route).toBe('t0ast-module');
  return song;
};

describe('T0AST live edit', () => {
  it.skipIf(!have)('plays an edited note from its row on while the song plays', async () => {
    const song = await load();
    const at = pick(song, false);
    expect(at).not.toBeNull();
    await heard(song, at!);
  }, 120_000);

  it.skipIf(!have)('plays a note put on an empty row, and the export carries it', async () => {
    const song = await load();
    const at = pick(song, true);
    expect(at).not.toBeNull();
    await heard(song, at!);

    const p = song.songPositions[ORD];
    song.patterns[p].channels[at!.ch].rows[at!.row] = { ...song.patterns[p].channels[at!.ch].rows[at!.row], note: at!.note };
    const back = (await parseT0astFile(await buildT0astFile(song, create), 'popcorn.t0ast', create))!;
    expect(back.patterns[p].channels[at!.ch].rows[at!.row].note).toBe(at!.note);
  }, 120_000);
});
