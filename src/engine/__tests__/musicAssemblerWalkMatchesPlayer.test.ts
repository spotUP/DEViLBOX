/**
 * Music Assembler: the walk (maWalk.ts) is the 68k player's walk.
 *
 * The oracle is the original player running in UADE (the module's own 68k code, called by Heikki Orsila's
 * ma.asm wrapper), seen through its Paula register log. Per voice (voice v plays on Paula channel
 * [0, 2, 3, 1][v], measured here: the position list index is MA_CHANNEL_MAP[v] and that maps through the table
 * once more) the walk predicts the period and volume of every tick the voice is updated on:
 *  1. every (period, volume) pair the player writes is the walk's, in order, for every tick UADE plays (a note
 *     start, an envelope, a portamento, a vibrato, an arpeggio's volume steps are all in them);
 *  2. the player's tick is 50 Hz: the pairs fall on the walk's ticks at 2 chunks of 10 ms each;
 *  3. a note that restarts the voice writes its sample's address and length on the first update after its
 *     event: the length is the instrument's sample length (a wave's loop length), the address is the same
 *     load address plus the sample's file offset for every PCM sample (a wrong instrument is a wrong sample);
 *     a legato note on a sampled wave writes no sample address.
 * Found by this oracle, against ma-wasm: the ADSR's peak compare and the arpeggio's counter compare are strictly
 * greater (not greater or equal), and the vibrato's accumulated offset stays in the period through a portamento.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { MA_FILES, MA_SONGS, withReleases } from './maOracle';
import { openUade, PaulaSession, PAULA_REG, oracleStats, type PaulaLogModule } from './gridOracle';
import { loadMaModule } from '@/lib/import/formats/maModule';
import { walkMusicAssembler, MA_WALK, type MaWalk } from '@/lib/import/formats/maWalk';

const SONGS = MA_SONGS;
const FILES = MA_FILES;

/** Seconds of UADE rendered at most per sub-song (UADE ends the song where its voices return to their start). */
const MAX_SECONDS = 400;
/** Paula channel voice v plays on. */
const HW = [0, 2, 3, 1] as const;

interface PaulaRec { chunk: number; per: number; vol: number; lcl: number | null; lch: number | null; len: number | null }

/** Per Paula channel the register writes grouped by the update that made them: pointer and length writes, then the period, then the volume. */
function playOriginal(mod: PaulaLogModule, bytes: Uint8Array, name: string, tableIndex: number, seconds: number): { recs: PaulaRec[][]; chunks: number; endedAt: number | null } {
  const s = new PaulaSession(mod, bytes, name, { subsong: tableIndex });
  if (tableIndex === 1) mod._uade_wasm_set_subsong(1);
  const recs: PaulaRec[][] = [[], [], [], []];
  const pending: Array<{ lcl: number | null; lch: number | null; len: number | null }> = [0, 1, 2, 3].map(() => ({ lcl: null, lch: null, len: null }));
  let chunk = 0;
  const feed = (ws: Array<{ voice: number; reg: number; value: number }>): void => {
    for (const w of ws) {
      if (w.voice > 3) continue;
      const p = pending[w.voice];
      if (w.reg === PAULA_REG.LCL) p.lcl = w.value;
      else if (w.reg === PAULA_REG.LCH) p.lch = w.value;
      else if (w.reg === PAULA_REG.LEN) p.len = w.value;
      else if (w.reg === PAULA_REG.PER) { recs[w.voice].push({ chunk, per: w.value, vol: -1, ...p }); pending[w.voice] = { lcl: null, lch: null, len: null }; }
      else if (w.reg === PAULA_REG.VOL && recs[w.voice].length) recs[w.voice][recs[w.voice].length - 1].vol = w.value;
    }
  };
  feed(s.drain());
  let endedAt: number | null = null;
  for (; chunk < seconds * 100; ) { const ws = s.step(); if (!ws) { endedAt = chunk; break; } chunk++; feed(ws); }
  s.close();
  return { recs, chunks: chunk, endedAt };
}

let mod: PaulaLogModule;
beforeAll(async () => { mod = await openUade(); });
afterAll(() => { try { (mod as unknown as { _uade_wasm_cleanup(): void })._uade_wasm_cleanup(); } catch { /* ignore */ } });

/** Hold the walk of sub-song `si` of a module to the player in UADE; returns what was compared. */
function compareToPlayer(bytes: Uint8Array, name: string, si: number): { walk: MaWalk; compared: number; hz: number; chunks: number; ended: boolean; bad: string[] } {
  const m = loadMaModule(bytes)!;
  const walk = walkMusicAssembler(m, si)!;
  expect(walk).toBeTruthy();
  const tableIndex = m.subSongs[si].tableIndex;
  const seconds = Math.min(MAX_SECONDS, (walk.ticks / 50) + 2);
  const before = oracleStats.writes;
  const o = playOriginal(mod, bytes, name, tableIndex, seconds);
  expect(oracleStats.writes - before, 'the Paula log ran').toBeGreaterThan(100);
  // UADE's last writes are the song end (EndSound mutes the voices): not the player's
  const drop = o.endedAt !== null ? 12 : 0;
  const bad: string[] = [];
  const pairs: Array<[number, number]> = [];
  let compared = 0;
  const base: number[] = [];
  for (let v = 0; v < 4; v++) {
    const got = o.recs[HW[v]].slice(1, o.recs[HW[v]].length - drop); // the first write is the init
    const exp = walk.writes[v];
    const n = Math.min(got.length, exp.length);
    let k = 0;
    for (; k < n; k++) {
      if (got[k].per !== exp[k].period || got[k].vol !== exp[k].volume) {
        bad.push(`voice ${v} write ${k} (tick ${exp[k].tick}): the player wrote period ${got[k].per} volume ${got[k].vol}, the walk ${exp[k].period} / ${exp[k].volume}`);
        break;
      }
      pairs.push([exp[k].tick, got[k].chunk]);
    }
    compared += k;
    // the sample of every note whose first update is among the compared writes
    for (const e of walk.events) {
      if (e.voice !== v || e.kind !== MA_WALK.note) continue;
      const kk = exp.findIndex((w) => w.tick > e.tick);
      if (kk < 0 || kk >= k) continue;
      const ins = m.instruments[e.instr];
      const sample = m.samples[ins.sampleNumber];
      const rec = got[kk];
      const hasData = sample.dataOffset >= 0;
      const synth = hasData && sample.lengthWords <= 128;
      if (rec.len === null || rec.lcl === null) { bad.push(`voice ${v} note at tick ${e.tick}: no sample address written on its first update`); break; }
      const wantLen = !hasData ? 1 : synth ? Math.max(sample.loopLengthWords, 1) : sample.lengthWords;
      // an empty sample plays the player's own 2-word silence
      if (hasData && rec.len !== wantLen) { bad.push(`voice ${v} note at tick ${e.tick}: sample length ${rec.len} words, instrument ${e.instr} has ${wantLen}`); break; }
      if (hasData && !synth) {
        const ptr = ((rec.lch ?? 0) << 16) | rec.lcl;
        if (base.length === 0) base.push(ptr - sample.dataOffset);
        else if (ptr - sample.dataOffset !== base[0]) { bad.push(`voice ${v} note at tick ${e.tick}: sample at ${ptr - base[0]}, instrument ${e.instr}'s is at file offset ${sample.dataOffset}`); break; }
      }
    }
    // a legato note on a sampled wave writes no sample address (a synthesised wave is re-pointed every tick)
    for (const e of walk.events) {
      if (e.voice !== v || e.kind !== MA_WALK.legato || e.synth) continue;
      const kk = exp.findIndex((w) => w.tick > e.tick);
      if (kk < 0 || kk >= k) continue;
      if (got[kk].lcl !== null) { bad.push(`voice ${v} legato note at tick ${e.tick}: the player wrote a sample address`); break; }
    }
  }
  // the tick: the chunk of each write against its tick, over the whole run
  const nn = pairs.length;
  const mx = pairs.reduce((a, p) => a + p[0], 0) / nn, my = pairs.reduce((a, p) => a + p[1], 0) / nn;
  const sxx = pairs.reduce((a, p) => a + (p[0] - mx) ** 2, 0), sxy = pairs.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0);
  const slope = sxy / sxx;
  if (Math.abs(slope - 2) > 0.002) bad.push(`tick length: ${slope.toFixed(5)} chunks (${(100 / slope).toFixed(3)} Hz), the replayer ticks at 50 Hz = 2`);
  return { walk, compared, hz: 100 / slope, chunks: o.chunks, ended: o.endedAt !== null, bad };
}

describe('Music Assembler: the walk is the 68k player\'s walk', () => {
  it('the corpus has the owner modules', () => {
    expect(FILES.some((f) => f.endsWith('baseheads.ma'))).toBe(true);
    expect(FILES.some((f) => f.endsWith('thanatos.ma'))).toBe(true);
  });

  describe.each(FILES.map((f) => [f.slice(SONGS.length + 1), f] as const))('%s', (_rel, file) => {
    const bytes = new Uint8Array(readFileSync(file));
    const name = file.split('/').pop()!;
    const m = loadMaModule(bytes)!;

    it.each(m.subSongs.map((s, i) => [i, s.tableIndex] as const))('sub-song %i (table %i): every period and volume the player writes, the sample of every note, and the 50 Hz tick are the walk\'s', (si) => {
      const r = compareToPlayer(bytes, name, si);
      console.log(`ROW Music Assembler | ${name} sub ${si} | ${r.walk.rows} rows ${r.walk.stop}${r.walk.loopRow >= 0 ? ' at ' + r.walk.loopRow : ''}, ${r.walk.speed} ticks/row | ${r.chunks} chunks${r.ended ? ' (UADE ends)' : ''} | writes compared ${r.compared}, ${r.hz.toFixed(3)} Hz`);
      expect(r.compared, 'writes compared').toBeGreaterThan(500);
      expect(r.bad, r.bad.join('\n')).toEqual([]);
    }, 900_000);

    /** The corpus has no release event: note events of releasing instruments turned into releases (maOracle.withReleases). */
    it('release events (note events of releasing instruments turned into releases) are the player\'s too', () => {
      const { bytes: broken, turned } = withReleases(bytes);
      expect(turned, 'note events turned into releases').toBeGreaterThan(2);
      const w2 = walkMusicAssembler(loadMaModule(broken)!, 0)!;
      expect(w2.events.filter((e) => e.kind === MA_WALK.release).length, 'the walk reads release events').toBeGreaterThan(2);
      const r = compareToPlayer(broken, name, 0);
      console.log(`ROW Music Assembler releases | ${name} | ${turned} releases, writes compared ${r.compared}`);
      expect(r.compared).toBeGreaterThan(500);
      expect(r.bad, r.bad.join('\n')).toEqual([]);
    }, 900_000);
  });
});
