/**
 * parameterRouter dub.* routing tests.
 *
 * Verifies the edge-detection semantics for dub move CC routing:
 *   - Triggers fire once on value crossing 0.5 upward
 *   - Holds press on upward cross, dispose on downward cross
 *   - Per-channel variants via `.chN` suffix
 *
 * Uses a mock DubBus under the DubRouter to capture which move ID / channel
 * the CC route actually dispatched.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { routeParameterToEngine } from '../parameterRouter';
import { setDubBusForRouter, subscribeDubRouter } from '../../../engine/dub/DubRouter';
import type { DubBus } from '../../../engine/dub/DubBus';

function makeMockBus() {
  const bus = {
    get isEnabled() { return true; },
    openChannelTap: vi.fn(() => () => {}),
    modulateFeedback: vi.fn(),
    slamSpring: vi.fn(),
    filterDrop: vi.fn(() => () => {}),
    setSirenFeedback: vi.fn(() => () => {}),
    startTapeWobble: vi.fn(() => () => {}),
    fireNoiseBurst: vi.fn(),
    throwEchoTime: vi.fn(),
    backwardReverb: vi.fn(async () => {}),
    tapeStop: vi.fn(),
    soloChannelTap: vi.fn(() => () => {}),
    inputNode: { context: {} as AudioContext } as unknown as GainNode,
  };
  return bus as unknown as DubBus;
}

// Helper: capture fires through the router subscriber so we can assert
// moveId/channelId without reaching into the mock's individual calls.
interface Capture { moveId: string; channelId: number | undefined }
function captureFires(): { captures: Capture[]; unsub: () => void } {
  const captures: Capture[] = [];
  const unsub = subscribeDubRouter((ev) => {
    captures.push({ moveId: ev.moveId, channelId: ev.channelId });
  });
  return { captures, unsub };
}

describe('parameterRouter dub.* routing', () => {
  beforeEach(() => {
    setDubBusForRouter(makeMockBus());
  });

  describe('trigger edge semantics', () => {
    it('fires on upward crossing of 0.5', async () => {
      const { captures, unsub } = captureFires();
      routeParameterToEngine('dub.springSlam', 0.0);
      await new Promise(r => setTimeout(r, 20));
      expect(captures.length).toBe(0);
      routeParameterToEngine('dub.springSlam', 1.0);
      await new Promise(r => setTimeout(r, 20));
      expect(captures.length).toBe(1);
      expect(captures[0].moveId).toBe('springSlam');
      unsub();
    });

    it('does NOT re-fire on repeated 1.0 values', async () => {
      const { captures, unsub } = captureFires();
      routeParameterToEngine('dub.snareCrack', 1.0);  // initial state unknown
      await new Promise(r => setTimeout(r, 20));
      routeParameterToEngine('dub.snareCrack', 1.0);  // held high — no edge
      await new Promise(r => setTimeout(r, 20));
      routeParameterToEngine('dub.snareCrack', 1.0);  // still held
      await new Promise(r => setTimeout(r, 20));
      // Only the first call crossed the 0.5 boundary from 0 → 1.
      expect(captures.filter(c => c.moveId === 'snareCrack').length).toBe(1);
      unsub();
    });

    it('re-fires after a downward reset', async () => {
      // Ensure known-low starting state regardless of module-scoped state
      // bleed from prior tests.
      routeParameterToEngine('dub.tapeStop', 0.0);
      await new Promise(r => setTimeout(r, 20));

      const { captures, unsub } = captureFires();
      routeParameterToEngine('dub.tapeStop', 1.0);    // cross 1
      await new Promise(r => setTimeout(r, 20));
      routeParameterToEngine('dub.tapeStop', 0.0);    // reset
      await new Promise(r => setTimeout(r, 20));
      routeParameterToEngine('dub.tapeStop', 1.0);    // cross 2
      await new Promise(r => setTimeout(r, 20));
      expect(captures.filter(c => c.moveId === 'tapeStop').length).toBe(2);
      unsub();
    });
  });

  describe('per-channel variants via .chN suffix', () => {
    it('routes dub.echoThrow.ch3 → echoThrow with channelId 3', async () => {
      const { captures, unsub } = captureFires();
      routeParameterToEngine('dub.echoThrow.ch3', 0.0);
      await new Promise(r => setTimeout(r, 20));
      routeParameterToEngine('dub.echoThrow.ch3', 1.0);
      await new Promise(r => setTimeout(r, 20));
      expect(captures.find(c => c.moveId === 'echoThrow' && c.channelId === 3)).toBeDefined();
      unsub();
    });

    it('routes dub.springSlam.ch0 → springSlam with channelId 0', async () => {
      const { captures, unsub } = captureFires();
      routeParameterToEngine('dub.springSlam.ch0', 0.0);
      await new Promise(r => setTimeout(r, 20));
      routeParameterToEngine('dub.springSlam.ch0', 1.0);
      await new Promise(r => setTimeout(r, 20));
      expect(captures.find(c => c.moveId === 'springSlam' && c.channelId === 0)).toBeDefined();
      unsub();
    });

    it('ignores unknown moveId in dub.* namespace', async () => {
      const { captures, unsub } = captureFires();
      routeParameterToEngine('dub.nonexistent', 0.0);
      await new Promise(r => setTimeout(r, 20));
      routeParameterToEngine('dub.nonexistent', 1.0);
      await new Promise(r => setTimeout(r, 20));
      expect(captures.length).toBe(0);
      unsub();
    });
  });
});
