/**
 * JamCracker's channel meters flashed on a level jump and missed notes
 * retriggered at an unchanged volume. The shared Paula now counts each channel's
 * DMA starts (the chip's own note trigger) and the meters flash on each rise of
 * the count. Real worklet and WASM, real song.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer } from './workletHarness';
import { meterFlashCounts } from './meterCountHarness';

describe('JamCracker channel meters', { timeout: 60_000 }, () => {
  it('flash on notes the level-jump rule missed', async () => {
    const { proc, send, posted } = await startWorklet('jamcracker', 'JamCracker');
    await send({ type: 'loadTune', buffer: songBuffer('public/data/songs/jamcracker/freehand-spreadtro.jam') });
    await send({ type: 'play' });
    const { counted, onlyCounted, reports } = meterFlashCounts(proc, posted, 15);
    expect(reports).toBeGreaterThan(100);
    expect(counted).toBeGreaterThan(0);
    expect(onlyCounted, 'notes the level-jump rule missed').toBeGreaterThan(0);
  });
});
