/**
 * A dub send on an engine with no per-channel isolation must not spin.
 *
 * Measured 2026-09-28 with a Hippel 7V song (TFMXEngine: no isolation, and
 * the whole-mix fallback silenced): switching the AutoDub persona raised the
 * channel sends, every activation found no engine, and each failure was
 * reconciled straight back into 'activate'. One retry loop per channel, each
 * pass also scheduling a 500 ms "retry once" timer that started another loop:
 * 366 timers a second, the main thread's task queue 0.5-3 s behind, the UI at
 * 10 fps and falling until the tab halted.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as Tone from 'tone';
import { registerTrackerStore } from '@stores/storeAccess';
import { ChannelRoutedEffectsManager, registerIsolationEngineResolver } from '../ChannelRoutedEffects';
import { DubChannelLifecycle } from '@/lib/dub/dubChannelLifecycle';

function fakeGain() {
  const param = {
    value: 0,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn((v: number) => { param.value = v; }),
  };
  return { gain: param, connect: vi.fn(), disconnect: vi.fn() };
}

beforeAll(async () => {
  registerTrackerStore({ getState: () => ({ patterns: [{ channels: [{}, {}, {}, {}] }], currentPatternIndex: 0 }) });
  // Load what activation imports first, so nothing registers over the
  // resolver below mid-test.
  await import('../../dub/DubBus');
  // The playing engine offers no isolation.
  registerIsolationEngineResolver(async () => null, 'classic');
}, 30000);

describe('dub sends on an engine without channel isolation', () => {
  it('tries once, retries once, then waits instead of looping', async () => {
    const mgr = new ChannelRoutedEffectsManager({} as unknown as Tone.Gain);
    const m = mgr as unknown as { channelDubGains: unknown[]; dubBusInput: unknown };
    for (let i = 0; i < 4; i++) m.channelDubGains[i] = fakeGain();
    m.dubBusInput = { context: { currentTime: 0 } };

    const attempts = vi.spyOn(DubChannelLifecycle.prototype, 'begin');
    mgr.setChannelDubSend(0, 0.6);
    mgr.setChannelDubSend(1, 0.6);
    await new Promise((r) => setTimeout(r, 1500));

    // Two channels, each: the first attempt and its one retry.
    expect(attempts.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(attempts.mock.calls.length).toBeLessThanOrEqual(4);
    attempts.mockRestore();
    void mgr.dispose();
  });
});

describe('the lifecycle parks a channel that has no path', () => {
  it('does not answer activate for a parked channel until unparked', () => {
    const lc = new DubChannelLifecycle();
    expect(lc.setDesired(0, true)).toBe('activate');
    lc.begin(0);
    lc.park(0);
    expect(lc.setDesired(0, true)).toBe('none');   // same request again: still parked
    expect(lc.unpark(0)).toBe('activate');
  });

  it('retries a parked channel when its send is closed and reopened', () => {
    const lc = new DubChannelLifecycle();
    lc.setDesired(0, true);
    lc.begin(0);
    lc.park(0);
    expect(lc.setDesired(0, false)).toBe('none');
    expect(lc.setDesired(0, true)).toBe('activate');
  });
});
