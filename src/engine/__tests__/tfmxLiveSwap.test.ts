/**
 * G24 / TFMX: a note edit is heard WHILE the song plays, without a restart (the real worklet and WASM, the store's own route; see
 * helpers/liveSwapCheck.ts). The TFMX worklet reloads the edited module and seeks it to the time already played (milliseconds), so
 * the audio after the edit follows the edited module's from the start by loudness envelope (the seek is not sample-exact), the
 * audio before it is the song's, and it differs from the unedited song.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertLiveSwap, importSong, type LiveSwapSpec, type LiveCell } from './helpers/liveSwapCheck';

vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })) }));
vi.mock('@engine/TrackerReplayer', async (orig) => {
  const replayer: object = new Proxy({}, { get: (_t, k) => (k === 'getSong' ? () => (globalThis as { __liveSong?: () => unknown }).__liveSong?.() ?? null : () => undefined) });
  return { ...(await orig<object>()), getTrackerReplayer: () => replayer, peekTrackerReplayer: () => replayer };
});
vi.mock('@/engine/tfmx/TFMXEngine', () => ({
  TFMXEngine: {
    hasInstance: () => !!(globalThis as { __liveEngine?: unknown }).__liveEngine,
    getInstance: () => (globalThis as { __liveEngine?: unknown }).__liveEngine,
  },
}));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));

const smpl = (): ArrayBuffer => { const f = readFileSync(resolve(process.cwd(), 'public/data/songs/tfmx/smpl.hbtitle')); return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer; };

/** The left channel of rendered blocks as one run of frames. */
const flat = (blocks: Float32Array[]): Float32Array => {
  const out = new Float32Array(blocks.length * 128);
  blocks.forEach((b, i) => out.set(b.subarray(0, 128), i * 128));
  return out;
};
/** Short-time RMS of a run of frames, windows of 441 frames (10 ms). */
const envelope = (x: Float32Array): number[] => {
  const out: number[] = [];
  for (let i = 0; i + 441 <= x.length; i += 441) { let s = 0; for (let k = 0; k < 441; k++) s += x[i + k] * x[i + k]; out.push(Math.sqrt(s / 441)); }
  return out;
};
const correlation = (a: number[], b: number[]): number => {
  const n = Math.min(a.length, b.length);
  const ma = a.slice(0, n).reduce((x, y) => x + y, 0) / n, mb = b.slice(0, n).reduce((x, y) => x + y, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
};
/**
 * The TFMX worklet seeks the reloaded module to the time already played in whole milliseconds and the decoder's seek is not
 * sample-exact (measured: no shift of the oracle matches a single frame exactly), so "the same position" is the loudness
 * envelope: over the 10 ms windows of the tail it follows the edited module's played from the start (correlation >= 0.9 at a shift within 50 ms).
 */
const followsOracleEnvelope = (after: Float32Array[], oracleTail: Float32Array[]): boolean => {
  const a = envelope(flat(after)), o = envelope(flat(oracleTail));
  if (process.env.LS_DEBUG) {
    const res: string[] = [];
    for (const d of [-300, -100, -30, -10, -3, -1, 0, 1, 3, 10, 30, 100, 300]) res.push(`${d}:${correlation(a.slice(Math.max(0, -d)), o.slice(Math.max(0, d))).toFixed(2)}`);
    console.log('[ls] envelope correlation by shift (10 ms windows)', res.join(' '), 'peak a', Math.max(...a), 'o', Math.max(...o));
  }
  // The reload lands a little off the played time (measured: 30 ms, a jiffy and a half); more than 50 ms off is a lost position.
  let best = 0;
  for (let d = -5; d <= 5; d++) best = Math.max(best, correlation(a.slice(Math.max(0, -d)), o.slice(Math.max(0, d))));
  return a.some((v) => v > 0.001) && best >= 0.9;
};

const spec: LiveSwapSpec = {
  file: 'public/data/songs/tfmx/mdat.hbtitle',
  worklet: { dir: 'tfmx', name: 'TFMX', factory: 'createTFMX' },
  start: (module) => [{ type: 'loadModule', mdatBuffer: module, smplBuffer: smpl(), subsong: 0 }, { type: 'modulePlay' }],
  swapMessage: (module) => ({ type: 'reloadModule', mdatBuffer: module, smplBuffer: smpl(), subsong: 0 }),
  pre: 400,
  post: 700,
  sameTail: followsOracleEnvelope,
};

describe('TFMX: an edit is heard while the song plays', { timeout: 300000 }, () => {
  it('a note changed in place: the song plays on from where it was, as the edited module', async () => {
    await importSong(spec.file);
    const { useTrackerStore } = await import('@/stores/useTrackerStore');
    const cells: LiveCell[] = [];
    useTrackerStore.getState().patterns.slice(0, 4).forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, row) => { if (row >= 4 && cell.note > 0 && cell.note < 97) cells.push({ p, ch, row }); })));
    cells.sort((a, b) => a.p - b.p || a.row - b.row);
    expect(cells.length, 'the first patterns have notes to edit').toBeGreaterThan(0);
    await assertLiveSwap(expect as never, spec, cells.slice(0, 10), (cell) => {
      const cur = useTrackerStore.getState().patterns[cell.p].channels[cell.ch].rows[cell.row].note;
      useTrackerStore.getState().setCell(cell.ch, cell.row, { note: cur + (cur > 60 ? -2 : 2) });
    });
  });
});
