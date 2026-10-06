/**
 * SidMon 1's channel meters flashed on a level jump and missed notes
 * retriggered at an unchanged volume. The shared Paula now counts each channel's
 * DMA starts (the chip's own note trigger) and the meters flash on each rise of
 * the count. Real worklet and WASM, real song.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer } from './workletHarness';
import { meterFlashCounts } from './meterCountHarness';

describe('SidMon 1 channel meters', { timeout: 60_000 }, () => {
  it('flash on notes the level-jump rule missed', async () => {
    const { proc, send, posted } = await startWorklet('sidmon1', 'SidMon1Replayer');
    await send({ type: 'loadModule', moduleData: songBuffer('public/data/songs/sidmon-1/myfunnymazea.sid') });
    await send({ type: 'resume' });
    const { counted, onlyCounted, reports } = meterFlashCounts(proc, posted, 15);
    expect(reports).toBeGreaterThan(100);
    expect(counted).toBeGreaterThan(0);
    expect(onlyCounted, 'notes the level-jump rule missed').toBeGreaterThan(0);
  });
});
