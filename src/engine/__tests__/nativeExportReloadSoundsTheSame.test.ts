/**
 * Fully editable = export to the native format, load it again, it sounds the same.
 *
 * ONE table-driven round trip through the product's own doors:
 *   import  : importTrackerModule (the app's open-file path, fills the stores)
 *   edit    : useTrackerStore.setCell (what a keystroke in the grid calls)
 *   export  : exportNativeSong(null) (the Export dialog / MCP export_native router, song read live from the stores)
 *   reload  : parseModuleToSong (the app's parse path) on the exported bytes
 * Per format x corpus song:
 *   unedited : exported bytes == the original file; the reloaded grid == the loaded grid
 *   edited   : one note cell edited -> the reloaded grid shows the edit and nothing else moved
 * The render stage (a format's own replayer, original vs reloaded, equal; edited differs only
 * around the edit) is in the `renderers` table; a format without a rig there is reported as
 * 'no rig' by the sentinel test, never silently passed.
 * Status per format is recorded in src/lib/import/gridProvenance.ts (EXPORT_ROUND_TRIP).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { noteValueToPitch } from '@/lib/tracker/noteValue';
import { createHash } from 'node:crypto';
import { isSunTronicV13Format } from '@/lib/import/formats/SunTronicV13';
import { openUade, PaulaSession } from './gridOracle';
import { EXPORT_ROUND_TRIP } from '@/lib/import/gridProvenance';
import { pickDscNote } from './helpers/pickDscNote';
import { loadTfmxWalkModule, type TfmxWalkHost } from './helpers/tfmxWalkHost';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

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
  // The store's edit hook asks the live replayer to mirror the cell; there is no audio context here.
  const replayer: object = new Proxy({}, { get: (_t, k) => (k === 'getSong' ? () => null : () => undefined) });
  return { ...(await orig<object>()), getTrackerReplayer: () => replayer };
});
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));

const ROOT = process.cwd();
const SONGS = join(ROOT, 'public/data/songs');

let tree: string[] | null = null;
/** Every file under public/data/songs (relative path), listed once. */
function allSongFiles(): string[] {
  if (tree) return tree;
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p.slice(SONGS.length + 1));
    }
  };
  walk(SONGS);
  return (tree = out.sort());
}

/** Corpus of one format: every file with one of the extensions (optionally in one folder), one per distinct content. */
function corpus(exts: string[], inDir?: string): string[] {
  const seen = new Set<string>();
  return allSongFiles().filter((rel) => {
    if (inDir && !rel.startsWith(`${inDir}/`)) return false;
    if (!exts.some((x) => rel.toLowerCase().endsWith(x))) return false;
    const h = createHash('sha1').update(readFileSync(join(SONGS, rel))).digest('hex');
    if (seen.has(h)) return false;
    seen.add(h);
    return true;
  });
}

/** The emscripten bundles the grid walks of these parsers fetch (public/<dir>/<name>.js + .wasm). */
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

/** Every distinct SunTronic V1.3 module of both corpus folders (the walk test's corpus). */
function sunTronicCorpus(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const dir of ['formats/SUNTronicTunes', 'SUNTronicTunes']) {
    if (!existsSync(join(SONGS, dir))) continue;
    for (const e of readdirSync(join(SONGS, dir), { withFileTypes: true })) {
      if (!e.isFile()) continue;
      const bytes = new Uint8Array(readFileSync(join(SONGS, dir, e.name)));
      if (!isSunTronicV13Format(bytes)) continue;
      const h = createHash('sha1').update(bytes).digest('hex');
      if (seen.has(h)) continue;
      seen.add(h);
      out.push(`${dir}/${e.name}`);
    }
  }
  return out;
}


/** gridProvenance key -> its corpus. */
const FORMATS: FormatRow[] = [
  { key: 'jochenHippel7V', rig: 'tfmx', files: corpus(['.hip7', '.hip']) },
  { key: 'davidWhittaker', rig: 'paula', files: corpus(['.dw']) },
  { key: 'robHubbard', rig: 'paula', files: corpus(['.rh']) },
  { key: 'benDaglish', rig: 'paula', files: corpus(['.bd']) },
  { key: 'jochenHippelST', rig: 'paula', sampleEvery: 2, uadeName: () => 'song.hst', files: corpus(['.hst', '.sog']) },
  { key: 'suntronic', rig: 'paula', sampleEvery: 24, files: sunTronicCorpus() },
  { key: 'activisionPro', rig: 'paula', files: corpus(['.avp']) },
  { key: 'fred', rig: 'paula', files: corpus(['.fred']) },
  { key: 'actionamics', rig: 'paula', files: corpus(['.ast', '.act']) },
  { key: 'soundMaster', rig: 'paula', files: corpus(['.sm']) },
  { key: 'digitalSonixChrome', rig: 'paula', sampleEvery: 4, files: corpus(['.dsc']), pick: pickDscNote, noteSelectsSample: true },
  { key: 'sidmon1', rig: 'paula', files: [...corpus(['.sid1']), ...corpus(['.sid'], 'sidmon-1')] },
];

type Cell = { note: number; instrument: number; volume: number; effTyp: number; eff: number; effTyp2: number; eff2: number };
type GridSong = { songPositions: number[]; patterns: Array<{ channels: Array<{ rows: Cell[] }> }> };

const sig = (c: Cell) => `${c.note}/${c.instrument}/${c.volume}/${c.effTyp}.${c.eff}/${c.effTyp2}.${c.eff2}`;

/** Every cell that differs between two grids, as 'p:ch:r want got'. */
function gridDiff(a: GridSong, b: GridSong): string[] {
  const out: string[] = [];
  if (a.songPositions.join() !== b.songPositions.join()) out.push('songPositions differ');
  if (a.patterns.length !== b.patterns.length) out.push(`patterns ${a.patterns.length} vs ${b.patterns.length}`);
  a.patterns.forEach((pat, p) => pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
    const g = b.patterns[p]?.channels[c]?.rows[r];
    if (!g || sig(cell) !== sig(g)) out.push(`${p}:${c}:${r} ${sig(cell)} -> ${g ? sig(g) : 'missing'}`);
  })));
  return out;
}

const snapshot = (s: GridSong): GridSong => JSON.parse(JSON.stringify({
  songPositions: s.songPositions,
  patterns: s.patterns.map((p) => ({ channels: p.channels.map((c) => ({ rows: c.rows.map((r) => ({
    note: r.note, instrument: r.instrument, volume: r.volume, effTyp: r.effTyp, eff: r.eff, effTyp2: r.effTyp2, eff2: r.eff2 })) })) })),
}));

/** 'equal', or where and how the two byte strings first differ. */
function firstByteDiff(a: Uint8Array, b: Uint8Array): string {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return `first diff at ${i} (exported ${a[i]} vs original ${b[i]}), sizes ${a.length}/${b.length}`;
  return a.length === b.length ? 'equal' : `sizes ${a.length}/${b.length}`;
}

async function loadThroughApp(rel: string): Promise<{ bytes: Uint8Array; name: string }> {
  const bytes = new Uint8Array(readFileSync(join(SONGS, rel)));
  const name = basename(rel);
  const file = new File([bytes.slice().buffer as ArrayBuffer], name);
  const { importTrackerModule } = await import('@/lib/file/UnifiedFileLoader');
  await importTrackerModule({
    metadata: { title: name, type: 'MOD', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
    arrayBuffer: await file.arrayBuffer(), file,
  } as never, { useLibopenmpt: true } as never);
  return { bytes, name };
}

async function exportThroughRouter(): Promise<Uint8Array | null> {
  const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
  if (process.env.G16_DEBUG) {
    const { liveTrackerSong } = await import('@/lib/song/liveSong');
    const ls = liveTrackerSong();
    console.log('[song]', ls.format, ls.uadePatternLayout?.formatId, ls.uadeVariableLayout?.formatId, (ls.uadeEditableFileData as ArrayBuffer | undefined)?.byteLength, 'patterns', ls.patterns.length, 'notes', ls.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows)).filter((c) => c.note > 0).length, 'unmatched', (ls as unknown as { gridUnmatchedReason?: string }).gridUnmatchedReason);
  }
  const res = await exportNativeSong(null, {});
  if (process.env.G16_DEBUG && res) console.log('[router]', res.filename, res.data.length, JSON.stringify(res.warnings.slice(0, 2)));
  return res ? res.data : null;
}

/** Whether this song is in this run. */
const sampled = (fmt: FormatRow, rel: string): boolean =>
  !fmt.sampleEvery || !!process.env.G16_FULL || fmt.files.indexOf(rel) % fmt.sampleEvery === 0 || `${fmt.key}|${basename(rel)}` in KNOWN;

const originals = new Map<string, Trace | null>();
/** Files UADE's own player does not take (it refuses them): no render stage for these. Any other refusal is a failure. */
const NO_RIG = new Set<string>();
const EXPECTED_NO_RIG: string[] = ['formats/fuzzball-title.fred'];
/**
 * Files UADE takes but plays as noise, so its stream says nothing about the song: the .sog is the
 * Hippel ST SOURCE the editor packs for the player (the Compress step of jochenHippelSTGridMatchesPlayer),
 * not a module the 68k player reads. Their sound is held by that test's packed form; here only bytes and grid.
 */
const NO_RIG_BY_DESIGN = new Set(['formats/astaroth.sog', 'hippel-st/demo music10.sog']);
/** The loaded file's own render, once per file. */
async function originalTrace(rig: RigName, rel: string, bytes: Uint8Array, name: string): Promise<Trace | null> {
  if (NO_RIG_BY_DESIGN.has(rel)) return null;
  if (!originals.has(rel)) {
    const t = await traceOf(rig, bytes, name);
    originals.set(rel, t);
    if (!t) NO_RIG.add(rel);
  }
  return originals.get(rel)!;
}

async function reload(bytes: Uint8Array, name: string): Promise<GridSong> {
  const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
  return (await parseModuleToSong(new File([bytes.slice().buffer as ArrayBuffer], name))) as unknown as GridSong;
}

interface Edit { p: number; ch: number; r: number; note: number }

/**
 * The first note cell without a command beside it (a plain note), else the first note; moved two
 * semitones: up from the low half of the range, down from the high half.
 */
function pickNote(song: GridSong): Edit | null {
  let first: Edit | null = null;
  let plain: Edit | null = null;
  let seen = 0;
  for (let p = 0; p < song.patterns.length; p++) {
    const chs = song.patterns[p].channels;
    for (let ch = 0; ch < chs.length; ch++) {
      chs[ch].rows.forEach((c, r) => {
        if (!(c.note > 0 && c.note < 95)) return;
        const e = { p, ch, r, note: c.note + (c.note > 48 ? -2 : 2) };
        first ??= e;
        // Only among the first few notes of the first pattern: a plain note deep in the song is not heard in the render window.
        if (++seen <= 8 && p === 0) plain ??= !c.effTyp && !c.eff && !c.effTyp2 && !c.eff2 && !c.volume ? e : null;
      });
    }
  }
  return plain ?? first;
}

interface FormatRow {
  key: string;
  files: string[];
  /** The name UADE is told (its eagleplayers pick a module by prefix or extension). */
  uadeName?: (name: string) => string;
  /**
   * Run one song in this many (plus every KNOWN defect's song); G16_FULL=1 runs every song. Set only
   * where the corpus is large (SunTronic 193 songs, about 4 minutes of import, export and 68k rendering).
   */
  sampleEvery?: number;
  /**
   * The format is out of this run, with the reason: its owner's uncommitted work is rewriting what the
   * round trip runs through, so a result now would be about that tree. Listed by the last test; remove
   * the line when the work lands (the round trip passed 6 of 6 before it).
   */
  held?: string;
  /** The replayer that renders it. */
  rig: RigName;
  /** A note edit also changes the sample the voice plays (the instrument IS the note's record). */
  noteSelectsSample?: boolean;
  /** The edit this format can express; the default moves the first note two semitones. */
  pick?: (song: GridSong, bytes: Uint8Array) => Promise<Edit | null>;
}

// ---- The sound: each format's own replayer, as the chip's input stream -------------------------------

/** One thing a voice's chip was told: pitch writes are `period`, everything else `other`. */
interface Ev { kind: 'period' | 'pointer' | 'other' | 'edge'; text: string; t: number }
/** Per voice, in order. */
/** `end`: the chunk the player reported the song over (a short one ends a little earlier or later each load). */
type Trace = Ev[][] & { end?: number };
type RigName = 'paula' | 'tfmx';

const PAULA_SECONDS = Number(process.env.G16_SECONDS ?? 8);
/** Chunks (UADE, 10 ms) or ticks (TFMX) two loads of one module may differ by. */
const TIME_JITTER = 2;
const TFMX_TICKS = 3000;
const stats = { renders: 0, events: 0 };
let tfmx: TfmxWalkHost | null = null;

/**
 * UADE running the module's own 68k replayer: every Paula register write per voice with the
 * 10 ms chunk it happened in (the exact input of the chip, so equal streams are equal sound).
 */
async function paulaTrace(bytes: Uint8Array, name: string): Promise<Trace | null> {
  // A fresh UADE per render: one that has played other songs carries their state into the next.
  const uade = await openUade();
  let session: PaulaSession;
  try { session = new PaulaSession(uade, bytes, name); } catch (e) {
    if (/UADE refused/.test(String(e))) return null;
    throw e;
  }
  const per: Trace = Object.assign([[], [], [], []] as Ev[][], { end: Infinity });
  // Stop short of the window's end: a write two loads of one module drift by a few chunks over the window.
  const last = PAULA_SECONDS * 100 - 50;
  const add = (chunk: number, writes: Array<{ voice: number; reg: number; value: number }>) => {
    for (const w of writes) {
      if (w.voice >= 4) continue;
      // Writes in the last chunks (an 'edge') are kept apart: a shift of a chunk moves one across the window's end.
      per[w.voice].push({ kind: chunk > last - TIME_JITTER - 1 ? 'edge' : w.reg === 3 ? 'period' : w.reg < 2 ? 'pointer' : 'other', text: `${w.reg}:${w.value}`, t: chunk });
    }
  };
  add(0, session.drain());
  for (let chunk = 1; chunk <= PAULA_SECONDS * 100; chunk++) {
    const writes = session.step();
    if (!writes) { per.end = chunk; break; }
    add(chunk, writes);
  }
  session.close();
  stats.renders++;
  stats.events += per.reduce((n, v) => n + v.length, 0);
  return per;
}

/** The TFMX decoder (Jochen Hippel .hip / .hip7): every note the sequencer starts, per voice, with its tick. */
async function tfmxTrace(bytes: Uint8Array): Promise<Trace> {
  tfmx ??= await loadTfmxWalkModule();
  const { records, voices } = tfmx.walk(bytes, 0, TFMX_TICKS);
  const per: Trace = Array.from({ length: voices }, () => []);
  for (const r of records) {
    if (r[1] !== 2) continue;
    per[r[2]].push({ kind: 'period', text: `p${r[5]}`, t: r[0] }, { kind: 'other', text: `v${r[9]}`, t: r[0] });
  }
  stats.renders++;
  stats.events += per.reduce((n, v) => n + v.length, 0);
  return per;
}

const traceOf = (rig: RigName, bytes: Uint8Array, name: string): Promise<Trace | null> => (rig === 'paula' ? paulaTrace(bytes, name) : tfmxTrace(bytes));

/** The first place two traces differ, or 'equal'. */
/** `pointers: false` leaves out the sample address writes (a module that grew or shrank moves its samples). */
function traceDiff(a: Trace, b: Trace, only?: (v: number) => boolean, pointers = true): string {
  for (let v = 0; v < Math.max(a.length, b.length); v++) {
    if (only && !only(v)) continue;
    const over = Math.min(a.end ?? Infinity, b.end ?? Infinity) - TIME_JITTER - 1;
    const keep = (e: Ev) => e.kind !== 'edge' && e.t <= over && (pointers || e.kind !== 'pointer');
    const x = (a[v] ?? []).filter(keep), y = (b[v] ?? []).filter(keep);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      // The same module loaded twice in UADE can run one 10 ms chunk apart (vblank jitter): within CHUNK_JITTER is the same moment.
      if (x[i]?.text !== y[i]?.text || Math.abs((x[i]?.t ?? 0) - (y[i]?.t ?? 0)) > TIME_JITTER) return `voice ${v} event ${i}: ${x[i] ? `${x[i].t}:${x[i].text}` : 'none'} vs ${y[i] ? `${y[i].t}:${y[i].text}` : 'none'}`;
    }
  }
  return 'equal';
}

/** A voice's events with the pitch writes taken out: what a note edit must not change. */
const withoutPitch = (t: Trace): Trace => Object.assign(t.map((v) => v.filter((e) => e.kind === 'other')), { end: t.end });

/**
 * Defects the round trip shows today, each tied to its plan unit
 * (thoughts/shared/plans/2026-10-07-grid-from-replayer-walk.md). The row is held to FAIL: when the
 * fix lands the test says so and the row must be removed (a defect never goes quiet).
 * Key: format key, or `<format key>|<file name>`; value per stage.
 */
const KNOWN: Record<string, Partial<Record<'unedited' | 'edited', string>>> = {
  benDaglish: { edited: 'G16-benDaglish: grid edits have no writer (the walk grid has no cell-to-command-byte map)' },
  'suntronic|smooth': { unedited: 'G16-sunSmooth: the score has no notes, the song parses to a stub and the router exports a MOD of it', edited: 'G16-sunSmooth: no note to edit' },
};

/** Run `body`; for a known defect it must still fail (a fixed one is reported so its row is removed). */
async function holding(key: string, file: string, stage: 'unedited' | 'edited', body: () => Promise<void>): Promise<void> {
  const why = KNOWN[`${key}|${basename(file)}`]?.[stage] ?? KNOWN[key]?.[stage];
  if (!why) return body();
  let failed = false;
  try { await body(); } catch { failed = true; }
  expect(failed, `known defect fixed, remove it from KNOWN: ${why}`).toBe(true);
}

for (const fmt of FORMATS.filter((f) => !f.held)) {
  describe(`native export round trip: ${fmt.key}`, { timeout: 120000 }, () => {
    for (const rel of fmt.files.filter((f) => sampled(fmt, f))) {
      it(`${rel}: unedited export is the original file and reloads as the same grid`, () => holding(fmt.key, rel, 'unedited', async () => {
        const { bytes, name } = await loadThroughApp(rel);
        const { useTrackerStore } = await import('@/stores/useTrackerStore');
        const loaded = snapshot({ songPositions: useTrackerStore.getState().patternOrder, patterns: useTrackerStore.getState().patterns as never });
        const out = await exportThroughRouter();
        expect(out, 'the router exported').not.toBeNull();
        expect(firstByteDiff(out!, bytes), 'exported bytes equal the original').toBe('equal');
        const back = await reload(out!, name);
        const diff = gridDiff(loaded, back);
        expect(diff.length, diff.slice(0, 6).join(' ; ')).toBe(0);
        // The sound: the format's own replayer, original against the exported file.
        const was = await originalTrace(fmt.rig, rel, bytes, fmt.uadeName?.(name) ?? name);
        if (!was) return;
        expect(was.some((v) => v.length > 0), 'the replayer ran and wrote to the chip (sentinel)').toBe(true);
        expect(traceDiff(was, (await traceOf(fmt.rig, out!, fmt.uadeName?.(name) ?? name))!), 'rendered stream equal').toBe('equal');
      }));

      it(`${rel}: one edited note exports, reloads as that edit and nothing else moved`, (ctx) => holding(fmt.key, rel, 'edited', async () => {
        const { bytes, name } = await loadThroughApp(rel);
        const { useTrackerStore } = await import('@/stores/useTrackerStore');
        const st = useTrackerStore.getState();
        const before = snapshot({ songPositions: st.patternOrder, patterns: st.patterns as never });
        const at = await (fmt.pick ?? ((s: GridSong) => Promise.resolve(pickNote(s))))(before, bytes);
        if (!at && fmt.pick) ctx.skip('no cell this format can express a note edit on');
        expect(at, 'the grid has a note to edit').not.toBeNull();
        const old = before.patterns[at!.p].channels[at!.ch].rows[at!.r];
        const note = at!.note;
        // In pitch (the octave below C-0 is stored -12..-1, so stored values skip 0)
        const delta = noteValueToPitch(note)! - noteValueToPitch(old.note)!;
        st.setCurrentPattern(at!.p);
        st.setCell(at!.ch, at!.r, { note });
        const out = await exportThroughRouter();
        expect(out).not.toBeNull();
        expect(Buffer.compare(Buffer.from(out!), Buffer.from(bytes)), 'the edit changed the file').not.toBe(0);
        const back = await reload(out!, name);
        const want = snapshot(before);
        want.patterns[at!.p].channels[at!.ch].rows[at!.r].note = note;
        // A track the song reuses (on other steps, other voices with their own transposes, a repeated
        // sub-pattern) shows the edit wherever it plays: one set of bytes. An echo is a cell that moved
        // by the same interval and kept every other field.
        const echo = (d: string) => {
          const m = /^(\d+):(\d+):(\d+) (-?\d+)\/(.*) -> (-?\d+)\/(.*)$/.exec(d);
          const from = m ? noteValueToPitch(+m[4]) : null, to = m ? noteValueToPitch(+m[6]) : null;
          return !!m && m[5] === m[7] && from !== null && to !== null && to - from === delta;
        };
        // The edited cell itself is checked by its note below: a format whose instrument IS the note's record
        // (Digital Sonix & Chrome) answers an edited pitch with the record that plays it.
        const stray = gridDiff(want, back).filter((d) => !echo(d) && !d.startsWith(`${at!.p}:${at!.ch}:${at!.r} `));
        expect(stray.length, stray.slice(0, 6).join(' ; ')).toBe(0);
        expect(back.patterns[at!.p].channels[at!.ch].rows[at!.r].note, 'the edited cell shows the edit').toBe(note);

        // The sound: the edit is heard, only on the voices whose cells changed, and it is a change of pitch.
        const touched = new Set<number>([at!.ch]);
        const changed = gridDiff(before, back);
        for (const d of changed) touched.add(+d.split(':')[1]);
        // A shared track moves a voice whose grid cell sits at the end of the note range (the grid clamps
        // a pitch it cannot name, so the echo is real but not shown): that voice may change too.
        for (const row of [at!, ...changed.map((d) => { const [p, , r] = d.split(' ')[0].split(':').map(Number); return { p, r }; })]) {
          before.patterns[row.p]?.channels.forEach((c, v) => { const n = c.rows[row.r]?.note; if (n === 1 || n === 96) touched.add(v); });
        }
        const was = await originalTrace(fmt.rig, rel, bytes, fmt.uadeName?.(name) ?? name);
        if (!was) return;
        const now = (await traceOf(fmt.rig, out!, fmt.uadeName?.(name) ?? name))!;
        if (process.env.G16_DEBUG) {
          const dif: number[] = [];
          for (let i = 0; i < Math.min(out!.length, bytes.length); i++) if (out![i] !== bytes[i]) dif.push(i);
          console.log('[edit]', rel, JSON.stringify(at), 'old', JSON.stringify(old), 'bytes differing', dif.length, dif.slice(0, 6).map((i) => `${i}:${bytes[i]}->${out![i]}`).join(' '), 'sizes', out!.length, bytes.length);
        }
        expect(traceDiff(was, now), 'the edit is heard').not.toBe('equal');
        expect(traceDiff(was, now, (v) => !touched.has(v), out!.length === bytes.length), `voices without a changed cell (${[...touched].join(',')} changed) play as before`).toBe('equal');
        if (!fmt.noteSelectsSample) expect(traceDiff(withoutPitch(was), withoutPitch(now)), 'only pitch changed').toBe('equal');
      }));
    }
  });
}

describe('native export round trip: the render stage ran', () => {
  it('names every file the replayer rig does not take (nothing is skipped quietly)', () => {
    expect(stats.renders, 'the replayers rendered (sentinel)').toBeGreaterThan(0);
    expect(FORMATS.filter((f) => f.held).map((f) => f.key), 'formats held out of the run').toEqual([]);
    expect([...NO_RIG].sort()).toEqual([...EXPECTED_NO_RIG].sort());
  });
});

describe('native export round trip: the status recorded in gridProvenance', () => {
  it('says fail exactly for the formats with a known defect, and covers every format of the table', () => {
    for (const fmt of FORMATS) {
      const known = Object.keys(KNOWN).some((k) => k === fmt.key || k.startsWith(`${fmt.key}|`));
      expect(EXPORT_ROUND_TRIP[fmt.key], fmt.key).toBe(fmt.held ? 'n/a' : known ? 'fail' : 'pass');
    }
    expect(Object.keys(EXPORT_ROUND_TRIP).sort()).toEqual(FORMATS.map((f) => f.key).sort());
  });
});
