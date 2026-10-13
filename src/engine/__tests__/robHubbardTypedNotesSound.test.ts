/**
 * K7 (owner, 2026-10-07): notes typed into the pattern of rob-hubbard/skateordie.rh are silent when the song plays.
 *
 * The path a typed note takes: useTrackerStore.setCell (what a keystroke calls, with the instrument in use) ->
 * the module the next play loads (editedModuleForPlay: native export of the stores, reloaded through the one
 * parse path) and, while playing, the live write into UADE's chip RAM (sendCellEditsToEngine) -> UADE's own
 * Rob Hubbard player -> the Paula stream. Measured on the stream: a note-on on the edited voice at the period
 * the typed note names (ProTracker naming, periodNotes), with the channel volume up. A typed note on a row that
 * already has a note, and on a blank row (the block is split and rebuilt), for each instrument 1..3.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { openUade, PaulaSession, PaulaNoteOns, PAULA_REG, chipRamEngine } from './gridOracle';
import { noteToPeriod } from '@/lib/amiga/periodNotes';
import { pinEditPathEngine } from './helpers/pinEditPathEngine';

// Edit-path test: guards the engine that takes the edit, whatever the playback verdicts make the default.
pinEditPathEngine('robhubbard', 'soundmaster', 'hippel', 'sidmon2', 'instereo1', 'soundmon');

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
  return { ...(await orig<object>()), getTrackerReplayer: () => replayer };
});
vi.mock('@/engine/uade/UADEEngine', () => ({
  UADEEngine: {
    hasInstance: () => !!(globalThis as { __uadePort?: unknown }).__uadePort,
    getInstance: () => (globalThis as { __uadePort?: unknown }).__uadePort,
  },
}));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));

const REL = 'rob-hubbard/skateordie.rh';
const settle = () => new Promise((r) => setTimeout(r, 100));
const asBytes = (d: ArrayBuffer | Uint8Array) => (d instanceof Uint8Array ? d : new Uint8Array(d));

beforeAll(() => {
  const g = globalThis as Record<string, unknown>;
  g.self ??= globalThis;
  (g.self as Record<string, unknown>).location ??= { href: 'file:///x/x.js' };
  g.WorkerGlobalScope ??= class {};
  Object.defineProperty(process, 'versions', { value: {}, configurable: true });
});

async function load(): Promise<Uint8Array> {
  const bytes = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs', REL)));
  const file = new File([bytes.slice().buffer as ArrayBuffer], basename(REL));
  const { importTrackerModule } = await import('@/lib/song/songBranches');
  await importTrackerModule({
    metadata: { title: basename(REL), type: 'MOD', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
    arrayBuffer: await file.arrayBuffer(), file,
  } as never, { useLibopenmpt: true } as never);
  const { liveTrackerSong } = await import('@/lib/song/liveSong');
  (globalThis as { __liveSong?: () => unknown }).__liveSong = () => liveTrackerSong();
  return bytes;
}

interface Ons { voice: number; chunk: number; period: number; volume: number }
/** Note-ons per voice (Paula period after a sample pointer), each with the channel volume in force; `write` runs at chunk `writeAt`. */
async function noteOns(bytes: Uint8Array, seconds: number, writeAt = -1, write?: () => Promise<void>): Promise<Ons[]> {
  const uade = await openUade();
  const session = new PaulaSession(uade, bytes, basename(REL));
  const rule = new PaulaNoteOns('armed');
  const vol = [0, 0, 0, 0];
  const out: Ons[] = [];
  const feed = (c: number, ws: Array<{ voice: number; reg: number; value: number }>) => {
    for (const w of ws) {
      if (w.voice > 3) continue;
      if (w.reg === PAULA_REG.VOL) vol[w.voice] = w.value;
      const p = rule.push(w as never);
      if (p) out.push({ voice: w.voice, chunk: c, period: p, volume: vol[w.voice] });
    }
  };
  feed(0, session.drain());
  (globalThis as { __uadePort?: unknown }).__uadePort = chipRamEngine(uade);
  try {
    for (let c = 1; c <= seconds * 100; c++) {
      if (c === writeAt && write) await write();
      const ws = session.step();
      if (!ws) break;
      feed(c, ws);
    }
  } finally {
    (globalThis as { __uadePort?: unknown }).__uadePort = undefined;
    session.close();
  }
  return out;
}

const near = (got: number, want: number) => Math.abs(got - want) / want < 0.02;

interface Spot { p: number; ch: number; r: number }
/** A voice-1 row of pattern 0 that holds a note, and a blank row a note's duration covers. */
async function spots(): Promise<{ existing: Spot; blank: Spot }> {
  const { useTrackerStore } = await import('@/stores/useTrackerStore');
  const rows = useTrackerStore.getState().patterns[0].channels[1].rows;
  const ex = rows.findIndex((c) => c.note > 0 && c.note < 97);
  const { buildRobHubbardGrid } = await import('@/lib/import/formats/RobHubbardParser');
  const grid = buildRobHubbardGrid(new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs', REL))))!;
  const bl = rows.findIndex((c, i) => i > 2 && c.note === 0 && grid.cellSources[0][1][i] === null);
  expect(ex, 'pattern 0 voice 2 has a note').toBeGreaterThanOrEqual(0);
  expect(bl, 'pattern 0 voice 2 has a blank row').toBeGreaterThan(0);
  return { existing: { p: 0, ch: 1, r: ex }, blank: { p: 0, ch: 1, r: bl } };
}

describe('skateordie.rh: a note typed into the pattern is heard when the song plays', { timeout: 300000 }, () => {
  const KEYS = [{ ins: 1, note: 30 }, { ins: 2, note: 37 }, { ins: 3, note: 44 }];

  for (const where of ['existing', 'blank'] as const) {
    it.each(KEYS)(`next play, typed on a ${where} row with instrument $ins: a note-on at the period of note $note, volume up`, async ({ ins, note }) => {
      const bytes = await load();
      const at = (await spots())[where];
      const was = await noteOns(bytes, 4);
      expect(was.length, 'the replayer ran (sentinel)').toBeGreaterThan(0);

      const { useTrackerStore } = await import('@/stores/useTrackerStore');
      const { liveTrackerSong } = await import('@/lib/song/liveSong');
      const { playingDescriptor } = await import('@/engine/replayer/liveCellEdits');
      const { editedModuleForPlay } = await import('@/engine/replayer/editedModuleForPlay');
      const st = useTrackerStore.getState();
      st.setCurrentPattern(at.p);
      st.setCell(at.ch, at.r, { note, instrument: ins });
      await settle();
      const song = liveTrackerSong();
      const desc = playingDescriptor(song);
      expect(desc, 'a native engine descriptor plays this song').toBeTruthy();
      const play = asBytes((await editedModuleForPlay(song, desc!)) ?? (song[desc!.fileDataKey] as ArrayBuffer));
      const now = await noteOns(play, 4);
      const want = noteToPeriod(note);
      const fresh = now.filter((o) => o.voice === at.ch && !was.some((w) => w.voice === o.voice && w.chunk === o.chunk && w.period === o.period));
      const hit = fresh.find((o) => near(o.period, want));
      expect(hit, `a new note-on on voice ${at.ch + 1} near period ${want} (new: ${JSON.stringify(fresh.slice(0, 4))})`).toBeTruthy();
      expect(hit!.volume, 'the channel volume is up').toBeGreaterThan(0);
    });
  }

  it('while the song plays, a note typed on an existing row is heard at its pitch with no restart (live chip RAM write)', async () => {
    const bytes = await load();
    const at = (await spots()).existing;
    const { useTrackerStore } = await import('@/stores/useTrackerStore');
    const { liveTrackerSong } = await import('@/lib/song/liveSong');
    const { sendCellEditsToEngine } = await import('@/engine/replayer/liveCellEdits');
    const note = 37;
    const W = 5;
    // the first pass of the cell is after the write: the song loops its pattern, the edit shows from the second pass on
    const live = await noteOns(bytes, 6, W, async () => {
      useTrackerStore.getState().setCurrentPattern(at.p);
      useTrackerStore.getState().setCell(at.ch, at.r, { note, instrument: 2 });
      const cell = useTrackerStore.getState().patterns[at.p].channels[at.ch].rows[at.r];
      await sendCellEditsToEngine(liveTrackerSong(), [{ pattern: at.p, row: at.r, channel: at.ch, cell }]);
    });
    const want = noteToPeriod(note);
    const heard = live.filter((o) => o.chunk > W && o.voice === at.ch && near(o.period, want));
    expect(heard.length, `a note-on on voice ${at.ch + 1} near period ${want} after the write (voice ons: ${JSON.stringify(live.filter((o) => o.voice === at.ch).slice(0, 12).map((o) => `${o.chunk}:${o.period}`))})`).toBeGreaterThan(0);
    expect(heard[0].volume, 'the channel volume is up').toBeGreaterThan(0);
  });
});
