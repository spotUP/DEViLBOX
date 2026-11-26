/**
 * A grid edit on a GoatTracker song is heard from its row on while the song plays.
 *
 * GoatTracker plays through the GTUltra worklet (loadSng), not importTrackerModule, so liveEditHeard
 * cannot measure it. The GT views edit through GTUltraEngine.setPatternCell -> worklet 'setPatternCell'
 * -> C++ gt_set_pattern_cell. Three players of the same song: untouched, edited while playing, edited
 * before play. The live one equals the pre-edited one sample for sample, and differs from the untouched
 * one only after the edit is made.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer, stereoOutputs } from './workletHarness';
import { GTUltraEngine } from '@engine/gtultra/GTUltraEngine';
import { preprocessEmscriptenJS } from '@engine/mame/mame-wasm-loader';

const SONG = 'public/data/songs/goat-tracker-ultra/Linus/$3Space_Beer.sng';
const REST = 0xbd;
const isNote = (n: number) => n >= 0x60 && n <= 0xbc;

type GtProc = {
  module: { HEAPU8: Uint8Array };
  _getOrderPtr(song: number, ch: number): number;
  _getPatternPtr(p: number): number;
  _getPatternLength(p: number): number;
  _getCurrentRow(): number;
};
type Player = Awaited<ReturnType<typeof startWorklet>>;

const start = async (): Promise<Player> => {
  const w = await startWorklet('gtultra', 'GTUltra', (c) => preprocessEmscriptenJS(c, '/gtultra/'));
  await w.send({ type: 'loadSng', data: songBuffer(SONG) });
  expect(w.posted.find((m) => m.type === 'songLoaded') as unknown as { ok: boolean }).toMatchObject({ ok: true });
  return w;
};

/** The store-side engine, posting into a given worklet. */
const engineFor = (w: Player): GTUltraEngine => {
  const engine = Object.create(GTUltraEngine.prototype) as GTUltraEngine;
  (engine as unknown as { workletNode: { port: { postMessage(m: unknown): void } } }).workletNode = { port: { postMessage: (m) => { void w.send(m); } } };
  return engine;
};

/** Channel 0's first pattern in song 0's order list, and its rows as [note, instr, cmd, data]. */
const firstPattern = (w: Player) => {
  const p = w.proc as unknown as GtProc;
  const order = p._getOrderPtr(0, 0);
  let pat = -1;
  for (let i = 0; i < 256 && pat < 0; i++) { const e = p.module.HEAPU8[order + i]; if (e === 0xff) break; if (e < 0xd0) pat = e; }
  const ptr = p._getPatternPtr(pat);
  const rows = Array.from({ length: p._getPatternLength(pat) }, (_, r) => Array.from(p.module.HEAPU8.slice(ptr + r * 4, ptr + r * 4 + 4)));
  return { pat, rows };
};

type Edit = { row: number; cells: [col: number, value: number][] };

async function liveVsPre(pick: (rows: number[][]) => Edit | null) {
  const players = await Promise.all([0, 1, 2].map(start));
  const { pat, rows } = firstPattern(players[0]);
  expect(pat, 'channel 0 pattern').toBeGreaterThanOrEqual(0);
  const edit = pick(rows);
  expect(edit, `edit cell in pattern ${pat}`).not.toBeNull();
  const { row, cells } = edit!;
  const apply = (w: Player) => { for (const [col, v] of cells) engineFor(w).setPatternCell(pat, row, col, v); };

  apply(players[2]); // edited before play
  for (const w of players) await w.send({ type: 'play' });
  await new Promise((res) => setTimeout(res, 0));

  const frames = 128;
  const outs = stereoOutputs(3, frames);
  const audio: number[][] = [[], [], []];
  let rowChunk = -1;
  const render = (chunk: number) => players.forEach((w, i) => {
    w.proc.process([], [outs[i]]);
    for (let f = 0; f < frames; f++) audio[i].push(outs[i][0][f], outs[i][1][f]);
    if (i === 0 && rowChunk < 0 && (w.proc as unknown as GtProc)._getCurrentRow() > row) rowChunk = chunk;
  });
  let chunk = 0;
  render(chunk++); // playing before the edit
  apply(players[1]); // edited while playing
  await new Promise((res) => setTimeout(res, 0));
  for (; chunk < 48000 * 20 / frames && (rowChunk < 0 || chunk < rowChunk + 2000); chunk++) render(chunk);

  const firstDiff = (a: number[], b: number[]) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return i; return -1; };
  const live = firstDiff(audio[1], audio[2]);
  const d = firstDiff(audio[0], audio[1]);
  const diffChunk = d < 0 ? -1 : Math.floor(d / 2 / frames);
  console.log(`[goatLiveEdit] pat=${pat} row=${row} cells=${JSON.stringify(cells)} rowChunk=${rowChunk} liveVsPre=${live} diffChunk=${diffChunk}`);
  expect(rowChunk, `pattern ${pat} row ${row} reached`).toBeGreaterThan(1);
  expect(live, 'live edit = edit before play').toBe(-1);
  expect(d, 'the edit is heard').toBeGreaterThan(-1);
  expect(diffChunk, 'nothing changes before the edit is made').toBeGreaterThanOrEqual(1);
}

describe('GoatTracker live edit', () => {
  it('plays an edited note from its row on while the song plays', async () => {
    await liveVsPre((rows) => {
      for (let r = 8; r < rows.length; r++) if (isNote(rows[r][0]) && rows[r][0] + 12 <= 0xbc) return { row: r, cells: [[0, rows[r][0] + 12]] };
      return null;
    });
  }, 120_000);

  it('plays a note added on an empty row while the song plays', async () => {
    await liveVsPre((rows) => {
      const src = rows.find((c) => isNote(c[0]) && c[1] > 0);
      if (!src) return null;
      for (let r = 8; r < rows.length; r++) if (rows[r][0] === REST && rows[r][1] === 0 && rows[r][2] === 0) return { row: r, cells: [[0, src[0] + (src[0] + 7 <= 0xbc ? 7 : -7)], [1, src[1]]] };
      return null;
    });
  }, 120_000);
});
