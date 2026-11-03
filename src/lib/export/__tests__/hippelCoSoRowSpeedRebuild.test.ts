/**
 * A CoSo row carries its speed byte (FE n in front of a note, FD n as an empty row). The grid kept none, so a module laid
 * out again from the grid (hippelCoSoModule falls back to it when the in-place patch refuses an edit) wrote every empty row
 * as FD 00 and dropped every FE n: a timing change in the player. The row speed is now the cell's speed effect.
 */
import { describe, it, expect } from 'vitest';
import { hippelCoSoModule } from '../HippelCoSoExporter';
import { parseAs, readFixture } from './exporterHarness.shared';

const FIXTURE = 'public/data/songs/formats/prehistoric_tale.hipc';

describe('CoSo rebuild from the grid keeps FE n / FD n', () => {
  it('prehistoric_tale: every row speed survives a rebuild forced by a cleared note', async () => {
    const song = await parseAs(FIXTURE, readFixture(FIXTURE));
    const speeds = (s: typeof song) => s.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows.map((r) => (r.effTyp === 0x0F ? r.eff : -1))));
    const before = speeds(song);
    expect(before.filter((n) => n > 0).length, 'fixture has FE n / FD n with n != 0').toBeGreaterThan(0);

    // A cleared note cannot be patched in place, so the module is written again from the grid.
    let cleared = false;
    for (const p of song.patterns) for (const c of p.channels) for (const [i, r] of c.rows.entries()) {
      if (!cleared && r.note > 13 && r.note < 48 && r.effTyp !== 0x0F) { c.rows[i] = { ...r, note: 0, instrument: 0 }; cleared = true; }
    }
    const module = hippelCoSoModule(song);
    expect(module!.fromGrid).toBe(true);

    const back = await parseAs(FIXTURE, module!.bytes);
    const after = speeds(back);
    expect(after.filter((n) => n > 0)).toEqual(before.filter((n) => n > 0));
    expect(after.length).toBe(before.length);
  });
});
