/**
 * Future Player: the walk (fpWalk.ts) is the 68k player's own walk.
 *
 * The oracle is the original player running in UADE (the EaglePlayer from Wanted Team's
 * Future Player_v1.asm). Its four 190-byte voice records sit in the player's BSS; they are found
 * by their Paula base words (00DFF0A0.. with the DMA masks 8001..8008 behind them) and read every
 * 10 ms chunk. For EVERY corpus module and EVERY subsong:
 *
 *  1. every retriggered note the walk shows is a note the player starts (its DMA trigger flag
 *     +$A5 rises at the read and falls when the voice's update ran), in order, with the table
 *     period the walk names it by (the period the update writes, +$A0, before modulation and detune);
 *  2. the player's tick is the module's own CIA timer, not 50 Hz: the starts fall on the walk's
 *     ticks at the rate the timer gives, to a tick's accuracy over the whole run;
 *  3. after every read pass, every voice's record is the walk's state: stream position (+$A6), note
 *     (+$9E), trigger (+$A4), duration left (+$9F), instrument (+$68), arpeggio table (+$70), portamento
 *     (+$76), both transposes (+$94, +$95), and the end flag (+$01) where the walk ends the voice.
 * A read that repeats a note at the same stream position (a repeat loop) moves no pointer: the
 * state check, not a pointer-change detector, is what sees it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { openUade, oracleStats, type PaulaLogModule } from './gridOracle';
import { playOriginal, passStates, alignPasses } from './fpOracle';
import { fpCodeSection, fpSongs, FP_PERIODS } from '@/lib/import/formats/fpWalk';

/** Seconds of UADE rendered at most per subsong (the whole subsong when it ends sooner); UADE's own play time ends at 512 s and restarts the song. */
const MAX_SECONDS = 500;

const SONGS = join(process.cwd(), 'public/data/songs');
function corpus(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) corpus(p, out);
    else if (f.toLowerCase().endsWith('.fp')) out.push(p);
  }
  return out;
}
/** The same module sits in two corpus folders: compare each distinct file once. */
const FILES = (() => {
  const seen = new Map<string, string>();
  for (const f of corpus(SONGS).sort()) {
    const key = readFileSync(f).toString('base64');
    if (!seen.has(key)) seen.set(key, f);
  }
  return [...seen.values()];
})();

let mod: PaulaLogModule;
beforeAll(async () => { mod = await openUade(); });
afterAll(() => { try { (mod as unknown as { _uade_wasm_cleanup(): void })._uade_wasm_cleanup(); } catch { /* ignore */ } });

describe('Future Player: the walk is the 68k player\'s walk', () => {
  it('the corpus holds the owner modules', () => {
    expect(FILES.some((f) => f.endsWith('hybris.fp'))).toBe(true);
    expect(FILES.some((f) => f.includes('imploder'))).toBe(true);
  });

  describe.each(FILES.map((f) => [f.slice(SONGS.length + 1), f] as const))('%s', (_rel, file) => {
    const bytes = new Uint8Array(readFileSync(file));
    const code = fpCodeSection(bytes);
    const name = file.split('/').pop()!;
    const subsongs = fpSongs(code);

    it.each(subsongs.map((_s, i) => i))('subsong %i: every voice\'s record after every read pass, the tick length and the periods are the walk\'s', (sub) => {
      const { walk, passes } = passStates(code, sub);
      const speed = walk.speed;
      const cpt = 100 / walk.tickHz;
      const secs = Math.min(MAX_SECONDS, walk.ticks / walk.tickHz + 2);
      const before = oracleStats.writes;
      const o = playOriginal(mod, bytes, name, sub, secs);
      expect(oracleStats.writes - before, 'the Paula log ran').toBeGreaterThan(10);
      const bad: string[] = [];
      const ctx = (m: string): void => { if (bad.length < 12) bad.push(m); };
      const horizon = o.endedAt === null ? o.chunks.length : o.endedAt - 3;

      const al = alignPasses(o, walk, passes, horizon);
      if (al.lostAt) ctx(`chunk ${al.lostAt.chunk}: the player's records are no pass of the walk from pass ${al.lostAt.pass} on (next: ${al.lostAt.why})`);
      const { reached, flux } = al;
      let checked = 0, periodChecks = 0;
      const reachedUpdate = [false, false, false, false];
      for (let c = 0; c < al.passAt.length && bad.length < 12; c++) {
        const p = al.passAt[c];
        if (p < 0) continue;
        checked++;
        // the period of a voice is a period of its pass (or of the pass before: its update lags the read by up to three chunks)
        for (let v = 0; v < 4; v++) {
          const here = passes[p].periods[v], prev = p > 0 ? passes[p - 1].periods[v] : [];
          if (here.length === 0) continue;
          const per = o.chunks[c][v].period;
          // before the voice's first update its period is the player's initial one
          if (p === 0 && !reachedUpdate[v] && (per === 0 || per === 0x1c40)) continue;
          // the update of a pass lands up to three chunks after its read: until then the voice still has the period of the pass before, which the walk does not model when that was a slide or a wavetable
          const sinceReached = c - (reached.find((r) => r[0] === p)?.[1] ?? c);
          if (prev.length === 0 && sinceReached <= 3) continue;
          reachedUpdate[v] = true;
          periodChecks++;
          const w = passes[p].st[v];
          if (!here.includes(per) && !prev.includes(per)) ctx(`pass ${p} voice ${v}, chunk ${c}: period ${per}, the walk's ticks give ${here.join('/')} (before: ${prev.join('/')}) [note ${w.curNote} transposes ${w.t1},${w.t2} arpeggio ${w.arp} instrument ${w.instr}; the player: arpeggio ${o.chunks[c][v].arp - o.codeBase} at ${o.chunks[c][v].arpIdx}]`);
        }
      }
      // the tick length: the chunk each pass was reached at against the pass number, over the whole run
      let rate = 0;
      if (reached.length > 8) {
        const n = reached.length;
        const mx = reached.reduce((a, r) => a + r[0], 0) / n, my = reached.reduce((a, r) => a + r[1], 0) / n;
        const sxx = reached.reduce((a, r) => a + (r[0] - mx) ** 2, 0), sxy = reached.reduce((a, r) => a + (r[0] - mx) * (r[1] - my), 0);
        rate = sxy / sxx / speed; // chunks per tick
        if (Math.abs(rate / cpt - 1) > 0.004) ctx(`tick length: the player's is ${rate.toFixed(4)} chunks (${(100 / rate).toFixed(3)} Hz), the module's timer gives ${cpt.toFixed(4)} (${walk.tickHz.toFixed(3)} Hz)`);
      }
      const pairs = reached.length;
      console.log(`ROW Future Player | ${name} sub ${sub + 1} | ${walk.rows} rows ${walk.stop}${walk.loopRow >= 0 ? ' at ' + walk.loopRow : ''}, ${speed} ticks/row at ${walk.tickHz.toFixed(2)} Hz (player ${rate > 0 ? (100 / rate).toFixed(2) : '-'}) | ${horizon} chunks, ${pairs} passes reached (of ${passes.length}), ${checked} records, ${flux} in flux, ${periodChecks} periods`);
      expect(checked, 'chunks whose four records are a pass of the walk').toBeGreaterThan(5);
      expect(flux, 'chunks caught mid-read').toBeLessThanOrEqual(Math.ceil(horizon * 0.3));
      expect(bad, bad.join('\n')).toEqual([]);
    }, 900_000);
  });

  it('the period table is the player\'s (97 entries, falling)', () => {
    expect(FP_PERIODS).toHaveLength(97);
    for (let i = 1; i < 97; i++) expect(FP_PERIODS[i]).toBeLessThan(FP_PERIODS[i - 1]);
  });

  it('the period table is the one in the player\'s source (Future Player_v1.asm lbW0036C4)', () => {
    const asm = readFileSync(join(process.cwd(), 'third-party/uade-3.05/amigasrc/players/wanted_team/FuturePlayer/Future Player_v1.asm'), 'latin1').split('\n');
    const from = asm.findIndex((l) => l.startsWith('lbW0036C4'));
    const to = asm.findIndex((l) => l.startsWith('lbL003786'));
    expect(from).toBeGreaterThan(0);
    const values: number[] = [];
    for (const l of asm.slice(from, to)) for (const m of l.matchAll(/dc\.w\s+\$([0-9A-Fa-f]+)/g)) values.push(parseInt(m[1], 16));
    expect(FP_PERIODS).toEqual(values);
  });
});
