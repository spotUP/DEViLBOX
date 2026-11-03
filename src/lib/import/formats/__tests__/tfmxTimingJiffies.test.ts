/**
 * Regression: tfmxTimingTable.cumulativeJiffies must be 50 Hz vertical-blank jiffies.
 *
 * The consumers (usePatternPlayback, uadeLoadArgs, UADEEngine) read the value as jiffies, but the
 * parser stored pattern ticks. The decoder advances a pattern tick once every (speed + 1) player
 * calls (TFMXDecoder.cpp), so a tick lasts (speed + 1) * 50 / rateHz jiffies; the cursor drifted
 * by that factor (turrican_bonus: speed 4, five times too fast).
 *
 * Fixture: public/data/songs/formats/mdat.turrican_bonus (tempo word 4, no CIA, no EFFE0002).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseTFMXFile } from '../TFMXParser';

describe('TFMX timing table units', () => {
  it('totals the decoder song length in 50 Hz jiffies', () => {
    const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats/mdat.turrican_bonus')));
    const song = parseTFMXFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, 'mdat.turrican_bonus');
    const native = song.tfmxNative!;
    const table = song.tfmxTimingTable!;

    // Independent expectation from the module header, per the decoder rules.
    const tempo = native.songTempos[native.activeSubsong];
    expect(tempo).toBeGreaterThan(0);
    expect(tempo).toBeLessThan(0x10); // vblank mode: speed = tempo word, rate 50 Hz
    expect(native.tracksteps.some((s) => s.isEFFE && s.effeCommand === 0x0002)).toBe(false);

    const grid = native.gridRowTicks!;
    const ticks = grid.reduce((n, rows) => n + (rows[rows.length - 1] ?? 0) + 1, 0);
    const expectedJiffies = ticks * (tempo + 1);

    // The last row sits on the last tick of the last step; that tick lasts (speed + 1) jiffies.
    const last = table[table.length - 1];
    expect(last.cumulativeJiffies + (tempo + 1)).toBe(expectedJiffies);
  });
});
