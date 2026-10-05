/**
 * UADE starts on the first audible subsong when none was asked for.
 *
 * Desire's batmanreturns.dsr opens on subsong 1, silent for its first 20 s,
 * while subsongs 2-10 sound at once; the jukebox judged it "Silent" (owner
 * decision 2026-10-05). Runs the real worklet and WASM; the probe first
 * shipped counting `_uade_wasm_render`'s return (a playing flag, 1) as the
 * frames rendered and probed 3000 s per subsong instead of 3.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer, stereoOutputs } from '@/engine/__tests__/workletHarness';

describe('UADE first audible subsong', { timeout: 120_000 }, () => {
  it('batmanreturns.dsr starts on subsong 2 and sounds within two seconds', async () => {
    const { proc, send, posted } = await startWorklet('uade', 'UADE', async (c) => (await import('@/engine/uade/UADEEngine')).uadeTransform(c));
    await send({ type: 'load', buffer: songBuffer('public/data/songs/desire/batmanreturns.dsr'), filenameHint: 'batmanreturns.dsr', skipScan: true, subsong: 0 });
    await send({ type: 'play' });
    const loaded = posted.find((m) => m.type === 'loaded') as { startSubsong?: number } | undefined;
    expect(loaded?.startSubsong).toBe(2);
    let peak = 0;
    for (let q = 0; q < (48000 * 2) / 128; q++) {
      const out = stereoOutputs(37);
      proc.process([], out);
      for (let i = 0; i < 128; i++) peak = Math.max(peak, Math.abs(out[0][0][i]));
    }
    expect(peak).toBeGreaterThan(0.05);
  });
});
