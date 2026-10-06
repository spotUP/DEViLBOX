/**
 * Two renders of the same dub bus are the same audio.
 *
 * D2, 2026-10-06: everyDubToggleChangesEngineSong failed on Starve (once on
 * Liquid) with Starve's own effect steady at -30 dBFS. What moved was the
 * test's noise floor — the difference between two identical "off" renders —
 * from -50 to -41 dBFS between runs. SpaceEchoEffect picks its wow LFO rate
 * with the main thread's Math.random, which the rig did not seed, so every
 * render ran the echo heads at a different wow rate. A toggle measured against
 * that was measured against a dice roll.
 *
 * The default bus (Space Echo) fed a steady programme, rendered twice: the
 * renders must match to the last bit.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadDubBus, makeDubBusRig, feedTone, releaseDubBusRigClock, toDb } from '@/test/audio/dubBusRig';

beforeAll(async () => { await loadDubBus(); }, 120_000);
afterAll(() => releaseDubBusRigClock());

const SECONDS = 1.5;

async function render(): Promise<AudioBuffer> {
  const rig = await makeDubBusRig(SECONDS);
  feedTone(rig, 220, 0.3);
  return rig.render([{ at: 0, run: () => rig.bus.setSettings({ enabled: true, echoEngine: 'spaceEcho' }) }]);
}

describe('the dub bus rig renders deterministically', () => {
  it('two renders of the Space Echo bus are bit-identical', async () => {
    const a = await render();
    const b = await render();
    let sum = 0;
    let n = 0;
    for (let ch = 0; ch < a.numberOfChannels; ch++) {
      const x = a.getChannelData(ch);
      const y = b.getChannelData(ch);
      for (let i = 0; i < x.length; i++) { const d = x[i] - y[i]; sum += d * d; n++; }
    }
    const diffDb = toDb(Math.sqrt(sum / n));
    expect(diffDb, `render-to-render difference ${diffDb.toFixed(1)} dBFS`).toBe(-Infinity);
  }, 120_000);
});
