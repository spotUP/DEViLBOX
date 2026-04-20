/**
 * Regression test for `setReverseChainOrder` self-oscillation guard.
 *
 * Dub-mixer-desk handoff (2026-04-20) flagged: toggling the reverb↔delay
 * order at runtime briefly left BOTH routings (`echo→spring` AND
 * `spring→echo`) live for one audio quantum while the graph topology
 * settled. With high echo feedback + high spring Q that window was
 * enough to spark audible self-oscillation that leaked into master.
 *
 * Fix: ramp `return_.gain` to 0 before the splice, defer the splice
 * via `setTimeout` until the mute has landed, then ramp back. This
 * source-contract test locks the invariant — happy-dom can't simulate
 * Web Audio graph state, so we grep the source instead.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const DUBBUS_SRC = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../DubBus.ts',
);

describe('DubBus.setReverseChainOrder — self-oscillation guard', () => {
  const src = readFileSync(DUBBUS_SRC, 'utf8');
  const bodyMatch = src.match(/setReverseChainOrder\s*\([^)]*\)[\s\S]*?^  \}/m);
  const body = bodyMatch ? bodyMatch[0] : '';

  it('has a findable setReverseChainOrder method body', () => {
    expect(body.length).toBeGreaterThan(100);
  });

  it('ramps return_.gain to 0 BEFORE the first Tone.disconnect', () => {
    const rampIdx = body.search(/return_\.gain[\s\S]*?linearRampToValueAtTime\(\s*0/);
    const firstDisconnectIdx = body.indexOf('Tone.disconnect');
    expect(rampIdx).toBeGreaterThan(-1);
    expect(firstDisconnectIdx).toBeGreaterThan(-1);
    expect(rampIdx).toBeLessThan(firstDisconnectIdx);
  });

  it('defers the topology change via setTimeout so the mute can settle', () => {
    expect(body).toMatch(/setTimeout\(/);
  });

  it('ramps return_.gain back to the prior level after the splice', () => {
    expect(body).toMatch(/priorGain\s*=\s*this\.return_\.gain\.value/);
    expect(body).toMatch(/linearRampToValueAtTime\(\s*priorGain/);
  });

  it('documents WHY the guard exists', () => {
    expect(body.toLowerCase()).toMatch(/self-oscillation|feedback|mute|splice|quantum/);
  });
});
