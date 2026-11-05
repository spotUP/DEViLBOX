/**
 * The David Whittaker grid of every tune sits where the ORIGINAL player starts its notes.
 *
 * Oracle: UADE running the original 68k player on the file, its Paula register writes read by
 * gridOracle (a note on = a sample pointer then a period). UADE numbers the tunes its own way
 * (apb.dw: UADE tune 2 is table entry 2 and entry 1 is never offered), so the tune under test is
 * copied over table entry 0 in a copy of the module and UADE tune 1 plays it. The table is found
 * by the position-list pointers the player holds in chip RAM once it runs.
 *
 * The grid's clock is the one the tracker's scheduler uses to move the cursor
 * (TrackerReplayer: a row lasts initialSpeed * 2.5 / initialBPM seconds), so a grid whose rows are
 * 50 Hz ticks but whose song speed is the module's (3, 5...) puts the cursor at a third or a fifth
 * of the sound: the notes the grid shows at second S are not the notes that play at second S.
 * Fixed by the step grid: one row is one song step (initialSpeed = module speed), frame-skip modules
 * carry a fractional initialBPM, so the drift cause is gone (stepGridReachability.test.ts).
 *
 * Held to: every note-on the grid shows, on the voice it shows it, is a Paula note-on within
 * TOLERANCE_MS, over the span before the tune's stop-song command (UADE moves on to the next tune
 * after it) and at most WINDOW_SECONDS.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { openUade, PaulaSession, readChipRam, type PaulaLogModule } from './gridOracle';
import { rowSeconds, gridOnsets, paulaOnsetsOf, onsetMatch } from './gridClockOracle';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';
import { parseDavidWhittakerFile } from '@/lib/import/formats/DavidWhittakerParser';
import { walkDavidWhittaker, dwSubsongCount, DW_WALK } from '@/lib/import/formats/DavidWhittakerWasmExtractor';

const FILES = ['public/data/songs/formats/apb.dw', 'public/data/songs/david-whittaker/garfield2+.dw'];
const TOLERANCE_MS = 60;
const WINDOW_SECONDS = 60;
const MIN_COVERAGE = 0.95;

/** The offset of the song table (10-byte entries: speed, delay, four position-list pointers) in the file. */
function tableOffset(mod: PaulaLogModule, bytes: Uint8Array, name: string): number {
  const sess = new PaulaSession(mod, bytes, name, { subsong: 1 });
  for (let i = 0; i < 20; i++) sess.step();
  const ram = readChipRam(mod, 0, 0x200000);
  sess.close();
  let chan = -1;
  for (let i = 0x40; i < 0x200; i += 2) {
    if (bytes[i] === 0x51 && bytes[i + 1] === 0xeb && bytes[i + 4] === 0x43 && bytes[i + 5] === 0xfa) { chan = i + 6 + ((bytes[i + 6] << 24 >> 16) | bytes[i + 7]); break; }
  }
  let base = -1;
  outer: for (let a = 0; a < ram.length - 64; a += 2) {
    for (let k = 0; k < 64; k++) if (ram[a + k] !== bytes[0x50 + k]) continue outer;
    base = a - 0x50; break;
  }
  if (base < 0 || chan < 0) return -1;
  const lists = [0, 1, 2, 3].map((c) => (ram[base + chan + c * 0x30 + 8] << 8) | ram[base + chan + c * 0x30 + 9]);
  for (let o = 0; o < bytes.length - 10; o++) {
    if (lists.every((l, c) => ((bytes[o + 2 + c * 2] << 8) | bytes[o + 3 + c * 2]) === l)) return o;
  }
  return -1;
}

/** Per voice, the seconds at which the original player starts a note, `seconds` of tune `tune` (copied over table entry 0). */
function paulaOnsets(mod: PaulaLogModule, bytes: Uint8Array, name: string, table: number, tune: number, seconds: number): number[][] {
  const patched = bytes.slice();
  patched.copyWithin(table, table + 10 * tune, table + 10 * tune + 10);
  return paulaOnsetsOf(new PaulaSession(mod, patched, name, { subsong: 1 }), seconds, true);
}

describe('David Whittaker grids against the original player (UADE Paula note-ons)', { timeout: 900_000 }, () => {
  let restore = () => {};
  beforeAll(() => { restore = installDwNodeFetch(); });
  afterAll(() => restore());

  for (const rel of FILES) {
    const name = rel.split('/').pop()!;
    it(`${name}: every tune's grid notes are the notes the player starts, when it starts them`, async () => {
      const bytes = new Uint8Array(readFileSync(rel));
      const ab = bytes.slice().buffer as ArrayBuffer;
      const table = tableOffset(await openUade(), bytes, name);
      expect(table, 'the song table was found from the player in chip RAM').toBeGreaterThan(0);
      const count = await dwSubsongCount(ab);
      let compared = 0;
      const rows: string[] = [];
      const misses: string[] = [];
      for (let tune = 0; tune < count; tune++) {
        const walk = await walkDavidWhittaker(ab.slice(0), 60_000, tune);
        if (!walk.events.some((e) => e.kind === DW_WALK.note)) continue;       // a silent tune has nothing to compare
        const stop = walk.events.find((e) => e.kind === DW_WALK.stopSong);
        const span = Math.min(WINDOW_SECONDS, ((stop ? stop.tick : walk.ticks) - 3) / 50);
        const song = await parseDavidWhittakerFile(ab.slice(0), name, 0, tune);
        const grid = gridOnsets(song);
        // a fresh UADE per tune: a second load in one instance carries the first tune's state over
        const paula = paulaOnsets(await openUade(), bytes, name, table, tune, span + 1);
        // every voice, silent ones too: 0x82 points a voice at 64 zero bytes (a Paula pointer + period write that
        // is no sound), so the original's audible note-ons on voices 3 and 4 of apb.dw tune 0 are none, as the grid's
        if (process.env.DW_TABLE) rows.push(`tune ${tune} span ${span.toFixed(2)} stop ${stop?.tick} ticks ${walk.ticks} paula ${paula.map((l) => l.filter((t) => t <= span).map((t) => t.toFixed(2)).join('/')).join(' | ')} grid ${grid.map((l) => l.filter((t) => t <= span).map((t) => t.toFixed(2)).join('/')).join(' | ')}`);
        for (const m of onsetMatch(grid, paula, span, TOLERANCE_MS)) {
          const what = `${name} tune ${tune} voice ${m.voice + 1}: grid ${m.grid} notes (${m.gridHit} on a player note), player ${m.player} audible note-ons (${m.playerHit} on a grid note), row = ${rowSeconds(song) * 1000} ms`;
          const ok = (hit: number, n: number): boolean => n === 0 || hit / n >= MIN_COVERAGE;
          if (!ok(m.gridHit, m.grid) || !ok(m.playerHit, m.player) || (m.player === 0) !== (m.grid === 0)) misses.push(what);
          rows.push(`${name} tune ${tune} v${m.voice + 1}: grid ${m.grid} hit ${m.gridHit} | player ${m.player} hit ${m.playerHit}`);
          compared++;
        }
      }
      if (process.env.DW_TABLE) console.log(rows.join('\n'));
      expect(misses, 'voices where the grid and the player disagree').toEqual([]);
      expect(compared, 'voices compared').toBeGreaterThanOrEqual(name === 'apb.dw' ? 32 : 12);
    });
  }

  // The order loops: pass 2 is the grid's rows replayed from the order's loop start. A grid one row too long per pass
  // (the wrap tick drawn as an extra row) is in step for pass 1 and runs one row late from pass 2 on.
  const SECOND_PASS_SECONDS = 20;
  // Only apb.dw: UADE ends garfield2+.dw tune 0 (a 243 s pass) at about 238 s, before its second pass starts, so the
  // original has no second pass to compare there. Voices 3 and 4 of apb.dw tune 0 start notes from 8.50 s (tick 424, the
  // end of pass 1) that the walk never shows: those are tune 1's notes (samples 0xd7d0 / 0xe4f2, lists 0x9c0 / 0x99e).
  // The 68k player never leaves its song (its end-of-list code at 0x502 restarts the list in place and nothing in it calls
  // the init entry at 0x0); UADE re-enters the init for the next table entry once every voice has wrapped. A voice without
  // grid notes is therefore not compared past pass 1, and the grid and the C walk are right.
  for (const rel of FILES.slice(0, 1)) {
    const name = rel.split('/').pop()!;
    it(`${name}: tune 0 stays on the player's notes through the second pass of the order`, async () => {
      const bytes = new Uint8Array(readFileSync(rel));
      const ab = bytes.slice().buffer as ArrayBuffer;
      const table = tableOffset(await openUade(), bytes, name);
      expect(table).toBeGreaterThan(0);
      const song = await parseDavidWhittakerFile(ab.slice(0), name, 0, 0);
      const rowCount = song.songPositions.reduce((n, p) => n + song.patterns[p].length, 0);
      if (name === 'apb.dw') expect(rowCount, 'apb.dw tune 0: 128 rows at speed 3 are the 384 ticks of one pass').toBe(128);
      expect(song.restartPosition ?? 0, 'the order loops to its first step').toBe(0);
      const pass = rowCount * rowSeconds(song);
      const grid = gridOnsets(song).map((l) => [...l, ...l.map((t) => t + pass)]);
      const span = Math.min(pass + SECOND_PASS_SECONDS, 2 * pass);
      const paula = paulaOnsets(await openUade(), bytes, name, table, 0, span + 1);
      const misses: string[] = [];
      for (const m of onsetMatch(grid, paula, span, TOLERANCE_MS)) {
        if (m.grid === 0) continue;
        const ok = (hit: number, n: number): boolean => n === 0 || hit / n >= MIN_COVERAGE;
        if (!ok(m.gridHit, m.grid) || !ok(m.playerHit, m.player)) misses.push(`${name} voice ${m.voice + 1}: grid ${m.grid} (${m.gridHit} hit), player ${m.player} (${m.playerHit} hit), pass ${pass.toFixed(3)} s`);
      }
      expect(misses, 'voices that fall out of step in pass 2').toEqual([]);
    });
  }
});
