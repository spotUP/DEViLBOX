/**
 * Regression test for the `startOscBass` headroom clamp.
 *
 * 2026-04-20 untested-FX sweep caught `oscBass` peaking at 1.001 — past
 * unity on a bus that should stay within ±1. Root cause: `level=0.9`
 * default into a Q=18 self-oscillating lowpass, which resonates 10–15 dB
 * above the raw saw's amplitude. Fix clamped the envelope peak at 0.6 so
 * there's always ~4 dB of headroom for the resonance.
 *
 * The test doesn't spin up a real AudioContext — it re-imports the clamp
 * expression by reading the source so any future change to `Math.min(0.6,
 * level)` lights this up.
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
});
