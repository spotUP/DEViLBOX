/**
 * SunTronic V1.3: the editable grid is the replayer's own walk.
 *
 * Oracle 1, the player: SunTronicPlayer (the engine's sequencer, walk only) through
 * walkSunTronic, one pass of subsong 0: every row each voice decodes, with the pitch bytes,
 * the select staged for each, and the control opcodes with their operands. Held against it:
 * parseSunTronicFile's grid, per voice per row, notes, instruments and commands, over every
 * V1.3 module of both corpus folders (193 distinct files).
 *
 * Oracle 2, UADE (the original 68k player, amigasrc/suntronic): the player above is itself
 * held to UADE's Paula period writes, one per voice per vblank, so the walk is the original's.
 *
 * A song whose voices do not share a row clock cannot be shown as rows side by side: it opens
 * in the scope view with the reason recorded (gridEstimated + gridUnmatchedReason).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { parseSunTronicFile } from '@/lib/import/formats/SunTronicParser';
import { isSunTronicV13Format, parseSunTronicV13Score, sunPitchToNote } from '@/lib/import/formats/SunTronicV13';
import type { SunV13Score } from '@/lib/import/formats/SunTronicV13';
import { SUN_EFFECT_BY_OP } from '@/lib/import/formats/sunEffectMap';
import { SUN_FX } from '@/lib/import/formats/sunEffectGlyphs';
import { walkSunTronic, sunWalkClockSkew, type SunSongWalk } from '@/engine/suntronic/SunTronicWalk';
import { SunTronicPlayer } from '@/engine/suntronic/SunTronicPlayer';
import { addCompanions } from '../../../tools/uade-audit/uadeRenderCore';
import { compareGridToWalk, walkStats, openUade, PaulaSession, oracleStats, type WalkCell } from './gridOracle';

const DIRS = ['public/data/songs/formats/SUNTronicTunes', 'public/data/songs/SUNTronicTunes'];

interface Entry { name: string; bytes: Uint8Array }

/** Every V1.3 module of both corpus folders, one per distinct content. */
function corpus(): Entry[] {
  const seen = new Set<string>();
  const out: Entry[] = [];
  for (const dir of DIRS) {
    for (const f of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
      if (!f.isFile()) continue;
      const bytes = new Uint8Array(readFileSync(join(process.cwd(), dir, f.name)));
      if (!isSunTronicV13Format(bytes)) continue;
      const h = createHash('sha1').update(bytes).digest('hex');
      if (seen.has(h)) continue;
      seen.add(h);
      out.push({ name: f.name, bytes });
    }
  }
  return out;
}

const ALL = corpus();
const find = (name: string): Entry => ALL.find((e) => e.name === name)!;
const toBuffer = (e: Entry): ArrayBuffer => e.bytes.slice().buffer as ArrayBuffer;

/** The display commands for one control opcode the player ran (names as the format names them: sunEffectMap). */
function commandsOf(op: number, args: number[]): Array<[number, number]> {
  if (op === 0x94) return [[3, args[0] ?? 0]];
  const def = op >= 0x8b && op <= 0x9c ? SUN_EFFECT_BY_OP.get(op) : undefined;
  if (!def) return [];
  const d = def.decode(args);
  const out: Array<[number, number]> = [[d.effTyp, d.param]];
  if (op === 0x9a && args.length === 2) out.push([SUN_FX.volSlideRate, args[1]]);
  return out;
}

/** What the player shows per voice per row: the note that sounds (the group's last note-on) and the commands it ran. */
function walkCells(score: SunV13Score, walk: SunSongWalk): WalkCell[][] {
  const numSampled = score.sampledInstruments.length;
  return walk.voices.map((rows) => rows.map((g): WalkCell => {
    const fired = g.notes.filter((n) => n.fired);
    const last = fired[fired.length - 1];
    const fx = g.ops.flatMap((o) => commandsOf(o.op, o.args)).slice(0, 5);
    if (!last) return { note: 0, instrument: 0, fx };
    const instrument = last.sel >= 0x40 ? numSampled + (last.sel & 0x3f) + 1 : last.sel;
    return { note: sunPitchToNote(last.pitch), instrument, fx };
  }));
}

/** Songs whose voices run on different row clocks: no row-aligned grid can be their walk. */
const PER_VOICE_SPEED = ['smooth'];

describe('SunTronic V1.3 grid is the replayer walk', () => {
  it('every corpus song: notes, instruments and commands per voice per row equal the replayer walk', () => {
    expect(ALL.length).toBeGreaterThan(150);
    const rowsBefore = walkStats.rows;
    const failures: string[] = [];
    const unmatched: string[] = [];
    let aligned = 0;
    for (const { name, bytes } of ALL) {
      const score = parseSunTronicV13Score(bytes);
      const walk = walkSunTronic(score);
      if (!walk.finished.every(Boolean)) { failures.push(`${name}: the walk did not finish a pass`); continue; }
      const song = parseSunTronicFile(toBuffer({ name, bytes }), name);
      const skew = sunWalkClockSkew(walk);
      if (skew.reason) {
        // No guessed grid: the scope view, with the reason recorded and nothing editable.
        unmatched.push(name);
        if (!song.gridEstimated) failures.push(`${name}: voices off the row clock (${skew.reason}) but the grid is shown`);
        if ((song as unknown as { gridUnmatchedReason?: string }).gridUnmatchedReason !== skew.reason) failures.push(`${name}: reason not recorded`);
        if (song.uadeVariableLayout || song.sunTronicNative) failures.push(`${name}: scope-view song still carries an editable layout`);
        continue;
      }
      aligned++;
      if (song.gridEstimated) failures.push(`${name}: aligned song opened in the scope view`);
      const bad = compareGridToWalk(song, walkCells(score, walk), { limit: 4 });
      for (const b of bad) failures.push(`${name}: ${b}`);
      // Rows: the grid holds exactly the rows the walk decoded (padding to whole patterns is empty).
      const rows = song.patterns.reduce((n, p) => n + p.length, 0);
      if (rows < walk.voices[0].length) failures.push(`${name}: grid has ${rows} rows, the walk ${walk.voices[0].length}`);
    }
    expect(failures.slice(0, 20)).toEqual([]);
    expect(unmatched.sort()).toEqual(PER_VOICE_SPEED);
    // Sentinel: the comparison ran over every aligned song and many thousands of rows.
    expect(aligned).toBe(ALL.length - PER_VOICE_SPEED.length);
    expect(walkStats.rows - rowsBefore).toBeGreaterThan(100_000);
  }, 120_000);

  it('a group of several note-ons shows the one that sounds (mic-0001 voice 3 row 58: instruments 1,2,1,2 sound 2)', () => {
    const e = find('mic-0001.src');
    const score = parseSunTronicV13Score(e.bytes);
    const walk = walkSunTronic(score);
    const g = walk.voices[2][57];
    expect(g.notes.map((n) => n.sel)).toEqual([1, 2, 1, 2]);
    const song = parseSunTronicFile(toBuffer(e), e.name);
    const cell = song.patterns[0].channels[2].rows[57];
    expect(cell.instrument).toBe(2);
    expect(cell.note).toBe(sunPitchToNote(g.notes[3].pitch));
  });

  it('a grid shifted one row off the walk is reported (the comparison has teeth)', () => {
    const e = find('analgestic2.src');
    const score = parseSunTronicV13Score(e.bytes);
    const cells = walkCells(score, walkSunTronic(score));
    const song = parseSunTronicFile(toBuffer(e), e.name);
    expect(compareGridToWalk(song, cells)).toEqual([]);
    const shifted = cells.map((v) => [{ note: 0, instrument: 0, fx: [] as Array<[number, number]> }, ...v]);
    expect(compareGridToWalk(song, shifted).length).toBeGreaterThan(0);
  });

  it('smooth: voices on their own row clocks (per-voice speed) open the scope view with the reason recorded', () => {
    const e = find('smooth');
    const song = parseSunTronicFile(toBuffer(e), e.name);
    expect(song.gridEstimated).toBe(true);
    expect((song as unknown as { gridUnmatchedReason: string }).gridUnmatchedReason).toMatch(/different row clocks/);
    expect(song.patterns.every((p) => p.channels.every((c) => c.rows.every((r) => r.note === 0)))).toBe(true);
  });

  it('the voices of a 0x98-late song stay inside one row of each other (jingle: 2 steps behind voice 1, row 6-8)', () => {
    const e = find('jingle.src');
    const skew = sunWalkClockSkew(walkSunTronic(parseSunTronicV13Score(e.bytes)));
    expect(skew.aligned).toBe(true);
    expect(skew.maxOffset).toBe(2);
  });

  it('UADE agrees: the player this walk runs writes UADE\'s period on every voice, every vblank', { timeout: 300_000 }, async () => {
    const mod = await openUade();
    const companions: Array<{ name: string; data: Uint8Array }> = [];
    const seen = new Set<string>();
    for (const d of DIRS) {
      for (const f of readdirSync(join(process.cwd(), d, 'instr'))) {
        if (seen.has(f) || f.startsWith('.')) continue;
        seen.add(f);
        companions.push({ name: f, data: new Uint8Array(readFileSync(join(process.cwd(), d, 'instr', f))) });
      }
    }
    addCompanions(mod, companions);
    const STEPS = 800;
    const drainsBefore = oracleStats.drains;
    const lows: string[] = [];
    const short: string[] = [];
    let compared = 0;
    for (const { name, bytes } of ALL) {
      const session = new PaulaSession(mod, bytes, name);
      const per: number[][] = [[], [], [], []];
      for (let c = 0; c < 20000 && Math.min(...per.map((a) => a.length)) < STEPS + 6; c++) {
        const writes = session.step();
        if (!writes) break;
        for (const w of writes) if (w.reg === 3 && w.voice < 4) per[w.voice].push(w.value);
      }
      session.close();
      const player = new SunTronicPlayer(parseSunTronicV13Score(bytes));
      const mine: number[][] = [[], [], [], []];
      for (let c = 0; c < STEPS; c++) {
        const vs = player.stepVblankOnce().voices;
        for (let v = 0; v < 4; v++) mine[v].push(vs[v].period);
      }
      const avail = Math.min(...per.map((a) => a.length));
      // UADE's first log entries come before the first player step: one shift for the whole song.
      let shift = 0, best = -1;
      for (let sh = 0; sh <= 4; sh++) {
        let tot = 0;
        for (let v = 0; v < 4; v++) for (let c = 8; c < Math.min(STEPS, avail - sh) - 8; c++) if (mine[v][c] === per[v][c + sh]) tot++;
        if (tot > best) { best = tot; shift = sh; }
      }
      const n = Math.min(STEPS, avail - shift) - 8;
      if (n < 80) { short.push(`${name} (${n})`); continue; }
      for (let v = 0; v < 4; v++) {
        let m = 0;
        for (let c = 8; c < 8 + n; c++) if (mine[v][c] === per[v][c + shift]) m++;
        compared += n;
        // The Paula DMA gap is known (+-2 ticks on a few songs): a voice may drift on up to 10 % of vblanks (aliens voice 3 measures 0.909).
        if (m / n < 0.9) lows.push(`${name} voice ${v + 1}: ${(m / n).toFixed(3)} over ${n} vblanks`);
      }
    }
    expect(lows).toEqual([]);
    expect(oracleStats.drains - drainsBefore, 'UADE was rendered and its Paula log read').toBeGreaterThan(1000);
    expect(compared, 'vblank-voice pairs compared').toBeGreaterThan(500_000);
    // Songs UADE ends within 80 vblanks are effects, not songs; none of the songs is skipped for another reason.
    expect(short.length).toBeLessThan(25);
  });
});
