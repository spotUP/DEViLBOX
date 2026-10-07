/**
 * The Activision Pro grid is what UADE's own Activision Pro player plays
 * (owner, 2026-10-06: "activision pro has bogus pattern data").
 *
 * The old grid read the second byte of each track event as "note index in six
 * bits + instrument in two", cut every track at 64 rows and stacked the tracks
 * of a position list; the format is an event stream with its own durations per
 * voice. The independent oracle is UADE running the original eagleplayer, its
 * Paula writes (AUDxPER) logged per 10 ms:
 *   1. a note that starts a sample writes period 126 first (the player's
 *      retrigger): every such write is the start of a grid event and every
 *      grid event that starts a sample is such a write - on one clock
 *      (UADE's vblank is not exactly 50 Hz: fitted, then checked tightly);
 *   2. the first period UADE writes for an event is the grid cell's note;
 *   3. the grid ends where UADE's song ends.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openUade, PaulaSession } from './gridOracle';
import { decodeActivisionProModule } from '@/lib/import/formats/ActivisionProModule';
import { walkActivisionPro, avpStepTicks, AVP_ROWS_PER_PATTERN, type AvpEventStart } from '@/lib/import/formats/activisionProGrid';
import { parseActivisionProFile } from '@/lib/import/formats/ActivisionProParser';

/** One clock for the whole song is a fit (UADE's vblank jitters a few ms); sample starts are at least 60 ms apart, so the nearest one within this is the one. */
const TOL = 45;
const SONG = 'public/data/songs/activision-pro/gettysburg.avp';

/** UADE's period writes per voice: [ms, period]. */
async function uadePeriods(bytes: Uint8Array): Promise<number[][][]> {
  const mod = await openUade();
  const session = new PaulaSession(mod, bytes, 'gettysburg.avp', { logBeforeLoad: false });
  const per: number[][][] = [[], [], [], []];
  for (let chunk = 1; chunk < 19500; chunk++) {
    const writes = session.step();
    if (!writes) break;
    for (const w of writes) if (w.reg === 3 && w.voice < 4) per[w.voice].push([chunk * 10, w.value]);
  }
  mod._uade_wasm_stop();
  return per;
}

/** The value nearest `x` within TOL, or undefined. */
function nearest(list: number[], x: number): number | undefined {
  let best: number | undefined;
  for (const o of list) if (Math.abs(o - x) <= TOL && (best === undefined || Math.abs(o - x) < Math.abs(best - x))) best = o;
  return best;
}

describe('Activision Pro grid against UADE (independent oracle)', () => {
  it('every event the grid shows starts where and as UADE plays it', { timeout: 120000 }, async () => {
    const bytes = new Uint8Array(readFileSync(join(__dirname, '../../../', SONG)));
    const m = decodeActivisionProModule(bytes)!;
    const walk = walkActivisionPro(m, 0);
    const ticks = avpStepTicks(m, 0, walk.rows);
    const per = await uadePeriods(bytes);

    const onsets = per.map((p) => p.filter(([, v]) => v === 126).map(([t]) => t));
    const events: { v: number; t: number; e: AvpEventStart }[] = [];
    walk.starts.forEach((col, v) => col.forEach((e, row) => { if (e) events.push({ v, t: ticks[row] * 20, e }); }));

    // 1. One clock: fit UADE ms = k * grid ms + b on the onsets, the tolerance tightening.
    let k = 1, b0 = 0;
    for (const tol of [400, 100, 30]) {
      const xs: number[] = [], ys: number[] = [];
      for (const { v, t, e } of events) {
        if (!e.retrigger || t < 200) continue;
        let best = Infinity, at = 0;
        for (const o of onsets[v]) { const d = Math.abs(o - (k * t + b0)); if (d < best) { best = d; at = o; } }
        if (best <= tol) { xs.push(t); ys.push(at); }
      }
      const mx = xs.reduce((a, c) => a + c, 0) / xs.length, my = ys.reduce((a, c) => a + c, 0) / ys.length;
      let sxy = 0, sxx = 0;
      for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
      k = sxy / sxx; b0 = my - k * mx;
    }
    const at = (t: number): number => k * t + b0;
    expect(Math.abs(k - 1), 'UADE vblank is within 0.5 % of 50 Hz').toBeLessThan(0.005);

    const lastMs = Math.max(...per.map((p) => (p.length ? p[p.length - 1][0] : 0)));
    const mismatches: string[] = [];
    let retriggers = 0, notes = 0;
    for (const { v, t, e } of events) {
      if (t < 200 || at(t) > lastMs - 100) continue;   // the log starts after the first tick
      if (e.retrigger) {
        retriggers++;
        if (nearest(onsets[v], at(t)) === undefined) mismatches.push(`step ${e.step} voice ${v}: grid starts a sample at ${Math.round(at(t))} ms, UADE does not`);
      }
      notes++;
      // A sample start's period is written within its first ticks (the tick of the retrigger
      // write itself still carries the old note's); a held note's, on its own tick.
      const o = e.retrigger ? nearest(onsets[v], at(t)) : undefined;
      const from = o !== undefined ? o : at(t) - TOL;
      const written = per[v].filter(([ms, val]) => val !== 126 && ms >= from && ms <= from + 70);
      const first = written.find(([, val]) => val === e.period) ?? written[0];
      if (!first || first[1] !== e.period) mismatches.push(`step ${e.step} voice ${v}: grid plays period ${e.period} (index ${e.index}), UADE ${first ? first[1] : 'nothing'}`);
    }
    for (let v = 0; v < 4; v++) {
      for (const o of onsets[v]) {
        if (o > lastMs - 100) continue;
        if (!events.some((x) => x.v === v && x.e.retrigger && Math.abs(at(x.t) - o) <= TOL)) mismatches.push(`voice ${v}: UADE starts a sample at ${o} ms, the grid has no event there`);
      }
    }
    expect(retriggers, 'sample starts compared').toBeGreaterThan(500);
    expect(notes, 'events compared').toBeGreaterThan(1000);
    expect(mismatches.slice(0, 10)).toEqual([]);

    // 3. The grid is as long as UADE's song.
    expect(Math.abs(at(ticks[walk.rows - 1] * 20) - lastMs), 'song length, ms').toBeLessThan(600);
  });

  it('the parsed song shows the walk: 64-row patterns of the same events', () => {
    const bytes = new Uint8Array(readFileSync(join(__dirname, '../../../', SONG)));
    const song = parseActivisionProFile(bytes, 'gettysburg.avp')!;
    const m = decodeActivisionProModule(bytes)!;
    const walk = walkActivisionPro(m, 0);
    expect(song.patterns.reduce((n, p) => n + p.length, 0)).toBe(walk.rows);
    let shown = 0, expected = 0;
    for (let v = 0; v < 4; v++) walk.starts[v].forEach((e, row) => {
      const p = Math.floor(row / AVP_ROWS_PER_PATTERN);
      const cell = song.patterns[p].channels[v].rows[row % AVP_ROWS_PER_PATTERN];
      if (e) { expected++; if (cell.note === e.cell.note && cell.instrument === e.cell.instrument) shown++; }
      else expect(cell.note, `row ${row} voice ${v} is a held row`).toBe(0);
    });
    expect(shown).toBe(expected);
  });
});
