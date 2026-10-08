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
 *
 * Held to: every note-on the grid shows, on the voice it shows it, is a Paula note-on within
 * TOLERANCE_MS, over the span before the tune's stop-song command (UADE moves on to the next tune
 * after it) and at most WINDOW_SECONDS.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { openUade, PaulaSession, readChipRam, type PaulaLogModule } from './gridOracle';
import { rowSeconds, gridOnsets, paulaOnsetsOf, onsetCoverage } from './gridClockOracle';
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
  return paulaOnsetsOf(new PaulaSession(mod, patched, name, { subsong: 1 }), seconds);
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
      for (let tune = 0; tune < count; tune++) {
        const walk = await walkDavidWhittaker(ab.slice(0), 60_000, tune);
        if (!walk.events.some((e) => e.kind === DW_WALK.note)) continue;       // a silent tune has nothing to compare
        const stop = walk.events.find((e) => e.kind === DW_WALK.stopSong);
        const span = Math.min(WINDOW_SECONDS, ((stop ? stop.tick : walk.ticks) - 3) / 50);
        const song = await parseDavidWhittakerFile(ab.slice(0), name, 0, tune);
        const grid = gridOnsets(song);
        // a fresh UADE per tune: a second load in one instance carries the first tune's state over
        const paula = paulaOnsets(await openUade(), bytes, name, table, tune, span + 1);
        for (const { voice, notes, hit } of onsetCoverage(grid, paula, span, TOLERANCE_MS)) {
          expect(hit / notes, `${name} tune ${tune} voice ${voice + 1}: ${hit} of ${notes} grid notes sit on a note the player starts (row = ${rowSeconds(song) * 1000} ms)`).toBeGreaterThanOrEqual(MIN_COVERAGE);
          compared++;
        }
      }
      expect(compared, 'voices compared').toBeGreaterThanOrEqual(name === 'apb.dw' ? 14 : 4);
    });
  }
});
