/**
 * The Ben Daglish grid is what the replayer plays (grid-from-replayer-walk plan, unit U5; the bar of
 * "the DW treatment"). The grid is the 50 Hz tick timeline drawn from the walk in ben_daglish.c
 * (bd_walk), not a second reader in TypeScript. UADE running the original player is the independent
 * oracle, its Paula writes logged per 10 ms:
 *   1. every sample start UADE makes (pointer write, then period) has a grid note on that voice
 *      with the same pitch name (the period it plays, src/lib/amiga/periodNotes.ts);
 *   2. every grid note starts a sample in UADE on that voice, with the same pitch name (no stray notes);
 *   3. an instrument number names one sample: a Paula sample pointer is one grid instrument everywhere (a
 *      looped sample may start from several pointers, so the other direction does not hold);
 *   4. a voice that never sounds is empty; the rows are the song's ticks; the carriers still encode
 *      every track byte-for-byte (benDaglishRoundtrip.test.ts stays green).
 * One clock for the whole song is a fit (UADE's vblank jitters a few ms), checked tightly.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openUade, PaulaSession, PaulaNoteOns, PAULA_REG } from './gridOracle';
import { installWasmNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';
import { parseBenDaglishFile } from '@/lib/import/formats/BenDaglishParser';
import { walkBenDaglish, BD_WALK } from '@/lib/import/formats/BenDaglishWasmExtractor';
import { periodToNote } from '@/lib/amiga/periodNotes';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';

const SONGS = ['formats/mickey_mouse.bd', 'ben-daglish/motorhead-titleandingame.bd'];
const CHUNKS = 3000;         // 30 s of UADE
const TOL = 45;              // ms: one tick of jitter around the fitted clock
const SKIP_START = 120;      // ms: the log starts after the first ticks

let restore = () => {};
beforeAll(() => { restore = installWasmNodeFetch('bd', 'Bd'); });
afterAll(() => restore());

interface Onset { ms: number; note: number; ptr: number }
interface GridSong {
  songPositions: number[];
  patterns: Array<{ length: number; channels: Array<{ rows: Array<{ note: number; instrument: number }> }> }>;
  uadeVariableLayout?: UADEVariablePatternLayout;
  gridEstimated?: boolean;
}

async function uadeOnsets(bytes: Uint8Array, name: string): Promise<{ per: Onset[][]; lastMs: number }> {
  const mod = await openUade();
  const session = new PaulaSession(mod, bytes, name, { logBeforeLoad: false });
  const rule = [0, 1, 2, 3].map(() => new PaulaNoteOns('armed'));
  const hi = [0, 0, 0, 0], lo = [0, 0, 0, 0];
  const per: Onset[][] = [[], [], [], []];
  let lastMs = 0;
  for (let chunk = 1; chunk < CHUNKS; chunk++) {
    const writes = session.step();
    if (!writes) break;
    lastMs = chunk * 10;
    for (const w of writes) {
      if (w.voice > 3) continue;
      if (w.reg === PAULA_REG.LCH) hi[w.voice] = w.value;
      else if (w.reg === PAULA_REG.LCL) lo[w.voice] = w.value;
      const p = rule[w.voice].push(w);
      if (p !== null) per[w.voice].push({ ms: chunk * 10, note: periodToNote(p), ptr: ((hi[w.voice] << 16) | lo[w.voice]) >>> 0 });
    }
  }
  session.close();
  return { per, lastMs };
}

const gridNotes = (song: GridSong, v: number): Array<{ tick: number; note: number; instrument: number }> => {
  const out: Array<{ tick: number; note: number; instrument: number }> = [];
  let tick = 0;
  for (const pi of song.songPositions) {
    const p = song.patterns[pi];
    p.channels[v].rows.forEach((c, r) => { if (c.note) out.push({ tick: tick + r, note: c.note, instrument: c.instrument }); });
    tick += p.length;
  }
  return out;
};

describe.each(SONGS)('Ben Daglish grid against UADE (independent oracle): %s', (path) => {
  it('every sample start UADE makes is a grid note and every grid note starts one, with the same pitch and sample', { timeout: 120000 }, async () => {
    const bytes = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs', path)));
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const song = await parseBenDaglishFile(ab, path.split('/').pop()!) as unknown as GridSong;
    expect(song.gridEstimated, 'the grid matched the walk').toBeUndefined();
    expect(song.uadeVariableLayout, 'carriers on the layout').toBeTruthy();

    const walk = await walkBenDaglish(ab);
    expect(walk.events.some((e) => e.kind === BD_WALK.note), 'the replayer walk ran').toBe(true);
    expect(song.patterns.reduce((n, p) => n + p.length, 0), 'rows are the ticks of the walk').toBe(walk.ticks);

    const { per, lastMs } = await uadeOnsets(bytes, path.split('/').pop()!);
    const grid = [0, 1, 2, 3].map((v) => gridNotes(song, v));

    // one clock: UADE ms = k * tick*20 + b, fitted on the sample starts, the tolerance tightening
    let k = 1, b0 = 40;
    const pairs = (): Array<[number, number]> => {
      const out: Array<[number, number]> = [];
      for (let v = 0; v < 4; v++) for (const o of per[v]) {
        let best = Infinity, at = 0;
        for (const g of grid[v]) { const d = Math.abs(o.ms - (k * g.tick * 20 + b0)); if (d < best) { best = d; at = g.tick * 20; } }
        if (best <= 400) out.push([at, o.ms]);
      }
      return out;
    };
    for (const _ of [0, 1, 2]) {
      const xs = pairs();
      const mx = xs.reduce((a, c) => a + c[0], 0) / xs.length, my = xs.reduce((a, c) => a + c[1], 0) / xs.length;
      let sxy = 0, sxx = 0;
      for (const [x, y] of xs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
      k = sxy / sxx; b0 = my - k * mx;
    }
    expect(Math.abs(k - 1), 'UADE vblank is within 0.5 % of 50 Hz').toBeLessThan(0.005);
    const at = (tick: number): number => k * tick * 20 + b0;

    const bad: string[] = [];
    let matchedOnsets = 0, matchedNotes = 0;
    const instOfPtr = new Map<number, number>();
    for (let v = 0; v < 4; v++) {
      for (const o of per[v]) {
        if (o.ms < SKIP_START || o.ms > lastMs - 100) continue;
        const g = grid[v].filter((x) => Math.abs(at(x.tick) - o.ms) <= TOL).sort((a, b) => Math.abs(at(a.tick) - o.ms) - Math.abs(at(b.tick) - o.ms))[0];
        if (!g) { bad.push(`voice ${v + 1}: UADE starts a sample at ${o.ms} ms, the grid has no note there`); continue; }
        matchedOnsets++;
        if (g.note !== o.note) bad.push(`voice ${v + 1} tick ${g.tick}: grid note ${g.note}, UADE plays ${o.note}`);
        if (instOfPtr.has(o.ptr) && instOfPtr.get(o.ptr) !== g.instrument) bad.push(`voice ${v + 1} tick ${g.tick}: sample at ${o.ptr.toString(16)} is instrument ${instOfPtr.get(o.ptr)} elsewhere, ${g.instrument} here`);
        instOfPtr.set(o.ptr, g.instrument);
      }
      for (const g of grid[v]) {
        const ms = at(g.tick);
        if (ms < SKIP_START || ms > lastMs - 100) continue;
        if (!per[v].some((o) => Math.abs(o.ms - ms) <= TOL)) bad.push(`voice ${v + 1} tick ${g.tick}: the grid shows a note at ${Math.round(ms)} ms, UADE starts no sample there`);
        else matchedNotes++;
      }
      // a voice that never sounds is empty
      if (per[v].length === 0) expect(grid[v].length, `voice ${v + 1} never sounds in UADE`).toBe(0);
    }
    expect(matchedOnsets, 'sample starts compared').toBeGreaterThan(150);
    expect(matchedNotes, 'grid notes compared').toBeGreaterThan(150);
    expect(bad.slice(0, 10)).toEqual([]);
  });
});
