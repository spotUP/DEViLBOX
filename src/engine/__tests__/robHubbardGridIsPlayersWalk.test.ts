/**
 * Rob Hubbard: the grid plays the notes the player plays (owner, 2026-10-07, skateordie.rh:
 * "uses guesstimated notes"; plan fix-all-open G10 + G7, grid-from-replayer-walk W2-c).
 *
 * The grid used to name a note by its table index + 25 and put the instrument at 1 at every
 * block start; the player names a note by the PERIOD it starts with (the table entry scaled by
 * the sample's own `relative`) and takes the sample from the commands before it. skateordie's
 * bass voice (sample scale 168 against 357) and its wave voice came out as other notes.
 *
 * Oracle 1: UADE running the original 68k player, its Paula writes read through the shared kit
 * (gridOracle.ts). For EVERY corpus .rh module, every voice: the k-th note-on Paula makes is the
 * k-th note the grid shows (periodToPitch of the period Paula was given), on the row the grid puts
 * it (row r sounds on interrupt 1 + r * speed; Paula's log has 10 ms grain, two chunks an interrupt,
 * so a note-on lands within one interrupt of that), and the sample Paula starts has the length of
 * the instrument the grid shows (AUDxLEN, the G7 check: an instrument that resets to 1 at a block
 * start plays another sample). Where the player restarts the song (centurion_battle's song end,
 * walked as a loop) the check runs over two passes.
 *
 * Oracle 2: the commands the walk ran, per voice and row (note, instrument, note-off only where a
 * rest stops a sounding voice, silent voices empty), against the grid.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  openUade, PaulaSession, PAULA_REG, oracleStats, compareGridToWalk, walkStats,
  type PaulaLogModule, type WalkCell,
} from './gridOracle';
import { parseRobHubbardFile } from '@/lib/import/formats/RobHubbardParser';
import { walkRobHubbard, RH_WALK } from '@/lib/import/formats/rhWalk';
import { rhPeriodToNote } from '@/lib/import/formats/robHubbardGrid';
import { RH_FX } from '@/lib/import/formats/robHubbardEffectGlyphs';
import { xmEffectToString } from '@/lib/xmConversions';
import { periodToPitch } from '@/lib/amiga/periodNotes';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const SONGS = join(process.cwd(), 'public/data/songs');
const ab = (b: Uint8Array): ArrayBuffer => b.slice().buffer as ArrayBuffer;

/** Every Rob Hubbard module of the corpus: *.rh under public/data/songs. */
function corpus(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) corpus(p, out);
    else if (f.toLowerCase().endsWith('.rh')) out.push(p);
  }
  return out;
}
const FILES = corpus(SONGS).sort();

/** Paula chunks of 10 ms: two per 50 Hz interrupt. */
const CHUNKS_PER_TICK = 2;
/** Seconds of UADE rendered per song at most (skateordie's pass is 243 s; the whole pass is checked). */
const MAX_SECONDS = 300;

interface NoteOn { chunk: number; period: number; len: number }

/** Per voice the note-ons UADE's player makes: a sample pointer, then the period (AUDxLEN read from the same burst). */
function paulaNoteOns(mod: PaulaLogModule, bytes: Uint8Array, name: string, seconds: number): { ons: NoteOn[][]; endedAt: number | null } {
  const s = new PaulaSession(mod, bytes, name);
  const ons: NoteOn[][] = [[], [], [], []];
  const armed = [false, false, false, false];
  const len = [0, 0, 0, 0];
  let chunk = 0;
  const feed = (ws: Array<{ voice: number; reg: number; value: number }>): void => {
    for (const w of ws) {
      if (w.voice > 3) continue;
      if (w.reg === PAULA_REG.LCH || w.reg === PAULA_REG.LCL) armed[w.voice] = true;
      else if (w.reg === PAULA_REG.LEN) len[w.voice] = w.value;
      else if (w.reg === PAULA_REG.PER && armed[w.voice] && w.value >= 60 && w.value <= 7000) {
        armed[w.voice] = false;
        // the init write of every voice (period 150, before the first interrupt) is not a note
        if (!(chunk === 0 && w.value === 150)) ons[w.voice].push({ chunk, period: w.value, len: len[w.voice] });
      }
    }
  };
  feed(s.drain());
  let endedAt: number | null = null;
  for (; chunk < seconds * 100; ) {
    const ws = s.step();
    if (!ws) { endedAt = chunk; break; }
    chunk++;
    feed(ws);
  }
  s.close();
  return { ons, endedAt };
}

/** The grid's note-ons per voice over `passes` passes of the song: [tick, note, instrument]. */
function gridNoteOns(song: TrackerSong, speed: number, passes: number): Array<Array<[number, number, number]>> {
  const out: Array<Array<[number, number, number]>> = [[], [], [], []];
  const rows = song.songPositions.reduce((n, p) => n + song.patterns[p].length, 0);
  for (let v = 0; v < 4; v++) {
    let r0 = 0;
    for (const p of song.songPositions) {
      song.patterns[p].channels[v].rows.forEach((c, i) => {
        if (c.note > 0 && c.note < 97) for (let k = 0; k < passes; k++) out[v].push([1 + (r0 + i + k * rows) * speed, c.note, c.instrument]);
      });
      r0 += song.patterns[p].length;
    }
  }
  // passes interleave per row in the loop above; order by tick
  for (const list of out) list.sort((a, b) => a[0] - b[0]);
  return out;
}

let mod: PaulaLogModule;
beforeAll(async () => { mod = await openUade(); });
afterAll(() => { try { (mod as unknown as { _uade_wasm_cleanup(): void })._uade_wasm_cleanup(); } catch { /* ignore */ } });

describe('Rob Hubbard: the grid plays the notes the player plays', () => {
  it('the corpus has the owner song and more than one module', () => {
    expect(FILES.some((f) => f.endsWith('skateordie.rh'))).toBe(true);
    expect(FILES.length).toBeGreaterThanOrEqual(2);
  });

  describe.each(FILES.map((f) => [f.slice(SONGS.length + 1), f] as const))('%s', (_rel, file) => {
    const bytes = new Uint8Array(readFileSync(file));
    const name = file.split('/').pop()!;

    it('every note UADE plays is the grid note on the grid row, with the grid instrument\'s sample', async () => {
      const song = await parseRobHubbardFile(ab(bytes), name) as TrackerSong;
      expect(song.gridUnmatchedReason, 'the grid is matched to the walk').toBeUndefined();
      const walk = walkRobHubbard(bytes)!;
      const speed = song.initialSpeed;
      expect(speed).toBe(walk.speed);
      expect(song.uadePlayerTickGrid, 'row = player interrupts').toBe(true);

      // whole pass(es): at least two passes when the pass is short, the whole pass otherwise
      const passSeconds = (walk.ticks * 0.02);
      const passes = passSeconds < 40 ? 2 : 1;
      const seconds = Math.min(MAX_SECONDS, passSeconds * passes);
      const before = oracleStats.writes;
      const { ons: paula, endedAt } = paulaNoteOns(mod, bytes, name, seconds);
      expect(oracleStats.writes - before, 'the Paula log ran').toBeGreaterThan(100);

      const grid = gridNoteOns(song, speed, passes);
      // the pitch the grid shows for a note is the period's name; the length of the sample the
      // instrument names (AUDxLEN is in words)
      const lens = walk.module.samples.map((s) => s.length >> 1);
      // UADE (looping off) stops at the player's song end: centurion_battle's restart is then seen as
      // the notes it plays on the interrupt after the pass (the second pass's first notes), no further
      const lastChunk = endedAt ?? seconds * 100 - 2 * CHUNKS_PER_TICK;
      let compared = 0;
      const bad: string[] = [];
      for (let v = 0; v < 4; v++) {
        const g = grid[v].filter(([t]) => (t - 1) * CHUNKS_PER_TICK <= lastChunk);
        const p = paula[v];
        if (p.length !== g.length) bad.push(`voice ${v}: Paula makes ${p.length} note-ons, the grid shows ${g.length} in the same time`);
        for (let k = 0; k < Math.min(p.length, g.length); k++) {
          compared++;
          const [t, note, ins] = g[k];
          const o = p[k];
          const early = (t - 1) * CHUNKS_PER_TICK;
          if (rhPeriodToNote(o.period) !== note) bad.push(`voice ${v} note ${k}: Paula period ${o.period} (note ${periodToPitch(o.period)}), grid note ${note}`);
          else if (o.chunk < early || o.chunk > early + CHUNKS_PER_TICK + 1) bad.push(`voice ${v} note ${k}: Paula at chunk ${o.chunk}, the grid row is tick ${t} (chunks ${early}..${early + CHUNKS_PER_TICK + 1})`);
          else if (lens[ins - 1] !== undefined && lens[ins - 1] > 0 && o.len !== lens[ins - 1] && !walk.module.samples[ins - 1].wave) {
            bad.push(`voice ${v} note ${k}: Paula starts a sample of ${o.len} words, instrument ${ins} has ${lens[ins - 1]}`);
          }
          if (bad.length >= 12) break;
        }
      }
      console.log(`ROW Rob Hubbard | ${name} | ${endedAt === null ? seconds.toFixed(0) + ' s' : 'song end at chunk ' + endedAt} | Paula note-ons per voice ${paula.map((p) => p.length).join('/')} | compared ${compared}`);
      expect(compared, 'notes compared against Paula').toBeGreaterThan(20);
      expect(bad, bad.join('\n')).toEqual([]);
    }, 600_000);

    it('the grid is the walk: note, instrument and note-off only where a rest stops a sounding voice, silent voices empty', async () => {
      const song = await parseRobHubbardFile(ab(bytes), name) as TrackerSong;
      const walk = walkRobHubbard(bytes)!;
      const rows = Math.ceil(walk.ticks / walk.speed);
      const cells: WalkCell[][] = Array.from({ length: 4 }, () => Array.from({ length: rows }, () => ({ note: 0, instrument: 0 })));
      const sounding = [false, false, false, false];
      for (const e of walk.events) {
        const r = (e.tick - 1) / walk.speed;
        expect(Number.isInteger(r), `event at tick ${e.tick} is on a row`).toBe(true);
        if (e.kind === RH_WALK.note) {
          cells[e.voice][r] = { note: rhPeriodToNote(e.period), instrument: (e.a < 0 ? 0 : e.a) + 1 };
          sounding[e.voice] = true;
        } else if (e.kind === RH_WALK.rest) {
          if (sounding[e.voice]) cells[e.voice][r] = { note: 97, instrument: 0 };
          sounding[e.voice] = false;
        }
      }
      const before = walkStats.rows;
      expect(compareGridToWalk(song, cells, { fx: false })).toEqual([]);
      expect(walkStats.rows - before, 'rows compared').toBe(rows * 4);
      // every voice that never sounds is empty in the grid
      cells.forEach((voice, v) => {
        if (voice.every((c) => c.note === 0)) {
          for (const p of song.songPositions) for (const c of song.patterns[p].channels[v].rows) expect(c.note).toBe(0);
        }
      });
    });

    it('every command the walk ran shows in the effect columns, in the player\'s terms', async () => {
      const song = await parseRobHubbardFile(ab(bytes), name) as TrackerSong;
      const walk = walkRobHubbard(bytes)!;
      const shown = new Set<number>();
      for (const p of song.patterns) for (const c of p.channels) for (const r of c.rows) {
        for (const t of [r.effTyp, r.effTyp2, (r as { effTyp3?: number }).effTyp3]) if (t) shown.add(t);
      }
      const ran = new Set<number>();
      for (const e of walk.events) {
        if (e.kind === RH_WALK.portamento) ran.add(RH_FX.portamento);
        if (e.kind === RH_WALK.sustain) ran.add(RH_FX.sustain);
        if (e.kind === RH_WALK.volume) ran.add(RH_FX.volume);
        if (e.kind === RH_WALK.blockEnd && e.a === 1 && e.tick <= walk.ticks) ran.add(RH_FX.listRestart);
      }
      if (name === 'skateordie.rh') expect(ran.size, 'the song runs track list restarts').toBeGreaterThan(0);
      for (const t of ran) expect(shown.has(t), `effect 0x${t.toString(16)} ran and shows`).toBe(true);
      expect(xmEffectToString(RH_FX.portamento, 0x05)).toBe('P05');
      expect(xmEffectToString(RH_FX.listRestart, 0)).toBe('Z00');
    });
  });
});
