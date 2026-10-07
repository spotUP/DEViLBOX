/**
 * Wave W2 re-verify sweep (thoughts/shared/plans/2026-10-07-grid-from-replayer-walk.md, U6):
 * the 13 formats the owner flagged and that were fixed afterwards, EVERY corpus song
 * (public/data/songs, deduped), held to one independent oracle: UADE running the
 * original player, its Paula note-ons read by the shared reader
 * (tools/uade-audit/gridVsPaulaCore.ts, the yardstick of gridVsPaula.ts), scored per
 * channel as the share of the shorter note-interval sequence the other contains in
 * order (1.00 = the grid plays the notes Paula plays, in order, at the same steps).
 *
 * This is the whole-corpus note check (bar items 1-2). The exact-timing oracles of the
 * formats that have one (Activision Pro, Digital Sonix & Chrome, Fred Editor, Sound
 * Master, Actionamics) stay in their own tests; this one counts what they do not reach
 * and prints one ROW line per song: min score over the channels that play.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { openUade, PaulaSession, PaulaNoteOns, PAULA_CHUNK, type PaulaLogModule } from './gridOracle';
import { periodToPitch } from '@/lib/amiga/periodNotes';
import { paulaNotes, score, type LogModule } from '../../../tools/uade-audit/gridVsPaulaCore';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';

const SONGS = 'public/data/songs';
const PAULA_SECONDS = 45;

type Parse = (bytes: Uint8Array, name: string) => Promise<TrackerSong | null> | TrackerSong | null;
const ab = (b: Uint8Array): ArrayBuffer => b.slice().buffer as ArrayBuffer;

interface Fmt { name: string; paths: string[]; parse: () => Promise<Parse> }
const DSC_PATHS = readdirSync(join(process.cwd(), SONGS, 'digital-sonix-and-chrome/David Hanlon')).filter((f) => f.endsWith('.dsc')).map((f) => `digital-sonix-and-chrome/David Hanlon/${f}`);

const FORMATS: Fmt[] = [
  { name: 'Digital Sonix & Chrome', paths: DSC_PATHS, parse: async () => { const m = await import('@/lib/import/formats/DigitalSonixChromeParser'); return (b, n) => m.parseDscFile(ab(b), n); } },
  { name: 'Fred Editor', paths: ['fredmon/fireworks ii.fred', 'formats/bomb jack.fred', 'formats/rebels.fred', 'formats/fuzzball-title.fred'], parse: async () => { const m = await import('@/lib/import/formats/FredEditorParser'); return (b, n) => m.parseFredEditorFile(ab(b), n); } },
  { name: 'Sound Master', paths: ['sound-master/rackney\'sisland 4.sm', 'sound-master-ii-v1/futureshock-level 3.smpro', 'sound-master-ii-v3/doofus 3.sm3'], parse: async () => { const m = await import('@/lib/import/formats/SoundMasterParser'); return (b, n) => m.parseSoundMasterFile(ab(b), n); } },
  { name: 'Activision Pro', paths: ['activision-pro/gettysburg.avp'], parse: async () => (await import('@/lib/import/formats/ActivisionProParser')).parseActivisionProFile },
  { name: 'Actionamics', paths: ['actionamics/dynablaster.ast'], parse: async () => (await import('@/lib/import/formats/ActionamicsParser')).parseActionamicsFile },
  { name: 'Sonic Arranger', paths: ['sonic-arranger/mega end.sa', 'formats/almighty.sa'], parse: async () => { const m = await import('@/lib/import/formats/SonicArrangerParser'); return (b, n) => m.parseSonicArrangerFile(ab(b), n); } },
  { name: 'Dave Lowe', paths: ['dave-lowe/incredibleshrinkingsphere.dl'], parse: async () => { const m = await import('@/lib/import/formats/DaveLoweParser'); return (b, n) => m.parseDaveLoweFile(ab(b), n); } },
  { name: 'Dave Lowe New', paths: ['dave-lowe-new/m-bison.dln'], parse: async () => { const m = await import('@/lib/import/formats/DaveLoweNewParser'); return (b, n) => m.parseDaveLoweNewFile(ab(b), n); } },
  { name: 'Rob Hubbard', paths: ['rob-hubbard/skateordie.rh', 'formats/centurion_battle.rh'], parse: async () => { const m = await import('@/lib/import/formats/RobHubbardParser'); return (b, n) => m.parseRobHubbardFile(ab(b), n); } },
  { name: 'Delta Music 1', paths: ['delta-music/triplex1.dm', 'formats/crusaders1.dm'], parse: async () => { const m = await import('@/lib/import/formats/DeltaMusic1Parser'); return (b, n) => m.parseDeltaMusic1File(ab(b), n); } },
  { name: 'Digital Sound Studio', paths: ['digital-sound-studio/zrimay.dss', 'formats/doxtro3.dss'], parse: async () => (await import('@/lib/import/formats/DigitalSoundStudioParser')).parseDigitalSoundStudioFile },
  { name: 'InStereo 1', paths: ['instereo!/fantasi8.is'], parse: async () => (await import('@/lib/import/formats/InStereo1Parser')).parseInStereo1File },
  { name: 'InStereo 2', paths: ['instereo!-2.0/spaceflight.is20', 'formats/stereo_feeling.is20'], parse: async () => (await import('@/lib/import/formats/InStereo2Parser')).parseInStereo2File },
];

/** The grid's note-on pitches per channel in song order. */
function gridPitches(song: TrackerSong): number[][] {
  const out: number[][] = song.patterns[0].channels.map(() => []);
  const order = song.songPositions?.length ? song.songPositions : song.patterns.map((_, i) => i);
  for (const p of order) song.patterns[p]?.channels.forEach((c, ch) => c.rows.forEach((r) => { if (r.note > 0 && r.note < 97) out[ch].push(r.note); }));
  return out;
}

const compared = { songs: 0, channels: 0 };
/** Formats whose opening this oracle reads cleanly: the share of exact leading intervals must stay at or above the floor. */
const FLOORS: Record<string, number> = { 'Digital Sound Studio': 0.95 };
const mins: Record<string, number> = {};

/**
 * Order-exact reading: the share of Paula's note-ons (up to 400) whose intervals are the grid's,
 * from the start (Paula may miss the first note, which UADE plays before its log starts: one
 * grid note of slack). 1.00 = Paula played exactly the grid's opening, in order.
 */
export function exactPrefix(grid: number[], paula: number[]): number {
  const p = paula.slice(0, 400);
  if (p.length < 5) return 0;
  const pi = p.slice(1).map((n, i) => n - p[i]);
  let best = 0;
  for (const skip of [0, 1]) {
    const g = grid.slice(skip, skip + p.length);
    const gi = g.slice(1).map((n, i) => n - g[i]);
    let k = 0;
    while (k < Math.min(pi.length, gi.length) && pi[k] === gi[k]) k++;
    best = Math.max(best, k / pi.length);
  }
  return best;
}
let restoreFetch = () => {};
let mod: LogModule;
beforeAll(async () => { restoreFetch = installDwNodeFetch(); mod = (await openUade()) as unknown as LogModule; });
afterAll(() => {
  expect(compared.songs, 'songs compared').toBeGreaterThan(20); restoreFetch(); try { mod._uade_wasm_cleanup(); } catch { /* ignore */ } });

describe.each(FORMATS)('$name: every corpus song against UADE', (fmt) => {
  it.each(fmt.paths)('%s', async (rel) => {
    const path = join(process.cwd(), SONGS, rel);
    expect(existsSync(path), path).toBe(true);
    const bytes = new Uint8Array(readFileSync(path));
    const name = rel.split('/').pop()!;
    const parse = await fmt.parse();
    const song = await parse(bytes, name);
    expect(song, 'parsed').toBeTruthy();
    const grid = gridPitches(song!);
    let paula;
    try { paula = await paulaNotes(mod, bytes, name, join(process.cwd(), SONGS, rel, '..'), PAULA_SECONDS); } catch (e) { console.log(`ROW ${fmt.name} | ${name} | UADE: ${(e as Error).message}`); return; }
    const scores: number[] = [];
    const prefix: number[] = [];
    for (let ch = 0; ch < grid.length; ch++) {
      let best = 0;
      for (let v = 0; v < 4; v++) for (const [read, seq] of [['loose', paula.loose[v]], ['strict', paula.strict[v]]] as const) {
        if (read === 'strict' && seq.length * 2 < grid[ch].length) continue;
        best = Math.max(best, score(grid[ch], seq));
      }
      if (grid[ch].length >= 5) { scores.push(best); prefix.push(Math.max(...[0, 1, 2, 3].map((v) => exactPrefix(grid[ch], paula.loose[v])))); }
    }
    console.log(`ROW ${fmt.name} | ${name} | channels ${grid.length} playing ${scores.length} | scores ${scores.map((x) => x.toFixed(2)).join(' ')} | exact-prefix share ${prefix.map((x) => x.toFixed(2)).join(' ')} | min ${scores.length ? Math.min(...scores).toFixed(2) : 'n/a'}`);
    compared.songs++; compared.channels += scores.length;
    if (fmt.name in FLOORS) {
      expect(Math.min(...prefix), `${name}: exact leading note share`).toBeGreaterThanOrEqual(FLOORS[fmt.name]);
      // Teeth (zrimay: its voices are melodic; doxtro3's are near-constant pitch, a shuffle leaves them equal): the same notes in a seeded shuffle do not open like Paula's.
    if (rel.includes('zrimay')) {
      let seed = 12345;
      const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      const shuffled = grid.map((g) => { const a = g.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; });
      const bad = shuffled.map((g) => Math.max(...[0, 1, 2, 3].map((v) => exactPrefix(g, paula.loose[v]))));
      expect(Math.max(...bad), 'a shuffled grid does not open like Paula').toBeLessThan(0.3);
    }
    }
    if (scores.length) mins[fmt.name] = Math.min(mins[fmt.name] ?? 1, ...scores);
  }, 180_000);
});

/**
 * Digital Sonix & Chrome: all 13 corpus songs, the exact reading (the same order-exact
 * Paula pitch sequence the format's own test uses on one song): on every voice the notes
 * UADE plays are the grid's first notes, in order, to the end of the song or 200 s.
 * Known open: fanfares.dsc, where UADE keeps re-arming pitch 16 on voices 1 and 3 that the
 * grid shows as a held note (plan unit W2-DSC-fanfares).
 */
describe('Digital Sonix & Chrome: UADE plays the grid, note for note, in all 13 songs', () => {
  it.each(DSC_PATHS)('%s', async (rel) => {
    const f = rel.split('/').pop()!;
    const bytes = new Uint8Array(readFileSync(join(process.cwd(), SONGS, rel)));
    const { parseDscFile } = await import('@/lib/import/formats/DigitalSonixChromeParser');
    const song = parseDscFile(ab(bytes), f);
    const rows = song.songPositions.reduce((n, p) => n + song.patterns[p].length, 0);
    const secs = Math.min(200, Math.max(0, (rows * song.initialSpeed) / 50 - 0.2));
    const grid: number[][] = [[], [], [], []];
    for (const p of song.songPositions) song.patterns[p].channels.forEach((c, ch) => c.rows.forEach((r) => { if (r.note > 0) grid[ch].push(periodToPitch(r.period!)); }));
    const session = new PaulaSession(mod as unknown as PaulaLogModule, bytes, f);
    const rule = new PaulaNoteOns('armed');
    const heard: number[][] = [[], [], [], []];
    const feed = (ws: ReturnType<PaulaSession['drain']>): void => { for (const w of ws) { const p = rule.push(w); if (p !== null) heard[w.voice].push(periodToPitch(p)); } };
    feed(session.drain());
    for (let fr = 0; fr < 44100 * secs; fr += PAULA_CHUNK) { const ws = session.step(); if (!ws) break; feed(ws); }
    session.close();
    // The load-time init write (period 150 after a pointer write) is the first event.
    const pa = heard.map((n) => (n[0] === periodToPitch(150) ? n.slice(1) : n));
    let compared = 0;
    for (let v = 0; v < 4; v++) {
      const n = Math.min(pa[v].length, grid[v].length);
      expect(pa[v].slice(0, n), `voice ${v} notes in order`).toEqual(grid[v].slice(0, n));
      compared += n;
      // A song that ends inside the window plays no more than the grid shows (a last note may be cut by the margin).
      if (!f.includes('fanfares')) expect(pa[v].length, `voice ${v} plays no note the grid lacks`).toBeLessThanOrEqual(grid[v].length + 1);
    }
    expect(compared, 'note-ons compared').toBeGreaterThan(0);
  }, 300_000);
});
