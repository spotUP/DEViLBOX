/**
 * Music Assembler's channel meters never worked: the WASM exported no levels
 * getter, so the worklet posted no 'chLevels'. The player now exports the voice
 * volumes and counts every note retrigger per voice; the meters flash on each
 * rise of the count. Real worklet and WASM, real song.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer } from './workletHarness';
import { meterFlashCounts } from './meterCountHarness';

describe('Music Assembler channel meters', { timeout: 60_000 }, () => {
  it('flash on more notes than the level-jump rule saw', async () => {
    const { proc, send, posted } = await startWorklet('ma', 'Ma');
    await send({ type: 'loadModule', moduleData: songBuffer('public/data/songs/music-assembler/thanatos.ma') });
    const { counted, byLevel, reports } = meterFlashCounts(proc, posted, 15);
    expect(reports).toBeGreaterThan(100);
    expect(counted).toBeGreaterThan(0);
    expect(counted).toBeGreaterThan(byLevel);
  });
});
