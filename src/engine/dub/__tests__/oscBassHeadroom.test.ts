/**
 * Regression test for the `startOscBass` headroom controls.
 *
 * 2026-04-20 untested-FX sweep caught `oscBass` peaking above unity
 * repeatedly. Root cause: `level=0.9` default into a Q=18 self-oscillating
 * lowpass, whose ringing doesn't scale linearly with post-filter gain
 * (tightening the clamp 0.35→0.30 only moved peak 1.003→1.002).
 *
 * Two-part fix: level clamp stays ≤ 0.6 for the initial envelope scaling,
 * AND a WaveShaper soft-clip (tanh, ceiling ~0.4) sits after env.gain so
 * the branch output can never push the bus past unity regardless of how
 * loud the filter rings.
 *
 * The test reads DubBus.ts as text (no AudioContext) so future edits that
 * drop either guard light this up.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const DUBBUS_SRC = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../DubBus.ts',
);

describe('startOscBass — headroom clamp', () => {
  const src = readFileSync(DUBBUS_SRC, 'utf8');

  // Pull the whole `startOscBass` body (from signature to the next
  // top-level method) so assertions can grep the right region.
  const bodyMatch = src.match(/startOscBass\s*\([^)]*\)[\s\S]*?^  \}/m);
  const body = bodyMatch ? bodyMatch[0] : '';

  it('has a signature default `level` strictly below 0.7 so the post-resonance peak stays under unity', () => {
    const sigMatch = body.match(/startOscBass\s*\(\s*freq\s*=\s*([0-9.]+)\s*,\s*level\s*=\s*([0-9.]+)\s*\)/);
    expect(sigMatch, 'startOscBass(freq, level) signature should be findable').not.toBeNull();
    const levelDefault = Number(sigMatch![2]);
    expect(levelDefault).toBeLessThan(0.7);
    expect(levelDefault).toBeGreaterThan(0);
  });

  it('clamps `peak` at most 0.6 before envelope scheduling', () => {
    // Match a literal that says "the envelope peak cannot exceed 0.6".
    // We deliberately write the clamp as `Math.min(0.6, level)` so this
    // test can lock it down without parsing AST.
    const clampMatch = body.match(/Math\.min\(\s*(0\.\d+)\s*,\s*level\s*\)/);
    expect(clampMatch, 'should have an upper-bound clamp on `level`').not.toBeNull();
    const clampedMax = Number(clampMatch![1]);
    expect(clampedMax).toBeLessThanOrEqual(0.6);
  });

  it('documents WHY the clamp exists so it survives the next refactor', () => {
    // The comment block directly above / inside the method should
    // mention resonance or headroom — both together would be ideal.
    expect(body.toLowerCase()).toMatch(/resonance|headroom|unity/);
  });

  it('installs a soft-clip waveshaper after env.gain so filter ringing cannot push past unity', () => {
    // env.gain clamp alone isn't sufficient — the Q=18 biquad's transient
    // ringing doesn't scale linearly with post-filter gain. A WaveShaper
    // at the branch output hard-limits individual samples regardless of
    // how loud the filter rings.
    expect(body, 'startOscBass should construct a WaveShaper').toMatch(/createWaveShaper/);
    // And it must be wired into the signal path (env → softClip → return_).
    expect(body, 'soft-clip must be wired between env and return_').toMatch(/env\.connect\(softClip\)/);
    expect(body, 'soft-clip output must feed return_').toMatch(/softClip\.connect\(this\.return_\)/);
    // Sanity — the curve must actually squash above ~0.5. Match a tanh-
    // style formula with a ceiling constant ≤ 0.5 as scalar on Math.tanh.
    const curveMatch = body.match(/=\s*(0\.\d+)\s*\*\s*Math\.tanh/);
    expect(curveMatch, 'curve should be `ceiling * Math.tanh(...)` shape').not.toBeNull();
    const ceiling = Number(curveMatch![1]);
    expect(ceiling, 'soft-clip ceiling must be ≤ 0.5 for headroom').toBeLessThanOrEqual(0.5);
  });
});
