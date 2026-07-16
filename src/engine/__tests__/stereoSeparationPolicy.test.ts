/**
 * Regression: native pre-mixed engines (SunTronic/UADE/Hively) respond to the
 * stereo-separation slider in PT2 mode.
 *
 * BUG (user-reported): "the devilbox stereo separation settings have no effect"
 * for native SunTronic. Root cause — TrackerReplayer.setStereoSeparation in PT2
 * mode only drove the post-mix StereoSeparationNode when `useLibopenmptPlayback`.
 * A direct-routed native engine's finished stereo flows through the SAME node but
 * `useLibopenmptPlayback` is false and there are no per-channel Tone panners to
 * scale, so the slider changed nothing → the node stayed at identity (100).
 *
 * These pin the routing decision. Fails on revert: drop the `nativeRoutedCount`
 * term and the native case returns identity (100) instead of the scaled value.
 */
import { describe, it, expect } from 'vitest';
import { resolvePt2NodeSeparation } from '../stereoSeparationPolicy';

describe('resolvePt2NodeSeparation (PT2 post-mix node value)', () => {
  it('drives the node for a direct-routed native engine (SunTronic) — was the bug', () => {
    // 1 native engine routed, not libopenmpt: 50% → 100 on the 0-200 node scale.
    expect(resolvePt2NodeSeparation(50, false, 1)).toBe(100);
    // The whole slider range maps through, so moving it audibly changes width.
    expect(resolvePt2NodeSeparation(0, false, 1)).toBe(0);     // mono
    expect(resolvePt2NodeSeparation(25, false, 1)).toBe(50);
    expect(resolvePt2NodeSeparation(100, false, 1)).toBe(200); // full width
    // NOT stuck at identity — that was the bug.
    expect(resolvePt2NodeSeparation(25, false, 1)).not.toBe(100);
  });

  it('drives the node for libopenmpt (pre-existing behaviour, unchanged)', () => {
    expect(resolvePt2NodeSeparation(25, true, 0)).toBe(50);
    expect(resolvePt2NodeSeparation(70, true, 0)).toBe(140);
  });

  it('keeps the node at identity for pure-Tone songs (pan scaling separates them)', () => {
    // No native engine, no libopenmpt → per-channel pan handles it; node = identity.
    expect(resolvePt2NodeSeparation(25, false, 0)).toBe(100);
    expect(resolvePt2NodeSeparation(0, false, 0)).toBe(100);
    expect(resolvePt2NodeSeparation(100, false, 0)).toBe(100);
  });
});
