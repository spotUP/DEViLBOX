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
  it('flash on notes the level-jump rule missed', async () => {
    const { proc, send, posted } = await startWorklet('ma', 'Ma');
    await send({ type: 'loadModule', moduleData: songBuffer('public/data/songs/formats/baseheads.ma') });
    const { counted, onlyCounted, reports } = meterFlashCounts(proc, posted, 15);
    expect(reports).toBeGreaterThan(100);
    expect(counted).toBeGreaterThan(0);
    expect(onlyCounted, 'notes the level-jump rule missed').toBeGreaterThan(0);
  });

  // thanatos.ma's instruments have an attack of 255 and a peak of 255: the player writes the peak for one tick at
  // each note start (the ADSR's compare is strictly greater, as the 68k player's), a jump the level rule sees too.
  it('flash at least as often as the level-jump rule on a song whose notes all jump', async () => {
    const { proc, send, posted } = await startWorklet('ma', 'Ma');
    await send({ type: 'loadModule', moduleData: songBuffer('public/data/songs/music-assembler/thanatos.ma') });
    const { counted, byLevel, reports } = meterFlashCounts(proc, posted, 15);
    expect(reports).toBeGreaterThan(100);
    expect(counted).toBeGreaterThan(0);
    expect(counted).toBeGreaterThanOrEqual(byLevel);
  });
});
