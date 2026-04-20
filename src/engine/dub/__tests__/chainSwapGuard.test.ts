/**
 * Regression test for the reverse chain-swap self-oscillation guard.
 *
 * Dub-mixer-desk handoff (2026-04-20) flagged: toggling
 * `setReverseChainOrder` at runtime could briefly leave BOTH routings
 * (`echo→spring` AND `spring→echo`) live for one audio quantum while
 * the graph topology settled. With high echo feedback + high spring Q
 * that window was enough to spark audible self-oscillation that leaked
 * into the master output.
 *
 * Fix: mute `return_.gain` to 0 before the `Tone.disconnect/connect`
 * splice, defer the splice with `setTimeout` until the mute has
 * landed, then ramp back. Any feedback transient now dies into a
 * zero-gain return.
 *
 * This is a static source-contract test — the real fix runs entirely
 * against Web Audio graph state which happy-dom can't simulate. Grep
 * the source to lock the invariant so the next refactor can't silently
 * reintroduce the gap.
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

  // Extract the whole `setReverseChainOrder` method body (signature
  // through matching close-brace).
  const bodyMatch = src.match(/setReverseChainOrder\s*\([^)]*\)[\s\S]*?^  \}/m);
  const body = bodyMatch ? bodyMatch[0] : '';

  it('has a findable setReverseChainOrder method body', () => {
    expect(body.length, 'should find method block').toBeGreaterThan(100);
  });

  it('ramps return_.gain to 0 BEFORE touching the echo/spring graph', () => {
    // The mute ramp should appear before the first Tone.disconnect.
    const rampIdx = body.search(/return_\.gain[\s\S]*?linearRampToValueAtTime\(\s*0/);
    const firstDisconnectIdx = body.indexOf('Tone.disconnect');
    expect(rampIdx).toBeGreaterThan(-1);
    expect(firstDisconnectIdx).toBeGreaterThan(-1);
    expect(rampIdx).toBeLessThan(firstDisconnectIdx);
  });

  it('defers the topology change via setTimeout so the mute can settle', () => {
    // Without the setTimeout the ramp fires on the Web Audio clock but
    // the disconnect fires synchronously — the splice still races the
    // mute. Defer MUST be present.
    expect(body).toMatch(/setTimeout\(/);
  });

  it('ramps return_.gain back to the prior level after the splice', () => {
    // Capture `priorGain` pre-mute, ramp back up after — so the move
    // doesn't leave the bus silent. Both pieces must be present.
    expect(body).toMatch(/priorGain\s*=\s*this\.return_\.gain\.value/);
    expect(body).toMatch(/linearRampToValueAtTime\(\s*priorGain/);
  });

  it('documents WHY the guard exists so it survives refactors', () => {
    expect(body.toLowerCase()).toMatch(/self-oscillation|feedback|mute|splice|quantum/);
  });
});
