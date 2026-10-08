/**
 * G24 / David Whittaker: an edit is heard WHILE the song plays, without a restart.
 *
 * The REAL worklet (public/davidwhittaker/DavidWhittaker.worklet.js, its real WASM) plays the song; a keystroke's store action
 * (setCell) reaches the engine through sendCellEditsToEngine's own route ('engine-swap': the edited module, swapModule). Then:
 *   - the audio before the edit is the unedited song's, block for block (the song kept playing);
 *   - the audio after it is the audio of the edited module played from the start, sample for sample (it is at the same
 *     position: no restart, no jump);
 *   - it differs from the unedited song's (the edit is heard).
 * Two edits: a note changed in place, and a note put on a blank row (the track is split, grown and repointed).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';
import { walkDavidWhittaker, DW_WALK } from '@/lib/import/formats/DavidWhittakerWasmExtractor';
import { openWorklet, sameAudio, type WorkletHarness } from './helpers/workletHarness';

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
// The engine the route finds is the real worklet, behind the engine class's one method (swapModule posts the message).
vi.mock('@/engine/davidwhittaker/DavidWhittakerEngine', () => ({
  DavidWhittakerEngine: {
    hasInstance: () => !!(globalThis as { __dwEngine?: unknown }).__dwEngine,
    getInstance: () => (globalThis as { __dwEngine?: unknown }).__dwEngine,
  },
}));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));

const FILE = 'public/data/songs/david-whittaker/garfield2+.dw';
const PRE = 300;   // blocks played before the edit (0.87 s = 43 ticks)
const POST = 700;  // blocks heard after it
const worklet = { dir: 'davidwhittaker', name: 'DavidWhittaker', factory: 'createDavidWhittaker' };
const settle = () => new Promise((r) => setTimeout(r, 200));

let restoreFetch = () => {};
beforeAll(() => { restoreFetch = installDwNodeFetch(); });
afterAll(() => restoreFetch());

async function play(bytes: ArrayBuffer): Promise<WorkletHarness> {
  const h = await openWorklet(worklet);
  await h.send({ type: 'loadModule', moduleData: bytes.slice(0), subsong: 0 });
  await h.send({ type: 'play' });
  return h;
}

async function loadSong(): Promise<{ bytes: ArrayBuffer }> {
  const f = readFileSync(resolve(process.cwd(), FILE));
  const bytes = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
  const file = new File([bytes.slice(0)], 'garfield2+.dw');
  const { importTrackerModule } = await import('@/lib/song/songBranches');
  await importTrackerModule({
    metadata: { title: 'garfield2+.dw', type: 'MOD', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
    arrayBuffer: await file.arrayBuffer(), file,
  } as never, { useLibopenmpt: true } as never);
  const { liveTrackerSong } = await import('@/lib/song/liveSong');
  (globalThis as { __liveSong?: () => unknown }).__liveSong = () => liveTrackerSong();
  return { bytes };
}

/** One edit through the store and the route, with the song playing; returns what the listener hears. */
async function liveEdit(edit: (ch: number, row: number, note: number) => void, at: { p: number; ch: number; row: number; note: number }) {
  const { bytes } = await loadSong();
  const { useTrackerStore } = await import('@/stores/useTrackerStore');
  const { liveTrackerSong } = await import('@/lib/song/liveSong');
  const { liveEditRoute, sendCellEditsToEngine, playingDescriptor } = await import('@/engine/replayer/liveCellEdits');
  const { editedModuleForPlay } = await import('@/engine/replayer/editedModuleForPlay');
  expect(liveEditRoute(liveTrackerSong()).route, 'the song is edited through the engine-swap route').toBe('engine-swap');

  const live = await play(bytes);
  (globalThis as { __dwEngine?: unknown }).__dwEngine = {
    swapModule: (module: ArrayBuffer, subsong: number) => { void live.send({ type: 'swapModule', moduleData: module, subsong }); },
  };
  const before = live.render(PRE);
  useTrackerStore.getState().setCurrentPattern(at.p);
  edit(at.ch, at.row, at.note);
  await sendCellEditsToEngine(liveTrackerSong(), [{ pattern: at.p, row: at.row, channel: at.ch, cell: useTrackerStore.getState().patterns[at.p].channels[at.ch].rows[at.row] }]);
  await settle();
  const swapped = live.posted.some((m) => m.type === 'moduleSwapped');
  const after = live.render(POST);
  (globalThis as { __dwEngine?: unknown }).__dwEngine = undefined;

  const edited = (await editedModuleForPlay(liveTrackerSong(), playingDescriptor(liveTrackerSong())!))!;
  const oracle = await play((edited instanceof Uint8Array ? edited.slice().buffer : edited) as ArrayBuffer);
  const oracleAll = oracle.render(PRE + POST);
  const plain = await play(bytes);
  const plainAll = plain.render(PRE + POST);
  return { swapped, before, after, oracleAll, plainAll, grew: edited.byteLength > bytes.byteLength };
}

describe('David Whittaker: an edit is heard while the song plays', { timeout: 240000 }, () => {
  it('a note changed in place: the song plays on from where it was, as the edited module', async () => {
    const f = readFileSync(resolve(process.cwd(), FILE));
    const walk = await walkDavidWhittaker(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer);
    const target = walk.events.find((e) => e.kind === DW_WALK.note && e.tick >= 70 && e.tick < 120)!;
    expect(target, 'a note a little after the first second').toBeTruthy();
    const p = Math.floor(target.tick / 64), row = target.tick % 64;
    const { useTrackerStore } = await import('@/stores/useTrackerStore');
    const r = await liveEdit((ch, rw, note) => {
      const cur = useTrackerStore.getState().patterns[p].channels[ch].rows[rw].note;
      useTrackerStore.getState().setCell(ch, rw, { note: cur + (cur > 60 ? -2 : 2) });
      void note;
    }, { p, ch: target.channel, row, note: 0 });
    expect(r.swapped, 'the worklet swapped the module (sentinel)').toBe(true);
    expect(sameAudio(r.before, r.oracleAll.slice(0, PRE)), 'before the edit it is the song').toBe(true);
    expect(sameAudio(r.after, r.oracleAll.slice(PRE)), 'after the edit it is the edited module at the same position').toBe(true);
    expect(sameAudio(r.after, r.plainAll.slice(PRE)), 'and the edit is heard').toBe(false);
  });

  it('a note put on a blank row: the grown module is swapped in the same way', async () => {
    const f = readFileSync(resolve(process.cwd(), FILE));
    const walk = await walkDavidWhittaker(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer);
    const notes = walk.events.filter((e) => e.kind === DW_WALK.note);
    const { useTrackerStore } = await import('@/stores/useTrackerStore');
    let tried = 0;
    for (const e of notes) {
      const next = notes.find((x) => x.channel === e.channel && x.tick > e.tick);
      const tick = e.tick + walk.speed;
      if (e.tick < 60 || !next || tick >= next.tick || tick >= 128) continue;
      if (++tried > 6) break;
      const p = Math.floor(tick / 64), row = tick % 64;
      const r = await liveEdit((ch, rw) => {
        const above = useTrackerStore.getState().patterns[p].channels[ch].rows[e.tick % 64];
        useTrackerStore.getState().setCell(ch, rw, { note: above.note + 2, instrument: above.instrument });
      }, { p, ch: e.channel, row, note: 0 });
      if (!r.grew) continue;
      expect(r.swapped, 'the worklet swapped the module (sentinel)').toBe(true);
      expect(sameAudio(r.before, r.oracleAll.slice(0, PRE)), 'before the edit it is the song').toBe(true);
      expect(sameAudio(r.after, r.oracleAll.slice(PRE)), 'after the edit it is the edited module at the same position').toBe(true);
      expect(sameAudio(r.after, r.plainAll.slice(PRE)), 'and the edit is heard').toBe(false);
      return;
    }
    throw new Error('no blank row of the song took a note');
  });
});
