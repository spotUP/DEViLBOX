/**
 * Music Assembler: the grid is the player's walk (plan 2026-10-07-grid-from-replayer-walk, U8).
 *
 * The walk is held to the original 68k player in UADE by musicAssemblerWalkMatchesPlayer.test.ts (every period
 * and volume the player writes, the sample of every note, the 50 Hz tick). This test holds the GRID to the walk,
 * through the product's own parse (parseMusicAssemblerFile), for every corpus module:
 *  - per voice and row: the note the walk starts (named by the table period it plays), its instrument, a legato
 *    note without one, a note-off only where a release event stops a sounding voice whose instrument releases,
 *    the portamento byte and the position's transpose in the effect columns, a silent voice empty;
 *  - the rows are the walk's rows, the loop restarts at the loop row, the speed is the module's;
 *  - every instrument slot of the module is kept, and none has an invented name (the module's own sample names);
 *  - a note-off is where the player's volume falls (the walk's writes, which UADE confirms): an instrument that
 *    releases fades the voice to silence, one that does not holds its level;
 *  - a song the player cannot walk (a track that is not in the file) opens in the scope view with the reason.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MA_FILES, MA_SONGS, withReleases } from './maOracle';
import { compareGridToWalk, walkStats, type WalkCell } from './gridOracle';
import { parseMusicAssemblerFile } from '@/lib/import/formats/MusicAssemblerParser';
import { loadMaModule, MA_PERIODS, type MaModuleData } from '@/lib/import/formats/maModule';
import { walkMusicAssembler, MA_WALK, type MaWalk } from '@/lib/import/formats/maWalk';
import { walkLayout, walkTickPosition } from '@/lib/import/formats/walkLayout';
import { MA_FX } from '@/lib/import/formats/maEffectGlyphs';
import { periodToPitch } from '@/lib/amiga/periodNotes';
import { xmEffectToString } from '@/lib/xmConversions';
import { gridOpensInScopeView } from '@/lib/tracker/gridOpensInScopeView';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const SONGS = MA_SONGS;
const FILES = MA_FILES;

/** The grid the walk calls for, derived per voice and row on its own (not through the grid builder). */
function expectedCells(walk: MaWalk, m: MaModuleData): WalkCell[][] {
  const rows = walk.rows;
  const cells: WalkCell[][] = Array.from({ length: 4 }, () => Array.from({ length: rows }, () => ({ note: 0, instrument: 0, fx: [] as Array<[number, number]> })));
  const transpose = [0, 0, 0, 0];
  for (const e of walk.events) {
    const r = (e.tick - 1) / walk.speed;
    expect(Number.isInteger(r), `event at tick ${e.tick} is on a row`).toBe(true);
    const c = cells[e.voice][r];
    if (e.kind === MA_WALK.trackStart) {
      if (e.played !== transpose[e.voice]) { c.fx!.push([MA_FX.transpose, e.played]); transpose[e.voice] = e.played; }
    } else if (e.kind === MA_WALK.note || e.kind === MA_WALK.legato) {
      // the note the player plays: a table period, named by the shared period naming (index 0 = 1712 = note 1)
      c.note = periodToPitch(MA_PERIODS[e.tableIndex]);
      if (e.kind === MA_WALK.note) { c.instrument = e.instr + 1; if (!e.envelope) c.fx!.push([MA_FX.keepEnvelope, 0]); } else c.fx!.push([MA_FX.legato, 0]);
      if (e.pv !== 0) c.fx!.push([MA_FX.portamento, e.pv]);
    } else if (e.kind === MA_WALK.release) {
      if (e.level > 0 && m.instruments[e.instr].release > 0) c.note = 97;
    }
  }
  return cells;
}

describe('Music Assembler: the grid is the player\'s walk', () => {
  it('the corpus has the owner modules', () => {
    expect(FILES.some((f) => f.endsWith('baseheads.ma'))).toBe(true);
    expect(FILES.some((f) => f.endsWith('thanatos.ma'))).toBe(true);
  });

  describe.each(FILES.map((f) => [f.slice(SONGS.length + 1), f] as const))('%s', (_rel, file) => {
    const bytes = new Uint8Array(readFileSync(file));
    const name = file.split('/').pop()!;
    const song = parseMusicAssemblerFile(bytes, name) as TrackerSong;
    const m = loadMaModule(bytes)!;
    const walk = walkMusicAssembler(m, 0)!;

    it('the grid is matched to the walk and holds its rows, loop and speed', () => {
      expect(song.gridUnmatchedReason, 'matched').toBeUndefined();
      expect(gridOpensInScopeView(song)).toBe(false);
      expect(song.patterns.reduce((n, p) => n + p.length, 0)).toBe(walk.rows);
      for (const p of song.patterns) expect(p.length).toBeLessThanOrEqual(64);
      expect(song.initialSpeed).toBe(walk.speed);
      expect(song.initialBPM).toBe(125);
      expect(song.songPositions).toEqual(song.patterns.map((_p, i) => i));
      if (walk.stop === 'loop' && walk.loopRow > 0) {
        let start = 0;
        for (let p = 0; p < song.restartPosition; p++) start += song.patterns[p].length;
        expect(start).toBe(walk.loopRow);
      } else expect(song.restartPosition).toBe(0);
      // Paula channels 0 and 3 are left, 1 and 2 right; voice v plays on channel [0, 2, 3, 1][v]
      expect(song.patterns[0].channels.map((c) => c.pan)).toEqual([-50, 50, -50, 50]);
    });

    it('per voice and row: the walk\'s note and instrument, legato without one, note-off only where a voice stops, commands in the effect columns', () => {
      const rows = walk.rows;
      const cells = expectedCells(walk, m);
      const before = walkStats.rows;
      expect(compareGridToWalk(song, cells)).toEqual([]);
      expect(walkStats.rows - before, 'rows compared').toBe(rows * 4);
      for (let v = 0; v < 4; v++) {
        if (cells[v].every((c) => c.note === 0)) for (const p of song.patterns) for (const r of p.channels[v].rows) expect(r.note).toBe(0);
      }
      const named = song.patterns.reduce((n, p) => n + p.channels.reduce((k, ch) => k + ch.rows.filter((r) => r.note > 0 && r.note < 97).length, 0), 0);
      expect(named).toBe(walk.events.filter((e) => e.kind === MA_WALK.note || e.kind === MA_WALK.legato).length);
    });

    it('every instrument slot is kept, and none has an invented name', () => {
      expect(song.instruments.map((i) => i.id)).toEqual(m.instruments.map((_i, k) => k + 1));
      m.instruments.forEach((ins, k) => {
        const sample = m.samples[ins.sampleNumber];
        // the module's own sample name where it has one, never a "Sample N" / "Synth N"
        expect(song.instruments[k].name, `instrument ${k + 1}`).toBe(sample && sample.dataOffset >= 0 ? sample.name : '');
      });
    });

    it('the grid holds the releases of a module that has them (note events of releasing instruments turned into releases), and a note-off is where the player\'s volume falls', () => {
      const { bytes: broken, turned } = withReleases(bytes);
      expect(turned).toBeGreaterThan(2);
      const m2 = loadMaModule(broken)!;
      const w2 = walkMusicAssembler(m2, 0)!;
      const s2 = parseMusicAssemblerFile(broken, name) as TrackerSong;
      expect(s2.gridUnmatchedReason).toBeUndefined();
      expect(compareGridToWalk(s2, expectedCells(w2, m2))).toEqual([]);
      let fading = 0, holding = 0;
      for (const e of w2.events) {
        if (e.kind !== MA_WALK.release) continue;
        const writes = w2.writes[e.voice];
        const first = writes.findIndex((w) => w.tick > e.tick);
        if (first < 0) continue;
        const nextEvent = w2.events.find((x) => x.voice === e.voice && x.tick > e.tick && x.kind !== MA_WALK.trackStart);
        const until = nextEvent ? nextEvent.tick : Infinity;
        let last = first;
        while (last + 1 < writes.length && writes[last + 1].tick < until) last++;
        if (last - first < 3) continue;
        // the cell the grid shows for the event
        let rr = (e.tick - 1) / w2.speed, pi = 0;
        while (rr >= s2.patterns[pi].length) { rr -= s2.patterns[pi].length; pi++; }
        const isNoteOff = s2.patterns[pi].channels[e.voice].rows[rr].note === 97;
        // the volume the player writes (the walk's writes, which UADE confirms for this very module)
        if (isNoteOff) { expect(writes[last].volume < writes[first].volume || writes[first].volume === 0, `release at tick ${e.tick} voice ${e.voice} is a note-off: its volume falls`).toBe(true); fading++; }
        else { expect(writes[last].volume >= writes[first].volume, `release at tick ${e.tick} voice ${e.voice} is not a note-off: its volume holds`).toBe(true); holding++; }
      }
      console.log(`ROW Music Assembler releases | ${name} | ${turned} turned, note-offs checked ${fading}, held ${holding}`);
      expect(fading + holding, 'releases checked').toBeGreaterThan(0);
      expect(s2.patterns.some((p) => p.channels.some((ch) => ch.rows.some((r) => r.note === 97))), 'the grid shows a note-off').toBe(true);
    });

    it('the position of the player\'s tick is a row of the grid and walks the grid in order', () => {
      const layout = walkLayout(walk);
      expect(walkTickPosition(layout, 1)).toEqual({ songPos: 0, row: 0 });
      for (let r = 1; r < Math.min(walk.rows, 500); r++) {
        const pos = walkTickPosition(layout, 1 + r * walk.speed + (walk.speed - 1))!;
        const rowsBefore = song.patterns.slice(0, pos.songPos).reduce((n, p) => n + p.length, 0);
        expect(rowsBefore + pos.row, 'the reported row is the flat row').toBe(r);
      }
      if (walk.stop === 'loop') {
        const back = walkTickPosition(layout, 1 + walk.rows * walk.speed)!;
        let start = 0;
        for (let p = 0; p < back.songPos; p++) start += song.patterns[p].length;
        expect(start + back.row).toBe(walk.loopRow);
      }
    });
  });

  it('the effect glyphs show the player\'s terms', () => {
    expect(xmEffectToString(MA_FX.portamento, 0xf0)).toBe('PF0');
    expect(xmEffectToString(MA_FX.legato, 0)).toBe('L00');
    expect(xmEffectToString(MA_FX.keepEnvelope, 0)).toBe('K00');
    expect(xmEffectToString(MA_FX.transpose, 0x0c)).toBe('T0C');
  });

  it('a song the player cannot walk opens in the scope view with the reason, over an empty grid', () => {
    const file = FILES.find((f) => f.endsWith('thanatos.ma'))!;
    const bytes = new Uint8Array(readFileSync(file));
    const m = loadMaModule(bytes)!;
    const walk = walkMusicAssembler(m, 0)!;
    // point the first track voice 0 reads at an offset outside the file: the player reads no track there
    const first = walk.events.find((e) => e.voice === 0)!;
    const broken = bytes.slice();
    broken[m.moduleStartOffset + first.track * 2] = 0xff;
    broken[m.moduleStartOffset + first.track * 2 + 1] = 0xff;
    const s = parseMusicAssemblerFile(broken, 'broken.ma') as TrackerSong;
    expect(s.gridUnmatchedReason).toMatch(/track/);
    expect(gridOpensInScopeView(s)).toBe(true);
    expect(s.patterns).toHaveLength(1);
    for (const ch of s.patterns[0].channels) for (const r of ch.rows) expect(r.note).toBe(0);
    expect(s.maFileData?.byteLength).toBe(bytes.length);
  });
});
