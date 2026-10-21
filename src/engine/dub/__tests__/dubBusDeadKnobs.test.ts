/**
 * The three knobs the 2026-10-02 audit found dead inside DubBus now move
 * something: `sidechainSource`, `sidechainChannelIndex` (the sidechain
 * detector's tap) and `sirenFeedback` (the echo feedback loop's gain).
 * Real DubBus on node-web-audio-api; only the channel isolation manager is a
 * spy, because the tap's own routing is ChannelRoutedEffects' job.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { loadDubBus, makeDubBusRig, releaseDubBusRigClock } from '@/test/audio/dubBusRig';
import { realDelay } from '@/test/audio/realWebAudio';

const addSidechainTap = vi.fn(async (_ch: number, _node: AudioNode) => true);
const removeSidechainTap = vi.fn((_ch: number, _node: AudioNode) => {});
vi.mock('@/engine/tone/ChannelRoutedEffects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/engine/tone/ChannelRoutedEffects')>()),
  getChannelRoutedEffectsManager: () => ({ addSidechainTap, removeSidechainTap }),
}));

beforeAll(async () => { await loadDubBus(); }, 120_000);
afterAll(() => releaseDubBusRigClock());
beforeEach(() => { addSidechainTap.mockClear(); removeSidechainTap.mockClear(); });

describe('sidechainSource / sidechainChannelIndex key the bus detector', () => {
  it('channel mode taps the chosen channel into the sidechain compressor, bus mode takes it out', async () => {
    const rig = await makeDubBusRig(0.2);
    const detector = rig.bus.getSidechainInput();

    rig.bus.setSettings({ sidechainSource: 'channel', sidechainChannelIndex: 3 });
    await realDelay(50);
    expect(addSidechainTap).toHaveBeenCalledTimes(1);
    expect(addSidechainTap).toHaveBeenCalledWith(3, detector);

    rig.bus.setSettings({ sidechainChannelIndex: 5 });
    await realDelay(50);
    expect(removeSidechainTap).toHaveBeenCalledWith(3, detector);
    expect(addSidechainTap).toHaveBeenLastCalledWith(5, detector);

    rig.bus.setSettings({ sidechainSource: 'bus' });
    expect(removeSidechainTap).toHaveBeenLastCalledWith(5, detector);
    expect(addSidechainTap).toHaveBeenCalledTimes(2);
  });
});

describe('sirenFeedback sets the echo loop gain while the siren is held', () => {
  /** Render a siren held from 0.05 s; released at `releaseAt` (never, when omitted). */
  async function loopGainAfter(sirenFeedback: number, releaseAt?: number): Promise<{ held: number; end: number }> {
    const rig = await makeDubBusRig(1.0);
    rig.bus.setSettings({ enabled: true, sirenFeedback });
    const loop = rig.node<GainNode>('feedback').gain;
    let stop = () => {};
    let held = -1;
    const actions = [
      { at: 0.05, run: () => { stop = rig.bus.startSiren(); } },
      { at: 0.4, run: () => { held = loop.value; } },
    ];
    if (releaseAt !== undefined) actions.push({ at: releaseAt, run: () => stop() });
    await rig.render(actions);
    return { held, end: loop.value };
  }

  it('the loop opens to the setting on attack and closes on release', async () => {
    const r = await loopGainAfter(0.6, 0.5);
    expect(r.held).toBeCloseTo(0.6, 2);
    expect(r.end).toBe(0);
  });

  it('a different setting lands the loop at a different gain', async () => {
    const r = await loopGainAfter(0.9);
    expect(r.held).toBeCloseTo(0.9, 2);
  });
});
