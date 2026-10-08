/**
 * G24 / Ben Daglish: a note edit is heard WHILE the song plays, without a restart (the real worklet and WASM, the store's own
 * route; see helpers/liveSwapCheck.ts). Before the edit the audio is the song's; after it, the edited module's from the start
 * sample for sample; and it differs from the unedited song.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { installWasmNodeFetches } from '@/lib/import/__tests__/helpers/dwNodeFetch';
import { walkBenDaglish, BD_WALK } from '@/lib/import/formats/BenDaglishWasmExtractor';
import { measureLiveSwap, type LiveSwapSpec } from './helpers/liveSwapCheck';
import { sameAudio } from './helpers/workletHarness';

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
vi.mock('@/engine/bd/BdEngine', () => ({
  BdEngine: {
    hasInstance: () => !!(globalThis as { __liveEngine?: unknown }).__liveEngine,
    getInstance: () => (globalThis as { __liveEngine?: unknown }).__liveEngine,
  },
}));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));

const FILE = 'public/data/songs/ben-daglish/motorhead-titleandingame.bd';
const spec: LiveSwapSpec = {
  file: FILE,
  worklet: { dir: 'bd', name: 'Bd', factory: 'createBd' },
  start: (module) => [{ type: 'loadModule', moduleData: module, subsong: 0 }],
  swapMessage: (module, args) => ({ type: 'swapModule', moduleData: module, subsong: args[0] ?? 0 }),
  pre: 300,
  post: 700,
};

let restore = () => {};
beforeAll(() => { restore = installWasmNodeFetches([['bd', 'Bd']]); });
afterAll(() => restore());

describe('Ben Daglish: an edit is heard while the song plays', { timeout: 240000 }, () => {
  it('a note changed in place: the song plays on from where it was, as the edited module', async () => {
    const f = readFileSync(resolve(process.cwd(), FILE));
    const walk = await walkBenDaglish(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer, 0);
    // A command nothing plays before the edit (a track is shared by voices and passes; G17): its first run is after the edit.
    const firstRun = (e: { track: number; pos: number }) => Math.min(...walk.events.filter((x) => x.track === e.track && x.pos === e.pos && x.kind === BD_WALK.note).map((x) => x.tick));
    const target = walk.events.find((e) => e.kind === BD_WALK.note && e.a >= 0 && e.track >= 0 && e.tick >= 70 && e.tick < 200 && firstRun(e) === e.tick)!;
    expect(target, 'a note a little after the first second').toBeTruthy();
    const p = Math.floor(target.tick / 64), row = target.tick % 64;
    const { useTrackerStore } = await import('@/stores/useTrackerStore');
    const r = await measureLiveSwap(spec, { p, ch: target.voice, row }, () => {
      const cur = useTrackerStore.getState().patterns[p].channels[target.voice].rows[row].note;
      useTrackerStore.getState().setCell(target.voice, row, { note: cur + (cur > 60 ? -2 : 2) });
    });
    if (process.env.LS_DEBUG) console.log('[ls] before==plain', sameAudio(r.before, r.plainAll.slice(0, spec.pre)), 'before==oracle', sameAudio(r.before, r.oracleAll.slice(0, spec.pre)), 'plain==oracle(pre)', sameAudio(r.plainAll.slice(0, spec.pre), r.oracleAll.slice(0, spec.pre)), 'target', target.tick, target.track, target.pos);
    expect(r.routeIs).toBe('engine-swap');
    expect(r.swapped, 'the worklet swapped the module (sentinel)').toBe(true);
    expect(sameAudio(r.before, r.oracleAll.slice(0, spec.pre)), 'before the edit it is the song').toBe(true);
    expect(sameAudio(r.after, r.oracleAll.slice(spec.pre)), 'after the edit it is the edited module at the same position').toBe(true);
    expect(sameAudio(r.after, r.plainAll.slice(spec.pre)), 'and the edit is heard').toBe(false);
  });
});
