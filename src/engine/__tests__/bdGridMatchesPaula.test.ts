/**
 * The Ben Daglish grid sits where the ORIGINAL player starts its notes (UADE Paula note-ons).
 *
 * Same oracle and clock as dwGridMatchesPaula (gridClockOracle): the grid's rows are 50 Hz replayer
 * ticks, so the song the tracker's scheduler plays must spend one tick per row (initialSpeed 1 at
 * 125 BPM); with the old speed of 6 the cursor ran at a sixth of the sound. UADE offers tunes 0 and 2
 * of motorhead (as apb.dw, it never offers tune 1): UADE tune 1 plays tune 0, UADE tune 2 plays tune 2.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { openUade, PaulaSession } from './gridOracle';
import { rowSeconds, gridOnsets, paulaOnsetsOf, onsetCoverage } from './gridClockOracle';
import { installWasmNodeFetches } from '@/lib/import/__tests__/helpers/dwNodeFetch';
import { parseBenDaglishFile } from '@/lib/import/formats/BenDaglishParser';

const FILE = 'public/data/songs/ben-daglish/motorhead-titleandingame.bd';
const TOLERANCE_MS = 60;
const SPAN_SECONDS = 30;
const MIN_COVERAGE = 0.95;
/** [tune of the grid, UADE tune that plays it] */
const PAIRS: ReadonlyArray<readonly [number, number]> = [[0, 1], [2, 2]];

describe('Ben Daglish motorhead grids against the original player (UADE Paula note-ons)', { timeout: 300_000 }, () => {
  let restore = () => {};
  beforeAll(() => { restore = installWasmNodeFetches([['bd', 'Bd']]); });
  afterAll(() => restore());

  it.each(PAIRS)('tune %i: every voice\'s grid notes are the notes the player starts, when it starts them', async (tune, uadeTune) => {
    // a fresh UADE per tune: a second load in one instance carries the first tune's state over
    const mod = await openUade();
    const bytes = new Uint8Array(readFileSync(FILE));
    const song = await parseBenDaglishFile(bytes.slice().buffer as ArrayBuffer, 'motorhead.bd', tune);
    const paula = paulaOnsetsOf(new PaulaSession(mod, bytes, 'motorhead.bd', { subsong: uadeTune }), SPAN_SECONDS + 1);
    const cov = onsetCoverage(gridOnsets(song), paula, SPAN_SECONDS - 2, TOLERANCE_MS);
    expect(cov.length, 'voices with notes in the span').toBeGreaterThanOrEqual(2);
    for (const { voice, notes, hit } of cov) {
      expect(hit / notes, `tune ${tune} voice ${voice + 1}: ${hit} of ${notes} grid notes sit on a note the player starts (row = ${rowSeconds(song) * 1000} ms)`).toBeGreaterThanOrEqual(MIN_COVERAGE);
    }
  });
});
