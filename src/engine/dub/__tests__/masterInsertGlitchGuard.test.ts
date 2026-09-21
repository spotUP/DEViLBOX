/**
 * G15 — `wireMasterInsert` / `unwireMasterInsert` rewire-glitch guard.
 *
 * The old code swapped `source → dest` for `source → head … tail → dest`
 * by doing a hard disconnect-then-reconnect dance, which left a mid-
 * buffer silence that was audible as a click when the bus toggled live.
 *
 * Fix (C4 in the plan): mute a dedicated `masterInsertEnvelope` gain
 * before touching the audio graph, swap connections while the envelope
 * is silent, ramp the envelope back to 1. The unwire path schedules
 * the disconnect via `setTimeout` so it happens AFTER the ramp-down
 * completes (hard reconnect of the direct source→dest path now occurs
 * against a silent insert, not mid-buffer).
 *
 * This test guards the implementation-level invariants that keep that
 * behaviour from regressing. Tone.js's AudioContext can't be spun up
 * cleanly in happy-dom (AudioWorklet registry missing), so we grep the
 * source — same pattern as G6 / G12 / G13 contract tests.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(
  resolve(__dirname, '..', 'DubBus.ts'),
  'utf8',
);

describe('DubBus.wireMasterInsert — glitch guard (G15)', () => {
  it('declares a masterInsertEnvelope GainNode field', () => {
    // Private field that holds the ramp target. Without it, the wire/
    // unwire code has nothing to ramp and reverts to the old hard swap.
    expect(SOURCE).toMatch(/private\s+masterInsertEnvelope\s*!?:\s*GainNode/);
  });

  it('inserts the envelope between toneArm and the chain tail at construction', () => {
    // Vinyl moved to post-master. ToneArm now feeds masterInsertEnvelope via
    // native connect (getNativeAudioNode) to avoid Tone→native silent breakage.
    expect(SOURCE).toMatch(/getNativeAudioNode\(this\.toneArmEffect\.output\)/);
    expect(SOURCE).toMatch(/\.connect\(this\.masterInsertEnvelope\)/);
    expect(SOURCE).toMatch(/this\.masterInsertTail\s*=\s*this\.masterInsertEnvelope/);
  });

  it('wireMasterInsert fades the envelope down before swapping connections', () => {
    // The envelope must reach 0 BEFORE source.disconnect(dest), or the glitch
    // window reopens.
    //
    // This used to demand `setValueAtTime(0)` specifically, which pinned a
    // STEP to zero — and the method's own comment admitted what that cost:
    // "the caller sees a brief silence". At full gain that step is a click and
    // the gap is an audible chop every time the bus is enabled (reported
    // 2026-09-21). It now ramps and defers the rewire until the ramp lands,
    // which is what the original comment here asked for all along:
    // "Ramp/setValueAtTime to 0 must happen BEFORE source.disconnect(dest)".
    const fn = SOURCE.match(/wireMasterInsert\([^)]*\)\s*:\s*(?:void|Promise<void>)\s*\{[\s\S]*?\n  \}/);
    expect(fn, 'wireMasterInsert method not found').not.toBeNull();
    const body = fn![0];
    const fadeIdx = body.search(/masterInsertEnvelope\.gain\.linearRampToValueAtTime\(\s*0/);
    const disconnectIdx = body.search(/source\.disconnect\(dest\)/);
    expect(fadeIdx, 'envelope fade before source.disconnect(dest)').toBeGreaterThanOrEqual(0);
    expect(fadeIdx).toBeLessThan(disconnectIdx);
  });

  it('wireMasterInsert waits for that fade before rewiring', () => {
    // A ramp that is not waited on is the same as a step: the disconnect would
    // land while the envelope is still open.
    const fn = SOURCE.match(/wireMasterInsert\([^)]*\)\s*:\s*(?:void|Promise<void>)\s*\{[\s\S]*?\n  \}/);
    const body = fn![0];
    const waitIdx = body.search(/await new Promise[\s\S]{0,80}setTimeout/);
    const disconnectIdx = body.search(/source\.disconnect\(dest\)/);
    expect(waitIdx, 'no wait between the fade and the rewire').toBeGreaterThanOrEqual(0);
    expect(waitIdx).toBeLessThan(disconnectIdx);
  });

  it('wireMasterInsert ramps the envelope back to 1 after reconnecting', () => {
    // After the swap, a linearRampToValueAtTime to 1 must happen so the
    // insert fades in rather than jumping to full volume.
    const fn = SOURCE.match(/wireMasterInsert\([^)]*\)\s*:\s*(?:void|Promise<void>)\s*\{[\s\S]*?\n  \}/);
    expect(fn).not.toBeNull();
    expect(fn![0]).toMatch(/masterInsertEnvelope\.gain\.linearRampToValueAtTime\(\s*1/);
  });

  it('unwireMasterInsert ramps the envelope down before rewiring', () => {
    // The ramp-down must start BEFORE the graph is touched. Otherwise the
    // insert chain audibly cuts out instead of fading out.
    //
    // The rewire itself now lives in `_restoreMasterInsertPassthrough`, so this
    // looks for the call rather than for a bare `.disconnect(` — see
    // `masterInsertPassthrough.test.ts` for why every teardown shares one
    // restorer.
    const fn = SOURCE.match(/unwireMasterInsert\([^)]*\)\s*:\s*(?:void|Promise<void>)\s*\{[\s\S]*?\n  \}/);
    expect(fn, 'unwireMasterInsert method not found').not.toBeNull();
    const body = fn![0];
    const rampIdx = body.search(/masterInsertEnvelope\.gain\.linearRampToValueAtTime\(\s*0/);
    // The restore inside the early-return guard runs before any ramp and is not
    // the one this is about; take the one that follows the ramp.
    const rewireIdx = body.indexOf('this._restoreMasterInsertPassthrough()', rampIdx);
    expect(rampIdx).toBeGreaterThanOrEqual(0);
    expect(rewireIdx).toBeGreaterThan(rampIdx);
  });

  it('unwireMasterInsert defers the disconnect via setTimeout so the ramp completes first', () => {
    // The actual disconnect of source→head / tail→dest MUST happen
    // inside a setTimeout, not inline. Inline disconnect = the ramp
    // hasn't run yet = glitch still audible.
    const fn = SOURCE.match(/unwireMasterInsert\([^)]*\)\s*:\s*(?:void|Promise<void>)\s*\{[\s\S]*?\n  \}/);
    expect(fn).not.toBeNull();
    expect(fn![0]).toMatch(/setTimeout\(/);
    // Inside the setTimeout: disconnect + reconnect of direct path.
    const tm = fn![0].match(/setTimeout\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?\}\s*,/);
    expect(tm, 'setTimeout callback not found').not.toBeNull();
    // Inside the setTimeout: the restorer, which does the disconnect and puts
    // the direct source -> dest connection back.
    expect(tm![0]).toMatch(/_restoreMasterInsertPassthrough\(\)/);
  });

  it('unwireMasterInsert stores a pending timer that wire can cancel (race guard)', () => {
    // Rapid enable/disable/enable cycles can overlap. The pending timer
    // handle has to live on the instance so a subsequent wire can
    // clearTimeout it and prevent the old disconnect from firing
    // against the new graph.
    expect(SOURCE).toMatch(/masterInsertPending\s*:\s*ReturnType<typeof\s+setTimeout>\s*\|\s*null/);
    const wireFn = SOURCE.match(/wireMasterInsert\([^)]*\)\s*:\s*(?:void|Promise<void>)\s*\{[\s\S]*?\n  \}/);
    expect(wireFn).not.toBeNull();
    expect(wireFn![0]).toMatch(/clearTimeout\(\s*this\.masterInsertPending\s*\)/);
  });
});
