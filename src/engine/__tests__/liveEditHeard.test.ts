/**
 * G19 / G5 / G6: an edit made in the grid is heard on the next play, for every format with an editable grid.
 *
 * ONE table over the formats of gridProvenance (DIRECT + WALK) that have a corpus song. Per format:
 *   import  : importTrackerModule (the app's open-file path)
 *   edit    : useTrackerStore.setCell (what a keystroke calls); the store hands the cell to the engine
 *             that plays the song (sendCellEditsToEngine, the replayer's song = liveTrackerSong here)
 *   play    : what startNativeEngines loads the engine with: `editedModuleForPlay(song, desc) ?? song[desc.fileDataKey]`
 *   heard   : the module differs from the loaded one; for formats with a UADE rig, the Paula stream of
 *             that module differs from the original's (the replayer's own output carries the edit)
 *   add     : G5, a note on an EMPTY row: the exported module reloads with that note in that cell
 * A format played by the TypeScript scheduler (no engine file data) hears the grid directly: 'tracker'.
 * The status per format is recorded in gridProvenance.ts (LIVE_EDIT); a row that disagrees fails.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { FORMAT_REGISTRY } from '@/lib/import/FormatRegistry';
import { WALK_GRIDS, DIRECT_GRIDS, LIVE_EDIT, ADD_ON_EMPTY_ROW, type LiveEditStatus } from '@/lib/import/gridProvenance';
import { pickDscNote } from './helpers/pickDscNote';
import { openUade, PaulaSession } from './gridOracle';

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
  // The replayer's song is the live one: the store's edit hook hands the cell to the engine that plays it.
  const replayer: object = new Proxy({}, { get: (_t, k) => (k === 'getSong' ? () => (globalThis as { __liveSong?: () => unknown }).__liveSong?.() ?? null : () => undefined) });
  return { ...(await orig<object>()), getTrackerReplayer: () => replayer };
});
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));

const ROOT = process.cwd();
const SONGS = join(ROOT, 'public/data/songs');
const WASM_BUNDLES: Array<[string, string]> = [['davidwhittaker', 'DavidWhittaker'], ['bd', 'Bd'], ['tfmx', 'TFMX']];

beforeAll(() => {
  const g = globalThis as Record<string, unknown>;
  g.self ??= globalThis;
  (g.self as Record<string, unknown>).location ??= { href: 'file:///bd/Bd.js' };
  g.WorkerGlobalScope ??= class {};
  Object.defineProperty(process, 'versions', { value: {}, configurable: true });
  vi.stubGlobal('fetch', async (url: string) => {
    for (const [dir, name] of WASM_BUNDLES) {
      const m = new RegExp(`${dir}/(${name}\\.(?:js|wasm))$`).exec(String(url));
      if (m) return new Response(readFileSync(join(ROOT, 'public', dir, m[1])), { status: 200 });
    }
    throw new Error(`unexpected fetch in test: ${url}`);
  });
});

const files: string[] = [];
(function walk(d: string) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p); else files.push(p.slice(SONGS.length + 1));
  }
})(SONGS);
files.sort();

/** The song of each format the table runs (an explicit file wins over the registry's extension match). */
const FILE: Record<string, string> = {
  suntronic: 'SUNTronicTunes/mule.src',
  robHubbard: files.find((f) => f.endsWith('.rh')) ?? '',
  davidWhittaker: files.find((f) => f.endsWith('.dw')) ?? '',
  benDaglish: files.find((f) => f.endsWith('.bd')) ?? '',
  jochenHippelST: files.find((f) => f.endsWith('.hst')) ?? '',
  activisionPro: files.find((f) => f.endsWith('.avp')) ?? '',
  fred: files.find((f) => f.endsWith('.fred')) ?? '',
  actionamics: files.find((f) => f.endsWith('.ast') || f.endsWith('.act')) ?? '',
  soundMaster: files.find((f) => f.endsWith('.sm')) ?? '',
  digitalSonixChrome: files.find((f) => f.endsWith('.dsc')) ?? '',
  jochenHippel7V: files.find((f) => f.endsWith('.hip7') || f.endsWith('.hip')) ?? '',
  sidmon1: files.find((f) => f.endsWith('.sid1')) ?? '',
  sonicArranger: files.find((f) => f.endsWith('.sa')) ?? '',
  soundfx: files.find((f) => f.endsWith('.sfx')) ?? '',
};
/** Formats UADE plays from the module bytes: the Paula stream is the sound. */
const PAULA = new Set(['suntronic', 'robHubbard', 'davidWhittaker', 'benDaglish', 'jochenHippelST', 'activisionPro', 'fred', 'actionamics', 'soundMaster', 'digitalSonixChrome', 'sidmon1']);
const UADE_NAME: Record<string, (n: string) => string> = { jochenHippelST: () => 'song.hst' };

function registryFile(key: string): string | undefined {
  const def = FORMAT_REGISTRY.find((f) => f.key === key);
  if (!def) return undefined;
  return files.find((rel) => {
    const b = basename(rel).toLowerCase();
    return (def.extRegex && def.matchMode !== 'prefix' && def.extRegex.test(b))
      || (def.prefixes && def.matchMode !== 'extension' && def.prefixes.some((p) => b.startsWith(p)));
  });
}

/**
 * Formats the table cannot run in node, each with the reason (named, never skipped quietly). They are the
 * open units of G19: measure them where the engine runs (MCP get_audio_level on the live app).
 */
export const UNMEASURED: Record<string, string> = {
  dmf: 'import needs the Furnace WASM (FurnaceFileOps.js) the node run cannot load',
  artOfNoise: 'import needs an AudioContext (ToneEngine)', steveTurner: 'import needs an AudioContext (ToneEngine)',
  goatTracker: 'import needs an AudioContext (ToneEngine)', anders0land: 'import needs an AudioContext (ToneEngine)',
  fmTracker: 'import needs an AudioContext (ToneEngine)', imagoOrpheus: 'import needs an AudioContext (ToneEngine)',
  cdfm67: 'import needs an AudioContext (ToneEngine)', karlMorton: 'import needs an AudioContext (ToneEngine)',
  madTracker2: 'import needs an AudioContext (ToneEngine)', nru: 'import needs an AudioContext (ToneEngine)',
  iffSmus: 'import needs an AudioContext (ToneEngine)',
  digitalSymphony: 'import needs the OpenMPT WASM the node run cannot load', graoumfTracker2: 'import needs the OpenMPT WASM the node run cannot load',
  symphoniePro: 'import needs the OpenMPT WASM the node run cannot load', digiBoosterPro: 'import needs the OpenMPT WASM the node run cannot load',
  chuckBiscuits: 'import needs the OpenMPT WASM the node run cannot load', gameMusicCreator: 'import needs the OpenMPT WASM the node run cannot load',
  soundfx: 'import needs the OpenMPT WASM the node run cannot load',
  ams: 'import needs the OpenMPT WASM the node run cannot load',
  iceTracker: 'the registry match is an instrument file, no corpus module',
  musicMaker: 'the song needs its instrument companion file, not in the corpus folder',
  stoneTracker: 'the song needs its sample bank companion file, not in the corpus folder',
  kt: 'the song has no note cell to edit (a Klystrack instrument-only file)', xrns: 'the song has no note cell to edit',
};

const KEYS = [...Object.keys(WALK_GRIDS), ...DIRECT_GRIDS];
const rows: Array<{ key: string; rel: string }> = KEYS.flatMap((key) => {
  if (key in UNMEASURED) return [];
  const rel = FILE[key] || registryFile(key);
  return rel && existsSync(join(SONGS, rel)) ? [{ key, rel }] : [];
});

type Cell = { note: number; instrument: number };
interface Measured { engine: string; route: string; status: LiveEditStatus; add: 'yes' | 'no' | 'n/a' }
export const measured: Record<string, Measured> = {};

async function load(rel: string): Promise<{ bytes: Uint8Array; name: string }> {
  const bytes = new Uint8Array(readFileSync(join(SONGS, rel)));
  const name = basename(rel);
  const file = new File([bytes.slice().buffer as ArrayBuffer], name);
  const { importTrackerModule } = await import('@/lib/file/UnifiedFileLoader');
  await importTrackerModule({
    metadata: { title: name, type: 'MOD', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
    arrayBuffer: await file.arrayBuffer(), file,
  } as never, { useLibopenmpt: true } as never);
  const { liveTrackerSong } = await import('@/lib/song/liveSong');
  (globalThis as { __liveSong?: () => unknown }).__liveSong = () => liveTrackerSong();
  return { bytes, name };
}

const settle = () => new Promise((r) => setTimeout(r, 100));
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const asBytes = (d: ArrayBuffer | Uint8Array) => (d instanceof Uint8Array ? d : new Uint8Array(d));

/**
 * The first note without a command beside it among the first eight notes of the first pattern (a note deep
 * in the song is not heard in the render window), else the first note; moved two semitones.
 */
async function pickNote(): Promise<{ p: number; ch: number; r: number; note: number } | null> {
  const { useTrackerStore } = await import('@/stores/useTrackerStore');
  const pats = useTrackerStore.getState().patterns;
  type E = { p: number; ch: number; r: number; note: number };
  let first: E | null = null;
  let plain: E | null = null;
  let seen = 0;
  for (let p = 0; p < pats.length; p++) for (let ch = 0; ch < pats[p].channels.length; ch++) {
    pats[p].channels[ch].rows.forEach((c, r) => {
      if (!(c.note > 0 && c.note < 95)) return;
      const e = { p, ch, r, note: c.note + (c.note > 48 ? -2 : 2) };
      first ??= e;
      if (++seen <= 8 && p === 0) plain ??= !c.effTyp && !c.eff && !c.effTyp2 && !c.eff2 && !c.volume ? e : null;
    });
  }
  return plain ?? first;
}

async function paulaEvents(bytes: Uint8Array, name: string, seconds = 8): Promise<string[]> {
  const uade = await openUade();
  const session = new PaulaSession(uade, bytes, name);
  const out: string[] = [];
  const add = (c: number, w: Array<{ voice: number; reg: number; value: number }>) => { for (const x of w) if (x.voice < 4) out.push(`${c}:${x.voice}:${x.reg}:${x.value}`); };
  add(0, session.drain());
  for (let c = 1; c <= seconds * 100; c++) { const w = session.step(); if (!w) break; add(c, w); }
  session.close();
  return out;
}

describe('an edit in the grid is heard on the next play', { timeout: 180000 }, () => {
  for (const { key, rel } of rows) {
    it(`${key} (${rel})`, async () => {
      const { bytes, name } = await load(rel);
      const { useTrackerStore } = await import('@/stores/useTrackerStore');
      const { liveTrackerSong } = await import('@/lib/song/liveSong');
      const { liveEditRoute, playingDescriptor, sendCellEditsToEngine } = await import('@/engine/replayer/liveCellEdits');
      const { editedModuleForPlay } = await import('@/engine/replayer/editedModuleForPlay');
      const desc = playingDescriptor(liveTrackerSong());
      const route = liveEditRoute(liveTrackerSong());
      const loaded = desc ? asBytes(liveTrackerSong()[desc.fileDataKey] as ArrayBuffer).slice() : null;

      // The edit: the store action a keystroke calls.
      const at = key === 'digitalSonixChrome'
        ? await pickDscNote({ patterns: useTrackerStore.getState().patterns as never }, bytes)
        : await pickNote();
      expect(at, 'the song has a note to edit').not.toBeNull();
      const st = useTrackerStore.getState();
      st.setCurrentPattern(at!.p);
      st.setCell(at!.ch, at!.r, { note: at!.note });
      // The store handed the cell to the engine without waiting; wait for the same route to finish (it is idempotent).
      await settle();
      await sendCellEditsToEngine(liveTrackerSong(), [{ pattern: at!.p, row: at!.r, channel: at!.ch, cell: useTrackerStore.getState().patterns[at!.p].channels[at!.ch].rows[at!.r] }]);
      if (process.env.G19_DEBUG) { const { getTrackerReplayer } = await import('@engine/TrackerReplayer'); console.log('[g19] replayer song', getTrackerReplayer().getSong() ? 'live' : 'null', 'route', route.route); }

      let status: LiveEditStatus;
      let before = 'n/a';
      if (!desc) {
        status = 'n/a'; // the TypeScript scheduler voices the grid: the edit is the grid
      } else {
        const song = liveTrackerSong();
        // Before G19 the engine was loaded with song[fileDataKey] as the live edit route left it.
        before = same(asBytes(song[desc.fileDataKey] as ArrayBuffer), loaded!) ? 'no' : 'yes';
        const edited = await editedModuleForPlay(song, desc);
        const play = asBytes((edited ?? song[desc.fileDataKey]) as ArrayBuffer | Uint8Array);
        if (process.env.G19_DEBUG) { const d = (a: Uint8Array, b: Uint8Array) => { const o: number[] = []; for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) o.push(i); return o.slice(0, 6).join(','); }; console.log('[g19] diffs loaded-vs-store', d(loaded!, asBytes(song[desc.fileDataKey] as ArrayBuffer)), 'loaded-vs-play', d(loaded!, play), 'orig-vs-store', d(bytes, asBytes(song[desc.fileDataKey] as ArrayBuffer))); } if (process.env.G19_DEBUG) console.log('[g19]', key, 'edited', !!edited, 'len', play.length, loaded!.length, 'same', same(play, loaded!));
        if (same(play, loaded!)) status = 'fail';
        else if (PAULA.has(key)) {
          const nm = (UADE_NAME[key] ?? ((n: string) => n))(name);
          const was = await paulaEvents(bytes, nm);
          const now = await paulaEvents(play, nm);
          if (process.env.G19_DEBUG) { const d: number[] = []; for (let i = 0; i < Math.min(play.length, bytes.length); i++) if (play[i] !== bytes[i]) d.push(i); console.log('[g19]', key, 'orig-vs-play diffs', d.length, d.slice(0, 5).join(','), 'events', was.length, now.length, 'at', JSON.stringify(at)); }
          expect(was.length, 'the replayer ran (sentinel)').toBeGreaterThan(0);
          status = was.join() === now.join() ? 'fail' : 'pass';
        } else status = 'pass';
      }

      // G5: a note on an empty row reaches the exported module.
      let add: Measured['add'] = 'n/a';
      if (desc) {
        await load(rel);
        const s2 = useTrackerStore.getState();
        let empty: { p: number; ch: number; r: number } | null = null;
        let any = 0;
        // The blank row straight after a note (a command-stream voice holds that note across it), else the first blank row.
        let fallback: { p: number; ch: number; r: number } | null = null;
        s2.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell: Cell, r) => {
          if (cell.note > 0 && !any) any = cell.note;
          if (p !== 0 || r === 0 || cell.note !== 0) return;
          fallback ??= { p, ch, r };
          if (!empty && c.rows[r - 1].note > 0 && c.rows[r - 1].note < 97) empty = { p, ch, r };
        })));
        empty ??= fallback;
        if (empty) any = s2.patterns[0].channels[(empty as { ch: number }).ch].rows[(empty as { r: number }).r - 1].note > 0 ? s2.patterns[0].channels[(empty as { ch: number }).ch].rows[(empty as { r: number }).r - 1].note : any;
        if (empty && any) {
          const e = empty as { p: number; ch: number; r: number };
          s2.setCurrentPattern(e.p);
          s2.setCell(e.ch, e.r, { note: any });
          await settle();
          const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
          const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
          let ok = false;
          try {
            const out = await exportNativeSong(null, {});
            if (out) {
              const back = await parseModuleToSong(new File([new Uint8Array(out.data).buffer as ArrayBuffer], name)) as unknown as { patterns: Array<{ channels: Array<{ rows: Cell[] }> }> };
              ok = back.patterns[e.p]?.channels[e.ch]?.rows[e.r]?.note === any;
            }
          } catch { ok = false; }
          add = ok ? 'yes' : 'no';
        }
      }
      measured[key] = { engine: desc?.key ?? 'tracker', route: route.route, status, add };
      console.log(`[liveEdit] ${key} engine=${desc?.key ?? 'tracker'} route=${route.route} before=${before} heard=${status} add=${add}`);
      expect(status, `${key} edit heard (gridProvenance LIVE_EDIT)`).toBe(LIVE_EDIT[key]);
      expect(add === 'yes' ? 'pass' : add === 'no' ? 'fail' : 'n/a', `${key} note on an empty row (gridProvenance ADD_ON_EMPTY_ROW)`).toBe(ADD_ON_EMPTY_ROW[key]);
    });
  }
});

describe('the live-edit table is complete', () => {
  it('has a row for every format with a corpus song, and none for a format without one', () => {
    expect(Object.keys(LIVE_EDIT).sort()).toEqual(rows.map((r) => r.key).sort());
    expect(Object.keys(ADD_ON_EMPTY_ROW).sort()).toEqual(rows.map((r) => r.key).sort());
  });
});
