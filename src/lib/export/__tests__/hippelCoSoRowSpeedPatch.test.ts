/**
 * Editing the F (speed) column of a loaded CoSo file patches the original module in place: the FE n byte in front of a
 * note, or the FD n row. Adding or removing the byte changes the span length, which the patcher refuses (rebuild path).
 */
import { describe, it, expect } from 'vitest';
import { hippelCoSoModule } from '../HippelCoSoExporter';
import { mapHippelCoSoCells } from '@lib/import/formats/HippelCoSoParser';
import { parseAs, readFixture } from './exporterHarness.shared';

const FIXTURE = 'public/data/songs/formats/prehistoric_tale.hipc';

describe('CoSo in-place patch writes the row speed', () => {
  it('prehistoric_tale: an edited FE n / FD n lands in the patched module bytes', async () => {
    const raw = readFixture(FIXTURE);
    const song = await parseAs(FIXTURE, raw);
    const spans = mapHippelCoSoCells(new Uint8Array(song.hippelFileData!), song.instruments.length);
    let hit: { p: number; ch: number; r: number; offset: number; length: number } | null = null;
    outer: for (const [p, pat] of song.patterns.entries()) for (const [ch, c] of pat.channels.entries()) for (const [r, row] of c.rows.entries()) {
      const s = spans[p]?.[ch]?.[r];
      if (s && row.effTyp === 0x0F && row.eff > 0 && row.eff < 200 && s.length >= 2) { hit = { p, ch, r, offset: s.offset, length: s.length }; break outer; }
    }
    expect(hit, 'fixture has a speed row').not.toBeNull();
    const { p, ch, r, offset, length } = hit!;
    const cell = song.patterns[p].channels[ch].rows[r];
    const wanted = cell.eff + 1;
    song.patterns[p].channels[ch].rows[r] = { ...cell, eff: wanted };

    const module = hippelCoSoModule(song)!;
    expect(module.fromGrid, 'patched in place, not rebuilt').toBe(false);
    const orig = new Uint8Array(song.hippelFileData!);
    const changed = [...module.bytes.keys()].filter((i) => module.bytes[i] !== orig[i]);
    expect(changed.length, 'exactly the speed byte changed').toBe(1);
    expect(changed[0]).toBeGreaterThanOrEqual(offset);
    expect(changed[0]).toBeLessThan(offset + length);
    expect(module.bytes[changed[0]]).toBe(wanted);
    expect(orig[changed[0]]).toBe(wanted - 1);
  });
});
