/**
 * Future Player: the grid is the player's walk (plan 2026-10-07-grid-from-replayer-walk, U7).
 *
 * The walk itself is held to the original 68k player in UADE by futurePlayerWalkMatchesPlayer.test.ts
 * (every voice record after every read pass, the tick length of the module's CIA timer, the period of
 * every pass). This test holds the GRID to the walk, and the one grid decision the records can show to
 * the player:
 *  - for every corpus module the grid has, per voice and row, the note the walk starts (named by the
 *    table period it plays, instrument = the instrument pointer's slot), a legato note without an
 *    instrument, a note-off only where a rest releases a sounding voice whose instrument releases or
 *    where the voice ends, every command in the effect columns in the player's terms, silent voices empty;
 *  - the rows are the walk's rows, the loop restarts at the loop's first row, the tempo is the module's;
 *  - every instrument pointer the module sets has its slot and none has an invented name;
 *  - a rest is a note-off exactly where the player's envelope falls: with the instrument's release rate
 *    the voice's level (+$83) drops by that rate every tick of the rest; with rate 0 it holds (UADE);
 *  - a song whose notes cannot be named opens in the scope view with the reason, over an empty grid.
 * The wiring: parseFuturePlayerFile (the product's own parse) is the only way the grid is built here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { openUade, oracleStats, compareGridToWalk, walkStats, type PaulaLogModule, type WalkCell } from './gridOracle';
import { playOriginal, passStates, alignPasses } from './fpOracle';
import { parseFuturePlayerFile } from '@/lib/import/formats/FuturePlayerParser';
import {
  fpCodeSection, fpSongs, walkFuturePlayer, fpReleaseRate, FP_WALK,
} from '@/lib/import/formats/fpWalk';
import { fpLayout, fpTickPosition, fpPeriodToNote, fpOctaveBias, FP_ROWS_PER_PATTERN } from '@/lib/import/formats/fpGrid';
import { FP_FX } from '@/lib/import/formats/fpEffectGlyphs';
import { xmEffectToString } from '@/lib/xmConversions';
import { gridOpensInScopeView } from '@/lib/tracker/gridOpensInScopeView';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const SONGS = join(process.cwd(), 'public/data/songs');
function corpus(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) corpus(p, out);
    else if (f.toLowerCase().endsWith('.fp')) out.push(p);
  }
  return out;
}
const FILES = (() => {
  const seen = new Map<string, string>();
  for (const f of corpus(SONGS).sort()) {
    const key = readFileSync(f).toString('base64');
    if (!seen.has(key)) seen.set(key, f);
  }
  return [...seen.values()];
})();
const ab = (b: Uint8Array): ArrayBuffer => b.slice().buffer as ArrayBuffer;

let mod: PaulaLogModule;
beforeAll(async () => { mod = await openUade(); });
afterAll(() => { try { (mod as unknown as { _uade_wasm_cleanup(): void })._uade_wasm_cleanup(); } catch { /* ignore */ } });

describe('Future Player: the grid is the player\'s walk', () => {
  it('the corpus has the owner modules', () => {
    expect(FILES.some((f) => f.endsWith('hybris.fp'))).toBe(true);
    expect(FILES.length).toBeGreaterThanOrEqual(2);
  });

  describe.each(FILES.map((f) => [f.slice(SONGS.length + 1), f] as const))('%s', (_rel, file) => {
    const bytes = new Uint8Array(readFileSync(file));
    const code = fpCodeSection(bytes);
    const name = file.split('/').pop()!;
    const song = parseFuturePlayerFile(ab(bytes), name) as TrackerSong;
    const walk = walkFuturePlayer(code, 0)!;
    const ptrToId = new Map<number, number>();
    for (const ins of song.instruments) ptrToId.set((ins as unknown as { metadata: { fpInstrPtr: number } }).metadata.fpInstrPtr, ins.id);

    it('the grid is matched to the walk and holds the walk\'s rows, the loop and the module\'s tempo', () => {
      expect(song.gridUnmatchedReason, 'matched').toBeUndefined();
      expect(gridOpensInScopeView(song)).toBe(false);
      const total = song.patterns.reduce((n, p) => n + p.length, 0);
      expect(total).toBe(walk.rows);
      for (const p of song.patterns) expect(p.length).toBeLessThanOrEqual(FP_ROWS_PER_PATTERN);
      expect(song.initialSpeed).toBe(walk.speed);
      expect(song.initialBPM).toBeCloseTo(walk.tickHz * 2.5, 1);
      expect(song.songPositions).toEqual(song.patterns.map((_p, i) => i));
      const layout = fpLayout(walk);
      if (walk.stop === 'loop' && walk.loopRow > 0) {
        // the loop's first row starts a pattern, and the song restarts there
        let start = 0;
        for (let p = 0; p < song.restartPosition; p++) start += song.patterns[p].length;
        expect(start).toBe(walk.loopRow);
        expect(song.restartPosition).toBe(layout.restartPosition);
      } else expect(song.restartPosition).toBe(0);
    });

    it('per voice and row: the walk\'s note and instrument, note-off only where a voice stops, commands in the effect columns, silent voices empty', () => {
      const rows = walk.rows;
      const cells: WalkCell[][] = Array.from({ length: 4 }, () => Array.from({ length: rows }, () => ({ note: 0, instrument: 0, fx: [] as Array<[number, number]> })));
      const sounding = [false, false, false, false];
      const arp = new Map<number, number>();
      const bias = fpOctaveBias(walk);
      for (const e of walk.events) {
        const r = (e.tick - 1) / walk.speed;
        expect(Number.isInteger(r), `event at tick ${e.tick} is on a row`).toBe(true);
        const c = cells[e.voice][r];
        switch (e.kind) {
          case FP_WALK.note: c.note = fpPeriodToNote(e.period, bias); c.instrument = ptrToId.get(e.b) ?? 0; sounding[e.voice] = true; break;
          case FP_WALK.legato: c.note = fpPeriodToNote(e.period, bias); c.fx!.push([FP_FX.legato, 0]); sounding[e.voice] = true; break;
          case FP_WALK.rest: if (sounding[e.voice] && fpReleaseRate(code, e.b) > 0) c.note = 97; sounding[e.voice] = false; break;
          case FP_WALK.portamento: c.fx!.push([FP_FX.portamento, Math.min(e.a, 255)]); break;
          case FP_WALK.arpTable: if (!arp.has(e.a)) arp.set(e.a, arp.size + 1); c.fx!.push([FP_FX.arpTable, arp.get(e.a)!]); break;
          case FP_WALK.arpReset: c.fx!.push([FP_FX.arpReset, 0]); break;
          case FP_WALK.transpose1: c.fx!.push([FP_FX.transpose1, e.a]); break;
          case FP_WALK.transpose2: c.fx!.push([FP_FX.transpose2, e.a]); break;
          case FP_WALK.end: if (sounding[e.voice]) c.note = 97; sounding[e.voice] = false; c.fx!.push([FP_FX.end, 0]); break;
          case FP_WALK.unknown: c.fx!.push([FP_FX.unknown, e.a]); break;
          default: break;
        }
      }
      const before = walkStats.rows;
      expect(compareGridToWalk(song, cells)).toEqual([]);
      expect(walkStats.rows - before, 'rows compared').toBe(rows * 4);
      // a voice that never sounds is empty
      for (let v = 0; v < 4; v++) {
        if (cells[v].every((c) => c.note === 0)) for (const p of song.patterns) for (const r of p.channels[v].rows) expect(r.note).toBe(0);
      }
      // the notes named by the player's period: every note cell is the name of a period of the table
      let named = 0;
      for (const p of song.patterns) for (const ch of p.channels) for (const r of ch.rows) if (r.note > 0 && r.note < 97) named++;
      expect(named).toBe(walk.events.filter((e) => e.kind === FP_WALK.note || e.kind === FP_WALK.legato).length);
    });

    it('every instrument pointer subsong 0 sets has its slot, in order, and none has an invented name', () => {
      const ptrs = new Set<number>();
      const queue = fpSongs(code)[0].voiceSeqPtrs.filter((p) => p > 0);
      const seen = new Set<number>();
      const u32 = (p: number): number => ((code[p] << 24) | (code[p + 1] << 16) | (code[p + 2] << 8) | code[p + 3]) >>> 0;
      // an independent block walk: every set-instrument pointer in every block reachable from subsong 0's voices
      while (queue.length) {
        let p = queue.shift()!;
        if (seen.has(p) || p >= code.length) continue;
        seen.add(p);
        for (let guard = 0; guard < 100000 && p < code.length; guard++) {
          const b = code[p++];
          if (b & 0x80) {
            const cmd = b & 0x3f; p++;
            if (cmd === 1) { const q = u32(p); p += 4; if (q) ptrs.add(q); }
            else if (cmd === 2) p += 4;
            else if (cmd === 4) p += 2;
            else if (cmd === 6) { queue.push(u32(u32(p) + 8)); p += 4; }
            else if (cmd === 7) { queue.push(u32(u32(p) + 8)); break; }
            else if (cmd === 0) break;
          } else p++;
        }
      }
      expect(song.instruments.length, 'one slot per instrument pointer').toBe(ptrs.size);
      expect(new Set(song.instruments.map((i) => (i as unknown as { metadata: { fpInstrPtr: number } }).metadata.fpInstrPtr))).toEqual(ptrs);
      expect(song.instruments.map((i) => i.id)).toEqual(song.instruments.map((_i, k) => k + 1));
      for (const i of song.instruments) expect(i.name, 'the module has no instrument names').toBe('');
      // the walk's own order: the first instruments are the ones subsong 0 sets first
      const first: number[] = [];
      for (const e of walk.events) if (e.kind === FP_WALK.instrument && e.a !== 0 && !first.includes(e.a)) first.push(e.a);
      first.forEach((ptr, k) => expect(ptrToId.get(ptr)).toBe(k + 1));
    });

    it('the position of the player\'s tick is a row of the grid and walks the grid in order', () => {
      const layout = fpLayout(walk);
      let prev = { songPos: 0, row: 0 };
      expect(fpTickPosition(layout, 1)).toEqual({ songPos: 0, row: 0 });
      for (let r = 1; r < Math.min(walk.rows, 400); r++) {
        const pos = fpTickPosition(layout, 1 + r * walk.speed + (walk.speed - 1))!;
        expect(pos, `row ${r}`).toBeTruthy();
        const rowsBefore = song.patterns.slice(0, pos.songPos).reduce((n, p) => n + p.length, 0);
        expect(rowsBefore + pos.row, 'the reported row is the flat row').toBe(r);
        expect(pos.row).toBeLessThan(song.patterns[pos.songPos].length);
        prev = pos;
      }
      void prev;
      if (walk.stop === 'loop') {
        const back = fpTickPosition(layout, 1 + walk.rows * walk.speed)!;
        let start = 0;
        for (let p = 0; p < back.songPos; p++) start += song.patterns[p].length;
        expect(start + back.row).toBe(walk.loopRow);
      }
      if (walk.stop === 'cap') expect(fpTickPosition(layout, 1 + walk.rows * walk.speed)).toBeNull();
    });
  });

  it('the effect glyphs show the player\'s terms', () => {
    expect(xmEffectToString(FP_FX.portamento, 5)).toBe('P05');
    expect(xmEffectToString(FP_FX.arpTable, 2)).toBe('A02');
    expect(xmEffectToString(FP_FX.transpose1, 0xfe)).toBe('TFE');
    expect(xmEffectToString(FP_FX.legato, 0)).toBe('L00');
    expect(xmEffectToString(FP_FX.end, 0)).toBe('E00');
  });

  it('a song whose notes cannot be named opens in the scope view with the reason, over an empty grid', () => {
    const file = FILES.find((f) => f.endsWith('hybris.fp'))!;
    const bytes = new Uint8Array(readFileSync(file));
    const code = fpCodeSection(bytes);
    const walk = walkFuturePlayer(code, 0)!;
    const note = walk.events.find((e) => e.kind === FP_WALK.note)!;
    const hdr = code.byteOffset - bytes.byteOffset; // where the hunk's code starts in the file
    const broken = bytes.slice();
    broken[hdr + note.off] = 126; // table index 126: past the 97 entries the replayer's table has, no period to name
    const s = parseFuturePlayerFile(ab(broken), 'broken.fp') as TrackerSong;
    expect(s.gridUnmatchedReason).toMatch(/past the period table/);
    expect(gridOpensInScopeView(s)).toBe(true);
    expect(s.patterns).toHaveLength(1);
    for (const ch of s.patterns[0].channels) for (const r of ch.rows) expect(r.note).toBe(0);
    // the module itself still plays and exports
    expect(s.futurePlayerFileData?.byteLength).toBe(bytes.length);
  });

  describe.each(FILES.map((f) => [f.slice(SONGS.length + 1), f] as const))('UADE: %s', (_rel, file) => {
    const bytes = new Uint8Array(readFileSync(file));
    const code = fpCodeSection(bytes);
    const name = file.split('/').pop()!;

    it('a rest is a note-off exactly where the player\'s envelope falls', () => {
      const sub = 0;
      const { walk, passes } = passStates(code, sub);
      const secs = Math.min(300, walk.ticks / walk.tickHz + 2);
      const before = oracleStats.writes;
      const o = playOriginal(mod, bytes, name, sub, secs);
      expect(oracleStats.writes - before).toBeGreaterThan(10);
      const al = alignPasses(o, walk, passes, o.endedAt === null ? o.chunks.length : o.endedAt - 3);
      expect(al.lostAt, 'the records are the walk\'s').toBeUndefined();
      const firstChunk = new Map<number, number>(al.reached);
      const bad: string[] = [];
      let falling = 0, holding = 0;
      // per pass, the chunks the records are that pass
      const chunksOf = new Map<number, number[]>();
      al.passAt.forEach((p, c) => { if (p >= 0) (chunksOf.get(p) ?? chunksOf.set(p, []).get(p)!).push(c); });
      const sounding = [false, false, false, false];
      for (const e of walk.events) {
        if (e.kind === FP_WALK.note || e.kind === FP_WALK.legato) { sounding[e.voice] = true; continue; }
        if (e.kind === FP_WALK.end) { sounding[e.voice] = false; continue; }
        if (e.kind !== FP_WALK.rest) continue;
        const wasSounding = sounding[e.voice];
        sounding[e.voice] = false;
        const p = (e.tick - 1) / walk.speed;
        const cs = (chunksOf.get(p) ?? []).filter((c) => c >= (firstChunk.get(p) ?? 0) + 3);
        if (cs.length < 2) continue;
        const rate = fpReleaseRate(code, e.b);
        const levels = cs.map((c) => o.chunks[c][e.voice].env);
        for (let k = 1; k < levels.length; k++) {
          const d = levels[k - 1] - levels[k];
          if (rate > 0 && d !== 0 && d !== rate && !(levels[k] === 0 && d < rate)) bad.push(`rest at tick ${e.tick} voice ${e.voice}: level ${levels[k - 1]} -> ${levels[k]}, release rate ${rate}`);
          if (rate === 0 && d !== 0) bad.push(`rest at tick ${e.tick} voice ${e.voice}: level ${levels[k - 1]} -> ${levels[k]} with release rate 0`);
        }
        if (levels.some((l, k) => k > 0 && l < levels[k - 1])) falling++;
        else if (wasSounding) holding++;
        if (bad.length > 8) break;
      }
      console.log(`ROW Future Player rests | ${name} | rests with a falling level ${falling}, held ${holding}`);
      expect(bad, bad.join('\n')).toEqual([]);
    }, 600_000);
  });
});
