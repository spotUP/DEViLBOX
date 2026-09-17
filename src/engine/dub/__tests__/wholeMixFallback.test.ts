/**
 * Whole-mix fallback gating.
 *
 * Regression guard for the 2026-09-17 "raising channel 1 moves the master,
 * and the bus rings forever" report on amanda.ahx.
 *
 * Two independent paths sent a channel's dub audio to the whole-mix tap even
 * though the active engine had real per-channel outputs:
 *
 *   1. `DubBus.openChannelTap` tests the whole-mix branch BEFORE the
 *      cold-channel activation branch, so the per-channel path was never
 *      reached once a whole-mix tap existed. Every "throw channel N" threw
 *      the whole mix, and the release restored to max-of-sliders rather than
 *      silence — so the mix kept feeding the echo and the bus rang on.
 *   2. `useMixerStore.setChannelDubSend` calls the per-channel manager AND
 *      `setWholeMixDubSend` unconditionally. The whole-mix tap's level is
 *      `max()` across every channel slider, so raising one channel visibly
 *      moved a shared control.
 *
 * Hively/AHX triggered it because a whole-mix tap is registered for every
 * native engine by NativeEngineRouting, while Hively actually renders 37
 * stereo outputs (main mix + 4 isolation slots + 32 dub sends).
 *
 * `shouldFallBackToWholeMix` is pure so it can be tested without a live
 * AudioContext — no test in this repo constructs a real DubBus.
 */

import { describe, it, expect } from 'vitest';
import { shouldFallBackToWholeMix } from '../DubBus';
import { supportsChannelIsolation } from '@engine/tone/ChannelRoutedEffects';

describe('shouldFallBackToWholeMix', () => {
  it('uses the whole-mix tap for single-output engines', () => {
    // SID / most UADE replayers: one stereo output, nothing per-channel to tap.
    expect(shouldFallBackToWholeMix(false, 1)).toBe(true);
  });

  it('never uses it when the engine has real per-channel outputs', () => {
    // Even with a whole-mix tap registered — which NativeEngineRouting does
    // unconditionally — isolation-capable engines must reach the per-channel
    // activation path instead.
    expect(shouldFallBackToWholeMix(true, 1)).toBe(false);
    expect(shouldFallBackToWholeMix(true, 3)).toBe(false);
  });

  it('reports no fallback when no whole-mix tap is registered', () => {
    expect(shouldFallBackToWholeMix(false, 0)).toBe(false);
    expect(shouldFallBackToWholeMix(true, 0)).toBe(false);
  });
});

describe('supportsChannelIsolation', () => {
  it('reports hively as capable', () => {
    // The Hively worklet renders 37 stereo outputs and HivelyEngine implements
    // IsolationCapableEngine. A stale docstring claimed otherwise, which is
    // how the whole-mix tap came to shadow AHX's per-channel dub path.
    expect(supportsChannelIsolation('hively')).toBe(true);
  });

  it('reports the other multi-output modes as capable', () => {
    expect(supportsChannelIsolation('classic')).toBe(true);
    expect(supportsChannelIsolation('furnace')).toBe(true);
    expect(supportsChannelIsolation('tfmx')).toBe(true);
  });

  it('reports genuinely single-output modes as incapable', () => {
    expect(supportsChannelIsolation('suntronic')).toBe(false);
    expect(supportsChannelIsolation('jamcracker')).toBe(false);
    expect(supportsChannelIsolation('musicline')).toBe(false);
  });
});
