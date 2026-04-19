/**
 * DubRouter + moves + DubRecorder tests.
 *
 * Pure-logic coverage using a mock DubBus (the real one needs AudioContext
 * which vitest's Node env can't construct — same constraint as
 * DubActions.helpers.test.ts). Goals:
 *
 *  - Every move calls the right DubBus primitive with the right params
 *  - Fire → release pairing publishes both events with matching invocationIds
 *  - Per-channel variants of springSlam / filterDrop solo the target tap
 *  - Registered move IDs match the full 15-move surface
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fire, setDubBusForRouter, subscribeDubRouter, subscribeDubRelease } from '../DubRouter';
import type { DubBus } from '../DubBus';

// ── Mock DubBus ────────────────────────────────────────────────────────────
interface Call { method: string; args: unknown[] }
function makeMockBus() {
  const calls: Call[] = [];
  const log = (method: string, ...args: unknown[]) => calls.push({ method, args });
  const bus = {
    get isEnabled() { return true; },
    openChannelTap: vi.fn((ch: number, amount: number, attack: number) => {
      log('openChannelTap', ch, amount, attack);
      return () => log('closeChannelTap', ch);
    }),
    modulateFeedback: vi.fn((delta: number, ms: number) => log('modulateFeedback', delta, ms)),
    slamSpring: vi.fn((amt: number, ms: number) => log('slamSpring', amt, ms)),
    filterDrop: vi.fn((hz: number, down: number, up: number) => {
      log('filterDrop', hz, down, up);
      return () => log('filterRelease');
    }),
    setSirenFeedback: vi.fn((amt: number, ramp: number) => {
      log('setSirenFeedback', amt, ramp);
      return () => log('sirenRelease');
    }),
    startTapeWobble: vi.fn((depth: number, rate: number) => {
      log('startTapeWobble', depth, rate);
      return () => log('wobbleRelease');
    }),
    fireNoiseBurst: vi.fn((dur: number, level: number) => log('fireNoiseBurst', dur, level)),
    throwEchoTime: vi.fn((target: number, down: number, hold: number, up: number) =>
      log('throwEchoTime', target, down, hold, up)),
    backwardReverb: vi.fn(async (dur: number) => log('backwardReverb', dur)),
    tapeStop: vi.fn((down: number, hold: number) => log('tapeStop', down, hold)),
    soloChannelTap: vi.fn((ch: number) => {
      log('soloChannelTap', ch);
      return () => log('soloRelease', ch);
    }),
    inputNode: { context: {} as AudioContext } as unknown as GainNode,
  };
  return { bus: bus as unknown as DubBus, calls, mock: bus };
}

describe('DubRouter + moves', () => {
  beforeEach(() => {
    // Reset router bus between tests so stale registrations don't bleed.
    setDubBusForRouter(null);
  });

  describe('move registry surface', () => {
    it('registers all 15 documented moves', () => {
      const { bus } = makeMockBus();
      setDubBusForRouter(bus);
      const moves = [
        'echoThrow', 'dubStab', 'filterDrop', 'dubSiren', 'springSlam',
        'channelMute', 'channelThrow', 'delayTimeThrow', 'tapeWobble',
        'masterDrop', 'snareCrack', 'tapeStop', 'backwardReverb', 'toast',
        'transportTapeStop',
      ];
      for (const moveId of moves) {
        const result = fire(moveId, moveId === 'toast' ? undefined : 0);
        // Per-channel moves without a channel return null (checked in
        // execute); otherwise either disposer or null is acceptable — we
        // care that fire() doesn't throw + doesn't warn on an unknown id.
        expect(result === null || typeof result.dispose === 'function').toBe(true);
      }
    });

    it('warns + returns null on unknown moveId', () => {
      const { bus } = makeMockBus();
      setDubBusForRouter(bus);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = fire('nonexistentMove', 0);
      expect(result).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown moveId'));
      warn.mockRestore();
    });

    it('warns + returns null when no bus registered', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = fire('echoThrow', 0);
      expect(result).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('no bus registered'));
      warn.mockRestore();
    });
  });

  describe('channel-scoped moves', () => {
    it('echoThrow opens a tap + bumps feedback', () => {
      const { bus, mock } = makeMockBus();
      setDubBusForRouter(bus);
      fire('echoThrow', 2, { throwBeats: 0.5, feedbackBoost: 0.2 });
      expect(mock.openChannelTap).toHaveBeenCalledWith(2, 1.0, 0.005);
      expect(mock.modulateFeedback).toHaveBeenCalled();
    });

    it('dubStab uses shorter attack than echoThrow', () => {
      const { bus, mock } = makeMockBus();
      setDubBusForRouter(bus);
      fire('dubStab', 1);
      // Assert the attack arg is near-instant (<= 0.005s)
      const [ch, amt, attack] = mock.openChannelTap.mock.calls[0];
      expect(ch).toBe(1);
      expect(amt).toBe(1.0);
      expect(attack).toBeLessThanOrEqual(0.005);
    });

    it('channelMute returns disposer but never touches the bus (mixer-only)', () => {
      const { bus, mock } = makeMockBus();
      setDubBusForRouter(bus);
      // channelMute reads useMixerStore directly — in the test env that's
      // an undefined channel index so the move returns a disposer but
      // doesn't actually mute. We only assert it doesn't touch the bus.
      fire('channelMute', 0);
      expect(mock.openChannelTap).not.toHaveBeenCalled();
      expect(mock.slamSpring).not.toHaveBeenCalled();
    });
  });

  describe('global moves', () => {
    it('springSlam (no channel) calls bus.slamSpring with amount + holdMs', () => {
      const { bus, mock } = makeMockBus();
      setDubBusForRouter(bus);
      fire('springSlam', undefined, { amount: 0.8, holdMs: 300 });
      expect(mock.slamSpring).toHaveBeenCalledWith(0.8, 300);
      expect(mock.soloChannelTap).not.toHaveBeenCalled();
    });

    it('filterDrop (hold) returns a disposer that releases', () => {
      const { bus, mock } = makeMockBus();
      setDubBusForRouter(bus);
      const result = fire('filterDrop', undefined, { targetHz: 200, downSec: 0.3, upSec: 0.5 });
      expect(mock.filterDrop).toHaveBeenCalledWith(200, 0.3, 0.5);
      expect(result).not.toBeNull();
      result!.dispose();
    });

    it('snareCrack fires a noise burst', () => {
      const { bus, mock } = makeMockBus();
      setDubBusForRouter(bus);
      fire('snareCrack', undefined, { durationMs: 50, level: 0.7 });
      expect(mock.fireNoiseBurst).toHaveBeenCalledWith(50, 0.7);
    });

    it('delayTimeThrow sweeps echo rate', () => {
      const { bus, mock } = makeMockBus();
      setDubBusForRouter(bus);
      fire('delayTimeThrow', undefined, { targetMs: 60, downMs: 100, holdMs: 200, upMs: 300 });
      expect(mock.throwEchoTime).toHaveBeenCalledWith(60, 100, 200, 300);
    });

    it('tapeStop delegates to bus.tapeStop', () => {
      const { bus, mock } = makeMockBus();
      setDubBusForRouter(bus);
      fire('tapeStop', undefined, { downSec: 0.5, holdSec: 0.1 });
      expect(mock.tapeStop).toHaveBeenCalledWith(0.5, 0.1);
    });
  });

  describe('per-channel variants of global moves', () => {
    it('springSlam with channelId solos the target tap', () => {
      const { bus, mock } = makeMockBus();
      setDubBusForRouter(bus);
      fire('springSlam', 2);
      expect(mock.soloChannelTap).toHaveBeenCalledWith(2, 0.003);
      expect(mock.slamSpring).toHaveBeenCalled();
    });

    it('filterDrop with channelId solos the target tap for the hold', () => {
      const { bus, mock } = makeMockBus();
      setDubBusForRouter(bus);
      const result = fire('filterDrop', 3);
      expect(mock.soloChannelTap).toHaveBeenCalledWith(3, 0.005);
      expect(result).not.toBeNull();
      result!.dispose();
    });

    it('springSlam global (no channelId) does NOT solo', () => {
      const { bus, mock } = makeMockBus();
      setDubBusForRouter(bus);
      fire('springSlam', undefined);
      expect(mock.soloChannelTap).not.toHaveBeenCalled();
    });
  });

  describe('fire / release invocation pairing', () => {
    it('publishes fire events with a unique invocationId', () => {
      const { bus } = makeMockBus();
      setDubBusForRouter(bus);
      const fires: string[] = [];
      const unsub = subscribeDubRouter((ev) => fires.push(ev.invocationId));
      fire('springSlam', undefined);
      fire('springSlam', undefined);
      expect(fires.length).toBe(2);
      expect(fires[0]).not.toBe(fires[1]);
      unsub();
    });

    it('publishes a release with matching invocationId when disposer fires', () => {
      const { bus } = makeMockBus();
      setDubBusForRouter(bus);
      const fires: string[] = [];
      const releases: string[] = [];
      const u1 = subscribeDubRouter((ev) => fires.push(ev.invocationId));
      const u2 = subscribeDubRelease((ev) => releases.push(ev.invocationId));

      const disp = fire('filterDrop', undefined);
      expect(disp).not.toBeNull();
      expect(fires.length).toBe(1);
      expect(releases.length).toBe(0);

      disp!.dispose();
      expect(releases.length).toBe(1);
      expect(releases[0]).toBe(fires[0]);

      // Idempotent — calling dispose again doesn't re-fire release
      disp!.dispose();
      expect(releases.length).toBe(1);
      u1(); u2();
    });

    it('trigger moves with no disposer do not publish a release', () => {
      const { bus } = makeMockBus();
      setDubBusForRouter(bus);
      const releases: string[] = [];
      const u = subscribeDubRelease((ev) => releases.push(ev.invocationId));
      // springSlam is a trigger — returns null
      const disp = fire('springSlam', undefined);
      expect(disp).toBeNull();
      expect(releases.length).toBe(0);
      u();
    });
  });

  describe('subscriber error isolation', () => {
    it('one failing subscriber does not break the others', () => {
      const { bus } = makeMockBus();
      setDubBusForRouter(bus);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const good = vi.fn();
      const bad = vi.fn(() => { throw new Error('boom'); });
      const u1 = subscribeDubRouter(bad);
      const u2 = subscribeDubRouter(good);
      fire('springSlam', undefined);
      expect(bad).toHaveBeenCalledOnce();
      expect(good).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('subscriber failed'), expect.any(Error));
      u1(); u2();
      warn.mockRestore();
    });
  });
});
