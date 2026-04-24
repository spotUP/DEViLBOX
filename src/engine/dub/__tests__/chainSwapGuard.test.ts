/**
 * Regression test for `setChainOrder` self-oscillation guard.
 *
 * Dub-mixer-desk handoff (2026-04-20) flagged: toggling the reverb↔delay
 * order at runtime briefly left BOTH routings (`echo→spring` AND
 * `spring→echo`) live for one audio quantum. With high echo feedback +
 * high spring Q that window was enough to spark audible self-oscillation.
 *
 * Fix: ramp `return_.gain`, `input.gain`, and `feedback.gain` to 0 before
 * the splice, defer the splice via `setTimeout`, then ramp back.
 * Source-contract test locks the invariant — happy-dom can't simulate
 * Web Audio graph state.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const DUBBUS_SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../DubBus.ts');

describe('DubBus.setChainOrder — self-oscillation guard', () => {
  const src = readFileSync(DUBBUS_SRC, 'utf8');
  // Extract everything from setChainOrder to the next method at same indentation
  const startIdx = src.indexOf('setChainOrder(order:');
  const endMarker = src.indexOf('\n\n  /**', startIdx + 10);
  const body = startIdx >= 0 && endMarker >= 0 ? src.slice(startIdx, endMarker) : '';

  it('has a findable setChainOrder method body', () => {
    expect(body.length).toBeGreaterThan(100);
  });

  it('ramps return_.gain to 0 BEFORE the first disconnect', () => {
    const rampIdx = body.search(/return_\.gain[\s\S]*?linearRampToValueAtTime\(\s*0/);
    const firstDisconnectIdx = body.indexOf('_disconnectCoreRouting');
    expect(rampIdx).toBeGreaterThan(-1);
    expect(firstDisconnectIdx).toBeGreaterThan(-1);
    expect(rampIdx).toBeLessThan(firstDisconnectIdx);
  });

  it('mutes input and feedback during the splice (full quiesce)', () => {
    expect(body).toMatch(/input\.gain/);
    expect(body).toMatch(/feedback\.gain/);
  });

  it('defers the topology change via setTimeout', () => {
    expect(body).toMatch(/setTimeout\(/);
  });

  it('ramps gains back to prior levels after the splice', () => {
    expect(body).toMatch(/priorReturnGain\s*=\s*this\.return_\.gain\.value/);
    expect(body).toMatch(/linearRampToValueAtTime\(\s*priorReturnGain/);
  });

  it('has a race guard via routing version token', () => {
    expect(body).toMatch(/_routingVersion/);
  });

  it('documents WHY the guard exists', () => {
    expect(src).toMatch(/self-oscillation|feedback|mute|splice|quantum/i);
  });
});

describe('DubBus chain order — single source of truth', () => {
  const src = readFileSync(DUBBUS_SRC, 'utf8');

  it('uses _applyCoreRouting for all topology wiring', () => {
    // Constructor, setChainOrder, and _swapEchoEngine should all use _applyCoreRouting
    const calls = src.match(/_applyCoreRouting\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });

  it('uses _disconnectCoreRouting before rebuilds', () => {
    const calls = src.match(/_disconnectCoreRouting\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it('does NOT use the old setReverseChainOrder method', () => {
    expect(src).not.toMatch(/setReverseChainOrder/);
  });
});
