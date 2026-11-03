/**
 * The CoSo grid is time-aligned: one row is one replayer step, one song position is one grid pattern. Each voice is
 * independent in hippel.c (own pattern, own row speed; an event lasts row speed + 1 steps), so the old grid, one row per
 * event, put the channels at different times and showed the per-voice speed as F effects a tracker reads as global.
 *
 * prehistoric_tale.hipc: song speed 7, every position 1..28 lasts 24 steps on all four voices. Position 1: voice 0 is
 * FE 03 and six notes (4 steps each), voice 1 an FD 01 row (2 steps) and notes, voices 2 and 3 one FD 17 row (24 steps).
 */
import { describe, it, expect } from 'vitest';
import { hippelCoSoModule } from '../HippelCoSoExporter';
import { parseAs, readFixture } from './exporterHarness.shared';

const FIXTURE = 'public/data/songs/formats/prehistoric_tale.hipc';

/** Rows with a note, per voice, of grid pattern `p`. */
const noteRows = (song: Awaited<ReturnType<typeof parseAs>>, p: number, ch: number) =>
  song.patterns[p].channels[ch].rows.flatMap((c, r) => (c.note > 0 ? [r] : []));

describe('CoSo grid is one row per replayer step', () => {
  it('position 1 is 24 rows; voice 0 plays its notes every 4 rows; every voice ends on row 24', async () => {
    const song = await parseAs(FIXTURE, readFixture(FIXTURE));
    const pat = song.patterns[1];
    expect(pat.length).toBe(24);
    for (const c of pat.channels) expect(c.rows.length).toBe(24);
    // FE 3 = 4 steps per row: six notes at rows 0, 4, ... 20, the last one held to row 24.
    expect(noteRows(song, 1, 0)).toEqual([0, 4, 8, 12, 16, 20]);
    // Its last event (row 20) plus the 4 steps it lasts ends exactly on row 24, where the other voices end too.
    expect(noteRows(song, 1, 0).at(-1)! + 4).toBe(24);
    const first = pat.channels[0].rows[0];
    expect(first.instrument).toBeGreaterThan(0);
    // Voice 1 starts after its FD 01 row (2 steps) and plays on every 4th row; voices 2 and 3 hold one 24-step row.
    expect(noteRows(song, 1, 1)[0]).toBe(2);
    expect(noteRows(song, 1, 2)).toEqual([]);
    expect(noteRows(song, 1, 3)).toEqual([]);
    // No cell carries a speed effect: the speed is the spacing of the events.
    for (const c of pat.channels) expect(c.rows.every((r) => r.effTyp === 0 && r.eff === 0)).toBe(true);
    // Playing the grid takes song.speed vblanks per row.
    expect(song.initialSpeed).toBe(7);
    expect(song.initialBPM).toBe(125);
  });

  it('every position 1..28 is 24 rows, the last 23, and the first one step', async () => {
    const song = await parseAs(FIXTURE, readFixture(FIXTURE));
    expect(song.patterns[0].length).toBe(1);
    for (let p = 1; p <= 28; p++) expect(song.patterns[p].length).toBe(24);
    expect(song.patterns[29].length).toBe(23);
  });

  it('an edited note exports in place from the original bytes and re-decodes on the same row', async () => {
    const song = await parseAs(FIXTURE, readFixture(FIXTURE));
    // Voice 3 of position 10 is a block no other step or voice uses, so the edit fits in place.
    const cell = song.patterns[10].channels[3].rows[12];
    expect(cell.note).toBeGreaterThan(0);
    song.patterns[10].channels[3].rows[12] = { ...cell, note: cell.note + 2 };
    const module = hippelCoSoModule(song)!;
    expect(module.fromGrid, 'patched in place, not rebuilt').toBe(false);
    const back = await parseAs(FIXTURE, module.bytes);
    expect(back.patterns[10].channels[3].rows[12].note).toBe(cell.note + 2);
    expect(noteRows(back, 10, 3)).toEqual(noteRows(song, 10, 3));
  });

  it('a module laid out again from the grid keeps every position length and note row', async () => {
    const song = await parseAs(FIXTURE, readFixture(FIXTURE));
    // A cleared note cannot be patched in place, so the module is written again from the grid.
    song.patterns[1].channels[0].rows[8] = { ...song.patterns[1].channels[0].rows[8], note: 0, instrument: 0 };
    const module = hippelCoSoModule(song)!;
    expect(module.fromGrid).toBe(true);
    const back = await parseAs(FIXTURE, module.bytes);
    expect(back.patterns.map((p) => p.length)).toEqual(song.patterns.map((p) => p.length));
    expect(noteRows(back, 1, 0)).toEqual([0, 4, 12, 16, 20]);
    expect(back.initialSpeed).toBe(7);
  });
});
