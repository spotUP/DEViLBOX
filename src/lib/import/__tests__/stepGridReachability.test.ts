/**
 * The step grid (thoughts/shared/plans/2026-11-05-step-grid.md), David Whittaker pilot and Ben Daglish, through the product's
 * importer (parseModuleToSong): one row is one song step, so garfield2+.dw (speed 10) shows 1 row where it showed 10.
 * The sentinel proves the row clock ran during the import; the rest asserts the plan's stated numbers.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../formats/stepRowClock', async (orig) => {
  const m = await orig<typeof import('../formats/stepRowClock')>();
  return { ...m, makeRowClock: vi.fn(m.makeRowClock), mainStepFromOnsets: vi.fn(m.mainStepFromOnsets), makeOnsetPlacer: vi.fn(m.makeOnsetPlacer), exactStepFromOnsets: vi.fn(m.exactStepFromOnsets) };
});
vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});

import { makeRowClock, mainStepFromOnsets, exactStepFromOnsets, makeOnsetPlacer } from '../formats/stepRowClock';
import { parseModuleToSong } from '../parseModuleToSong';
import { walkDavidWhittaker, DW_WALK } from '../formats/DavidWhittakerWasmExtractor';
import { dwRowClock } from '../formats/davidWhittakerGrid';
import { parseBenDaglishFile } from '../formats/BenDaglishParser';
import { walkBenDaglish } from '../formats/BenDaglishWasmExtractor';
import { bdNotePlacements, bdRowClock } from '../formats/benDaglishGrid';
import { BD_FX } from '../formats/benDaglishEffectGlyphs';
import { buildRobHubbardGrid } from '../formats/RobHubbardParser';
import { rhRowClock, rhTickToRow, buildRHGridFromWalk } from '../formats/robHubbardGrid';
import { RH_WALK } from '../formats/rhWalk';
import { installWasmNodeFetches } from './helpers/dwNodeFetch';
import { timFollinOnsetTicks, buildTimFollinGrid } from '../formats/timFollinGrid';
import { sdrOnsetTicks, buildSdrGrid } from '../formats/synthDreamGrid';
import { buildBthGrid } from '../formats/beathovenGrid';
import { sapOnsetsOf } from '../formats/SAPParser';
import { daveLoweEncoderForStep } from '../formats/DaveLoweParser';
import type { TrackerSong } from '@/engine/TrackerReplayer';

let restore = () => {};
beforeAll(() => { restore = installWasmNodeFetches([['davidwhittaker', 'DavidWhittaker'], ['bd', 'Bd']]); });
afterAll(() => restore());

const bytesOf = (rel: string): ArrayBuffer => {
  const f = readFileSync(resolve(process.cwd(), 'public/data/songs', rel));
  return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
};

describe('step grid: David Whittaker through parseModuleToSong', () => {
  it('garfield2+.dw: one row per song step, speed 10, 19 patterns, every note on its walk tick', async () => {
    const ab = bytesOf('david-whittaker/garfield2+.dw');
    const before = vi.mocked(makeRowClock).mock.calls.length;
    const song = await parseModuleToSong(new File([ab.slice(0)], 'garfield2+.dw'));
    expect(vi.mocked(makeRowClock).mock.calls.length, 'the row clock ran during the import').toBeGreaterThan(before);

    expect(song.initialSpeed).toBe(10);
    expect(song.initialBPM).toBe(125);                       // no frame skip on this tune
    for (const pat of song.patterns) for (const ch of pat.channels) {
      expect(ch.channelMeta?.effectCols, 'the editor shows every effect slot the grid fills').toBeGreaterThanOrEqual(5);
    }
    expect(song.patterns.length, 'ceil(1216 rows / 64), not 191').toBe(Math.ceil(12160 / 10 / 64));

    const walk = await walkDavidWhittaker(ab.slice(0), 60_000, 0);
    const clock = dwRowClock(walk);
    // (a note on the wrap tick starts the next pass: the order loop plays it at row 0, so the grid does not draw it)
    // note rows per channel over the song order, against the walk's own note ticks
    const rows: number[][] = Array.from({ length: walk.channels }, () => []);
    song.songPositions.forEach((pi, pos) => {
      song.patterns[pi].channels.forEach((ch, c) => ch.rows.forEach((cell, r) => { if (cell.note > 0 && cell.note < 97) rows[c].push(pos * 64 + r); }));
    });
    for (let c = 0; c < walk.channels; c++) {
      const ticks = walk.events.filter((e) => e.channel === c && e.kind === DW_WALK.note && e.ptick < walk.processedTicks).map((e) => e.ptick);
      expect(rows[c].length, `voice ${c + 1} note count`).toBe(ticks.length);
      rows[c].forEach((row, i) => expect(row * song.initialSpeed, `voice ${c + 1} note ${i}`).toBe(ticks[i]));
      expect(ticks.every((t) => clock.tickToRow(t).offset === 0), 'no note off the step').toBe(true);
    }
    const deltas = new Map<number, number>();
    for (const list of rows) for (let i = 1; i < list.length; i++) deltas.set(list[i] - list[i - 1], (deltas.get(list[i] - list[i - 1]) ?? 0) + 1);
    const most = [...deltas.entries()].sort((a, b) => b[1] - a[1])[0][0];
    expect(most, 'the most common gap between notes is 1 row (10 ticks before)').toBe(1);
  });
});

const BD_SONGS = [
  { path: 'ben-daglish/motorhead-titleandingame.bd', step: 5, delayed: 32, clashes: 16, delayedVoice: 3 },
  { path: 'formats/mickey_mouse.bd', step: 8, delayed: 118, clashes: 0, delayedVoice: 1 },
];

describe('step grid: Ben Daglish through parseBenDaglishFile', () => {
  for (const s of BD_SONGS) {
    it(`${s.path}: step ${s.step}, ${s.delayed} delayed notes, ${s.clashes} same-row clashes`, async () => {
      const ab = bytesOf(s.path);
      const clockCalls = vi.mocked(makeRowClock).mock.calls.length;
      const stepCalls = vi.mocked(mainStepFromOnsets).mock.calls.length;
      const song = await parseBenDaglishFile(ab.slice(0), s.path.split('/').pop()!) as unknown as TrackerSong;
      expect(vi.mocked(makeRowClock).mock.calls.length, 'the row clock ran during the import').toBeGreaterThan(clockCalls);
      expect(vi.mocked(mainStepFromOnsets).mock.calls.length, 'the shared step function ran during the import').toBeGreaterThan(stepCalls);

      expect(song.initialSpeed).toBe(s.step);

      const walk = await walkBenDaglish(ab.slice(0), 0);
      const { placed, unplaced } = bdNotePlacements(walk, bdRowClock(walk));
      expect(unplaced.length).toBe(0);
      const delayed = placed.filter((p) => p.offset > 0);
      const clashes = placed.filter((p) => p.col === 1);
      expect(delayed.length, 'delayed notes').toBe(s.delayed);
      expect(clashes.length, 'same-row clashes').toBe(s.clashes);
      expect(new Set(delayed.map((p) => p.voice)), 'delayed voices').toEqual(new Set([s.delayedVoice]));
      if (s.clashes) expect(new Set(clashes.map((p) => p.voice)), 'clash voices').toEqual(new Set([s.delayedVoice]));

      // the song shows them: a delayed note carries its offset in the first effect slot, a clash is in note column 2 with its own delay
      let shownOffsets = 0, shownNote2 = 0, shownDelay2 = 0;
      song.songPositions.forEach((pi) => song.patterns[pi].channels.forEach((ch) => ch.rows.forEach((cell) => {
        if (cell.effTyp === BD_FX.rowOffset) shownOffsets++;
        if (cell.extraNotes?.[0]?.note) { shownNote2++; if ((cell.extraNotes[0].delay ?? 0) > 0) shownDelay2++; }
      })));
      expect(shownNote2).toBe(s.clashes);
      expect(shownDelay2, 'note column 2 delays shown').toBe(clashes.filter((p) => p.offset > 0).length);
      expect(shownOffsets, 'offset effects in the first slot').toBe(placed.filter((p) => p.col === 0 && p.offset > 0).length);
    });
  }
});

describe('step grid: Sound Factory through parseModuleToSong', () => {
  it('goldrunner.psf: main step 6 ticks from the onsets, one row per step, every note on its tick', async () => {
    const ab = bytesOf('formats/goldrunner.psf');
    const clockCalls = vi.mocked(makeRowClock).mock.calls.length;
    const stepCalls = vi.mocked(mainStepFromOnsets).mock.calls.length;
    const song = await parseModuleToSong(new File([ab.slice(0)], 'goldrunner.psf'));
    expect(vi.mocked(makeRowClock).mock.calls.length, 'the row clock ran during the import').toBeGreaterThan(clockCalls);
    expect(vi.mocked(mainStepFromOnsets).mock.calls.length, 'the shared step function ran during the import').toBeGreaterThan(stepCalls);

    // the step is measured from the note onsets (sfMainStep), not hardcoded
    const results = vi.mocked(mainStepFromOnsets).mock.results;
    expect(song.initialSpeed, 'main step in ticks').toBe(results[results.length - 1].value);
    expect(song.initialSpeed).toBe(6);
    expect(song.initialBPM, 'a tick is 20 ms: speed = step at 125 BPM').toBe(125);

    // each onset gap on a voice, in ticks, is what the rows and delays say
    const step = song.initialSpeed;
    let notes = 0, delayed = 0, note2 = 0;
    for (let c = 0; c < song.numChannels; c++) {
      let last = -1;
      song.songPositions.forEach((pi, pos) => {
        const ch = song.patterns[pi].channels[c];
        ch.rows.forEach((cell, r) => {
          if (cell.note > 0) {
            notes++;
            const off = cell.effTyp === BD_FX.rowOffset ? cell.eff : 0;
            if (off > 0) delayed++;
            expect(off, 'delay stays inside the row').toBeLessThan(step);
            const tick = (pos * 64 + r) * step + off;
            expect(tick, `voice ${c + 1} onsets rise`).toBeGreaterThan(last);
            last = tick;
          }
          if (cell.extraNotes?.[0]?.note) { note2++; expect(cell.extraNotes[0].delay ?? 0).toBeLessThan(step); }
        });
      });
    }
    // measured 2026-11-05: one pass of the song, the walk ends at the Goto loop point (2df42a272; was 4444 =
    // loop body repeated up to the 16384-row cap), no two onsets share a row
    expect(notes, 'notes shown').toBe(2078);
    expect(delayed, 'one pass sits on the 6-tick step; the 2363 delays came from loop repeats off the step').toBe(0);
    expect(note2, 'same-row clashes').toBe(0);
    expect(song.patterns.length, 'one pass: 1345 rows in 64-row positions').toBe(22);
  });
});

const RH_SONGS = [
  { path: 'rob-hubbard/skateordie.rh', speed: 5, ticks: 12160 },
  { path: 'rob-hubbard/budokan.rh', speed: 8, ticks: 9472 },
];

describe('step grid: Rob Hubbard through parseModuleToSong', () => {
  for (const s of RH_SONGS) {
    it(`${s.path}: step ${s.speed}, no delayed notes, every note row x speed + 1 is its walk interrupt`, async () => {
      const ab = bytesOf(s.path);
      const before = vi.mocked(makeRowClock).mock.calls.length;
      const song = await parseModuleToSong(new File([ab.slice(0)], s.path.split('/').pop()!));
      expect(vi.mocked(makeRowClock).mock.calls.length, 'the row clock ran during the import').toBeGreaterThan(before);
      expect(song.initialSpeed).toBe(s.speed);

      const g = buildRobHubbardGrid(new Uint8Array(ab.slice(0)));
      expect(g).not.toBeNull();
      const walk = g!.walk;
      expect(walk.speed).toBe(s.speed);
      expect(walk.ticks).toBe(s.ticks);
      const clock = rhRowClock(walk);
      // every event is on the first interrupt of its row: the format has no delayed notes
      expect(walk.events.filter((e) => rhTickToRow(clock, e.tick).offset !== 0).length).toBe(0);
      const rebuilt = buildRHGridFromWalk(walk, () => null);
      expect(rebuilt.offGridEvents).toBe(0);
      expect(rebuilt.rows).toBe(s.ticks / s.speed);

      // the song's note rows per voice are the walk's note interrupts mapped through the clock
      const shown: number[][] = [[], [], [], []];
      song.songPositions.forEach((pi, pos) => song.patterns[pi].channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
        if (cell.note > 0 && cell.note < 97) shown[c].push(pos * 64 + r);
      })));
      const walked: number[][] = [[], [], [], []];
      for (const e of walk.events) if (e.kind === RH_WALK.note && e.voice < 4) walked[e.voice].push(rhTickToRow(clock, e.tick).row);
      for (let v = 0; v < 4; v++) {
        expect(shown[v].length).toBeGreaterThan(0);
        expect(shown[v].map((r) => clock.rowToTick(r) + 1), `voice ${v} note interrupts`).toEqual(walked[v].map((r) => r * s.speed + 1));
      }
    });
  }
});

// Hippel CoSo is a step grid already (one row per replayer step of song.speed vblanks). The oracle here is an independent
// per-voice walk of hippel.c step_voice: an event starts at step s, lasts rowSpeed + 1 steps, FD waits, FF ends the
// pattern and takes no time. Each voice walks on alone; the grid pads a position to its longest voice.
const HIPPEL_SONGS = [
  { path: 'hippel-coso/wings of death (level 3).hipc', speed: 4, positions: 70, positionLength: 32 },
  { path: 'formats/prehistoric_tale.hipc', speed: 7, positions: 30, positionLength: 24 },
];

describe('step grid: Hippel CoSo through parseModuleToSong', () => {
  for (const s of HIPPEL_SONGS) {
    it(`${s.path}: speed ${s.speed}, every note row x speed is its replayer tick`, async () => {
      const ab = bytesOf(s.path);
      const buf = new Uint8Array(ab.slice(0));
      const song = await parseModuleToSong(new File([ab.slice(0)], s.path.split('/').pop()!));
      expect(song.initialSpeed).toBe(s.speed);
      expect(song.songPositions.length).toBe(s.positions);
      const u16 = (o: number) => (buf[o] << 8) | buf[o + 1];
      const u32 = (o: number) => ((buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3]) >>> 0;
      const patternsOff = u32(12), songsOff = u32(20);
      const base = u16(songsOff) * 12 + u32(16);
      const walked: number[][] = [[], [], [], []];
      for (let v = 0; v < 4; v++) {
        let step = 0, rs = 0;
        for (let p = 0; p < s.positions; p++) {
          let pos = u16(patternsOff + buf[base + p * 12 + v * 3] * 2);
          for (let guard = 0; guard < 5000; guard++) {
            let c = buf[pos];
            if (c === 0xff) break;
            let at = pos + 1;
            while (c === 0xfe) { rs = buf[at]; c = buf[at + 1]; at += 2; }
            if (c === 0xff) break;
            if (c === 0xfd) { rs = buf[at]; pos = at + 1; step += rs + 1; continue; }
            const info = buf[at++];
            if (info & 0xe0) at++;
            walked[v].push(step * s.speed);
            step += rs + 1;
            pos = at;
          }
        }
      }
      const shown: number[][] = [[], [], [], []];
      let start = 0;
      for (const pi of song.songPositions) {
        const pat = song.patterns[pi];
        pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => { if (cell.note > 0 && cell.note < 97) shown[c].push((start + r) * s.speed); }));
        start += pat.length;
      }
      for (let v = 0; v < 4; v++) {
        expect(shown[v].length).toBeGreaterThan(0);
        expect(shown[v], `voice ${v} note ticks`).toEqual(walked[v]);
      }
    });
  }
});

// Dave Lowe and Dave Lowe New: authored durations, no speed command. The step is the exact GCD of every duration, so every
// event starts on the first tick of its row. The expected onsets come from an independent decoder over the section bytes
// (the layout's carrier rows), and the grid encoder must hand the same durations back.
const dlSectionOnsets = (bytes: number[]): { onsets: number[]; ticks: number } => {
  const w = (o: number) => (bytes[o] << 8) | bytes[o + 1];
  const onsets: number[] = [];
  let tick = 0;
  for (let o = 0; o + 1 < bytes.length;) {
    const word = w(o); o += 2;
    if (word > 100) { onsets.push(tick); tick += w(o); o += 2; }
    else if (word === 32) { tick += w(o); o += 2; }
    else if (word === 4 || word === 12) o += 4;
    else break;
  }
  return { onsets, ticks: tick };
};

const DL_SONGS = [
  { path: 'dave-lowe/incredibleshrinkingsphere.dl', step: 4 },
  { path: 'dave-lowe-new/m-bison.dln', step: 2 }   // the onset gaps share 4 but some note/rest durations are 2 ticks,
];

describe('step grid: Dave Lowe and Dave Lowe New through parseModuleToSong', () => {
  for (const s of DL_SONGS) {
    it(`${s.path}: one row per ${s.step}-tick step, every onset on (row)*step, encoder returns the durations`, async () => {
      const ab = bytesOf(s.path);
      const before = vi.mocked(makeRowClock).mock.calls.length;
      const song = await parseModuleToSong(new File([ab.slice(0)], s.path.split('/').pop()!));
      expect(vi.mocked(makeRowClock).mock.calls.length, 'the row clock ran during the import').toBeGreaterThan(before);
      expect(song.initialSpeed).toBe(s.step);
      const layout = song.uadeVariableLayout!;      const file = new Uint8Array(ab);
      const sec = layout.filePatternAddrs.map((addr, i) => dlSectionOnsets(Array.from(file.subarray(addr, addr + layout.filePatternSizes[i]))));
      expect(sec.every((x) => x.ticks % s.step === 0), 'every section length is a step multiple').toBe(true);

      let checked = 0;
      let start = 0;
      song.songPositions.forEach((pi, pos) => {
        const pat = song.patterns[pi];
        layout.trackMap[pos].forEach((fp, ch) => {
          const shown: number[] = [];
          pat.channels[ch].rows.forEach((cell, r) => { if (cell.note > 0 && cell.note !== 97) shown.push((start + r) * s.step); });   // (a rest after a note is a note-off cell, 97: not a note-on)
          const want = fp < 0 ? [] : sec[fp].onsets.filter((t) => t / s.step < pat.length).map((t) => start * s.step + t);   // (the parsers cap a pattern at 256 rows)
          expect(shown, `position ${pos} channel ${ch}`).toEqual(want);
          checked += shown.length;
          if (fp >= 0 && shown.length) {
            const bytes = daveLoweEncoderForStep(s.step).encodePattern(pat.channels[ch].rows, ch);
            expect(dlSectionOnsets(Array.from(bytes)).onsets, `re-encoded onsets, position ${pos} channel ${ch}`).toEqual(sec[fp].onsets.filter((t) => t / s.step < pat.length));
          }
        });
        start += pat.length;
      });
      console.log(`DL ${s.path}: notes ${checked}, positions ${song.songPositions.length}`);
      expect(checked).toBeGreaterThan(100);
    });
  }
});

describe('step grid: Tim Follin through parseModuleToSong', () => {
  it('sly spy title.tf: one row per measured step, every onset on (pos*rows+row)*step + delay', async () => {
    const rel = 'follin-player-ii/sly spy title.tf';
    const ab = bytesOf(rel);
    const beforeClock = vi.mocked(makeRowClock).mock.calls.length;
    const beforePlacer = vi.mocked(makeOnsetPlacer).mock.calls.length;
    const song = await parseModuleToSong(new File([ab.slice(0)], 'sly spy title.tf'));
    expect(vi.mocked(makeRowClock).mock.calls.length, 'the shared row clock ran').toBeGreaterThan(beforeClock);
    expect(vi.mocked(makeOnsetPlacer).mock.calls.length, 'the shared onset placer ran').toBeGreaterThan(beforePlacer);
    const walk = timFollinOnsetTicks(new Uint8Array(ab))!;
    const step = mainStepFromOnsets(walk);
    expect(step).toBe(6);
    expect(song.initialSpeed).toBe(step);
    let delayed = 0, second = 0, grown = 0, left = 0;
    const usedCols = new Set<number>();   // sentinel: zero-based column indexes that carry a note
    const gridCols = buildTimFollinGrid(new Uint8Array(ab))!.noteCols;
    walk.forEach((want, v) => {
      const shown: number[] = [];
      let measuredCols = 1;
      song.songPositions.forEach((pi, pos) => {
        const pat = song.patterns[pi];
        pat.channels[v].rows.forEach((cell, r) => {
          const base = (pos * 64 + r) * step;   // all patterns but the last hold 64 rows
          if (cell.note > 0) {
            const delay = cell.effTyp === BD_FX.rowOffset ? cell.eff : 0;
            if (delay) delayed++;
            shown.push(base + delay);
          }
          (cell.extraNotes ?? []).forEach((x, i) => {
            const k = i + 2;
            if ((x.note ?? 0) > 0) { second++; if (k > 2) grown++; shown.push(base + (x.delay ?? 0)); measuredCols = Math.max(measuredCols, k); usedCols.add(k - 1); }
          });
        });
      });
      // plan rule R5: the voice's note columns equal its largest same-row clash, uncapped; no onset is left out
      shown.sort((a, b) => a - b);
      const perRow = new Map<number, number>();
      let clash = 0;
      const kept: number[] = [];
      for (const t of want) {
        const row = Math.floor(t / step);
        const n = (perRow.get(row) ?? 0) + 1;
        perRow.set(row, n);
        clash = Math.max(clash, n);
        kept.push(t);
      }
      expect(shown, `voice ${v}`).toEqual(kept);
      expect(gridCols[v], `voice ${v} note columns = measured max clash`).toBe(clash);
      expect(song.patterns[0].channels[v].channelMeta?.noteCols, `voice ${v} declared note columns`).toBe(clash);
      expect(measuredCols).toBeLessThanOrEqual(clash);
    });
    const grid = buildTimFollinGrid(new Uint8Array(ab))!;
    expect(grid.unplacedNotes, 'no onset is left out').toBe(0);
    expect(left, 'no onset is left out').toBe(0);
    expect(gridCols[3], 'voice 4 needs five note columns').toBe(5);
    expect(usedCols.has(4), 'column index 4 carries a note').toBe(true);
    console.log(`TF sly spy: step ${step}, onsets ${walk.map((w) => w.length).join('/')}, delayed ${delayed}, extra columns ${second} (beyond column 2: ${grown}), note columns ${gridCols.join('/')}, left out ${left} (measured max clash per voice 2/2/2/5, uncapped note columns)`);
    expect(grown, 'a clash deeper than two ran the grow path').toBeGreaterThan(0);
    expect(delayed + second).toBeGreaterThan(0);
  });
});

/** Every note of a voice in a parsed song as the tick it starts on: (pos*64 + row)*step + row offset or column delay. */
function shownTicks(song: TrackerSong, v: number, step: number): number[] {
  const out: number[] = [];
  song.songPositions.forEach((pi, pos) => {
    song.patterns[pi].channels[v].rows.forEach((cell, r) => {
      const base = (pos * 64 + r) * step;
      if (cell.note > 0) out.push(base + (cell.effTyp === BD_FX.rowOffset ? cell.eff : 0));
      (cell.extraNotes ?? []).forEach((x) => { if ((x.note ?? 0) > 0) out.push(base + (x.delay ?? 0)); });
    });
  });
  return out.sort((a, b) => a - b);
}

describe('step grid: Synth Dream through parseModuleToSong', () => {
  for (const [file, step] of [['sdr.nobuddiesland end 2', 4], ['sdr.nobuddiesland jigsaw', 6]] as const) {
    it(`${file}: main step ${step} from the command onsets, off-step commands keep their tick as an offset, none dropped`, async () => {
      const ab = bytesOf(`synth-dream/${file}`);
      const before = vi.mocked(mainStepFromOnsets).mock.calls.length;
      const beforePlacer = vi.mocked(makeOnsetPlacer).mock.calls.length;
      const song = await parseModuleToSong(new File([ab.slice(0)], file));
      expect(vi.mocked(mainStepFromOnsets).mock.calls.length, 'the main-step helper ran').toBeGreaterThan(before);
      expect(vi.mocked(makeOnsetPlacer).mock.calls.length, 'the onset placer ran').toBeGreaterThan(beforePlacer);
      const onsets = sdrOnsetTicks(new Uint8Array(ab))!;
      expect(mainStepFromOnsets(onsets)).toBe(step);
      expect(song.initialSpeed).toBe(step);
      const grid = buildSdrGrid(new Uint8Array(ab))!;
      const shown = sdrOnsetTicks(new Uint8Array(ab), 0, true)!;
      let placed = 0, wanted = 0;
      onsets.forEach((_want, v) => {
        const got = shownTicks(song, v, step);
        // a command with no note (modifier only) shows an empty cell, so only note-bearing onsets are compared
        const shownWant = shown[v];
        expect(got, `voice ${v}`).toEqual(shownWant);
        placed += got.length; wanted += shownWant.length;
        expect(song.patterns[0].channels[v].channelMeta?.noteCols).toBe(grid.noteCols[v]);
      });
      expect(placed).toBe(wanted);
      expect(grid.delayedNotes, 'off-step commands carry an offset').toBeGreaterThan(0);
      console.log(`SDR ${file}: step ${step}, onsets ${onsets.map((o) => o.length).join('/')}, delayed ${grid.delayedNotes}, note columns ${grid.noteCols.join('/')}`);
    });
  }
});

describe('step grid: Beathoven through parseModuleToSong', () => {
  for (const [file, step] of [['formats/beathoven_smallest.bss', 5], ['formats/tristar_cracktro.bss', 2]] as const) {
    it(`${file}: exact GCD step ${step}, every onset on row*step with no offset`, async () => {
      const ab = bytesOf(file);
      const before = vi.mocked(exactStepFromOnsets).mock.calls.length;
      const song = await parseModuleToSong(new File([ab.slice(0)], file.split('/').pop()!));
      expect(vi.mocked(exactStepFromOnsets).mock.calls.length, 'the exact-step helper ran').toBeGreaterThan(before);
      const grid = buildBthGrid(new Uint8Array(ab));
      if (typeof grid === 'string') throw new Error(grid);
      expect(grid.step).toBe(step);
      expect(song.initialSpeed).toBe(step);
      let placed = 0, wanted = 0;
      grid.onsets.forEach((ticks, v) => {
        const rows = song.patterns.flatMap((p) => p.channels[v].rows);
        const got: number[] = [];
        rows.forEach((c, r) => { expect(c.effTyp, 'no row offset').not.toBe(BD_FX.rowOffset); if (c.note !== 0) got.push(r * step); });
        expect(got, `voice ${v}: row*step equals the onset tick`).toEqual(ticks);
        placed += got.length; wanted += ticks.length;
      });
      expect(placed).toBe(wanted);
      expect(wanted).toBeGreaterThan(0);
      console.log(`BSS ${file}: step ${step}, onsets ${wanted}, placed ${placed}, offsets 0`);
    });
  }
});

describe('step grid: SAP through parseModuleToSong', () => {
  for (const file of ['warhawk.sap', 'chop suey.sap', 'amaurote.sap']) {
    it(`${file}: main step from the frame onsets, row*step + offset equals every onset frame, none dropped`, async () => {
      const ab = bytesOf(`sap/${file}`);
      const beforeMain = vi.mocked(mainStepFromOnsets).mock.calls.length;
      const beforePlacer = vi.mocked(makeOnsetPlacer).mock.calls.length;
      const song = await parseModuleToSong(new File([ab.slice(0)], file));
      expect(vi.mocked(mainStepFromOnsets).mock.calls.length, 'the main-step helper ran').toBeGreaterThan(beforeMain);
      expect(vi.mocked(makeOnsetPlacer).mock.calls.length, 'the onset placer ran').toBeGreaterThan(beforePlacer);
      const want = sapOnsetsOf(ab);
      const step = mainStepFromOnsets(want.map((o) => o.map((x) => x.tick)));
      expect(song.initialSpeed).toBe(step);
      let placed = 0, total = 0, delayed = 0;
      want.forEach((list, v) => {
        const got: number[] = [];
        song.patterns[0].channels[v].rows.forEach((cell, r) => {
          if (cell.note > 0) { const d = cell.effTyp === BD_FX.rowOffset ? cell.eff : 0; if (d) delayed++; got.push(r * step + d); }
          (cell.extraNotes ?? []).forEach((x) => { if ((x.note ?? 0) > 0) { if (x.delay) delayed++; got.push(r * step + (x.delay ?? 0)); } });
        });
        got.sort((a, b) => a - b);
        // an onset whose pitch fell outside the note range (note 0) shows an empty cell, as before; every real note and note-off lands
        const shown = list.filter((x) => x.note > 0).map((x) => x.tick);
        expect(got, `voice ${v}`).toEqual(shown);
        placed += got.length; total += shown.length;
      });
      expect(placed).toBe(total);
      expect(total).toBeGreaterThan(0);
      console.log(`SAP ${file}: step ${step}, onsets ${total}, delayed ${delayed}`);
    });
  }
});
