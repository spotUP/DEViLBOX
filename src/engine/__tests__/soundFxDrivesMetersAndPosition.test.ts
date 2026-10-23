/**
 * SoundFX channel meters lagged the audio and the editor did not follow the replayer: the worklet reported no
 * position and no channel levels, so the TS scheduler drove both on its own clock. The replayer now posts 'position'
 * (order, row) and 'chLevels' (peak and Paula DMA start count per channel), like JamCracker. Real worklet and WASM,
 * real song.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSharedWorkletScripts, startWorklet } from './workletHarness';
import { meterFlashCounts } from './meterCountHarness';
import { soundfxTransform } from '@/engine/soundfx/soundfxTransform';

describe('SoundFX replayer drives the channel meters and the editor position', { timeout: 120000 }, () => {
  it('posts position and chLevels that flash the meters', async () => {
    loadSharedWorkletScripts();
    const { proc, send, posted } = await startWorklet('soundfx', 'SoundFx', soundfxTransform);
    const bytes = readFileSync(join(__dirname, '../../../public/data/songs/soundfx/batdance.sfx'));
    await send({ type: 'loadModule', moduleData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    await send({ type: 'play' });

    // Position: collect while the meter helper renders (it drains `posted`, so tap it first)
    const rows = new Set<number>();
    const origShift = posted.shift.bind(posted);
    posted.shift = () => {
      const m = origShift() as { type?: string; row?: number } | undefined;
      if (m?.type === 'position' && typeof m.row === 'number') rows.add(m.row);
      return m;
    };
    const { counted, reports } = meterFlashCounts(proc, posted, 15);
    expect(reports, 'chLevels reports arrive').toBeGreaterThan(100);
    expect(counted, 'meter flashes from Paula DMA starts').toBeGreaterThan(0);
    expect(rows.size, 'the reported row advances').toBeGreaterThan(4);
  });
});
