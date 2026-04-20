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

  it('inserts the envelope between vinylSum and the chain tail at construction', () => {
    // The envelope must be in the live audio path (vinylSum → envelope
    // → masterInsertTail). If someone re-points masterInsertTail at
    // vinylSum directly, the envelope becomes dead code.
    expect(SOURCE).toMatch(/this\.vinylSum\.connect\(\s*this\.masterInsertEnvelope\s*\)/);
    expect(SOURCE).toMatch(/this\.masterInsertTail\s*=\s*this\.masterInsertEnvelope/);
  });

  it('wireMasterInsert mutes the envelope before swapping connections', () => {
    // Ramp/setValueAtTime to 0 must happen BEFORE source.disconnect(dest).
    // Otherwise the glitch window reopens.
    const fn = SOURCE.match(/wireMasterInsert\([^)]*\)\s*:\s*void\s*\{[\s\S]*?\n  \}/);
    expect(fn, 'wireMasterInsert method not found').not.toBeNull();
    const body = fn![0];
    const muteIdx = body.search(/masterInsertEnvelope\.gain\.setValueAtTime\(\s*0/);
    const disconnectIdx = body.search(/source\.disconnect\(dest\)/);
    expect(muteIdx, 'envelope mute before source.disconnect(dest)').toBeGreaterThanOrEqual(0);
    expect(muteIdx).toBeLessThan(disconnectIdx);
  });

  it('wireMasterInsert ramps the envelope back to 1 after reconnecting', () => {
    // After the swap, a linearRampToValueAtTime to 1 must happen so the
    // insert fades in rather than jumping to full volume.
    const fn = SOURCE.match(/wireMasterInsert\([^)]*\)\s*:\s*void\s*\{[\s\S]*?\n  \}/);
    expect(fn).not.toBeNull();
    expect(fn![0]).toMatch(/masterInsertEnvelope\.gain\.linearRampToValueAtTime\(\s*1/);
  });

  it('unwireMasterInsert ramps the envelope down before disconnecting', () => {
    // The ramp-down must start BEFORE the disconnect. Otherwise the
    // insert chain audibly cuts out instead of fading out.
    const fn = SOURCE.match(/unwireMasterInsert\([^)]*\)\s*:\s*void\s*\{[\s\S]*?\n  \}/);
    expect(fn, 'unwireMasterInsert method not found').not.toBeNull();
    const body = fn![0];
    const rampIdx = body.search(/masterInsertEnvelope\.gain\.linearRampToValueAtTime\(\s*0/);
    const disconnectIdx = body.search(/\.disconnect\(/);
    expect(rampIdx).toBeGreaterThanOrEqual(0);
    expect(rampIdx).toBeLessThan(disconnectIdx);
  });

  it('unwireMasterInsert defers the disconnect via setTimeout so the ramp completes first', () => {
    // The actual disconnect of source→head / tail→dest MUST happen
    // inside a setTimeout, not inline. Inline disconnect = the ramp
    // hasn't run yet = glitch still audible.
    const fn = SOURCE.match(/unwireMasterInsert\([^)]*\)\s*:\s*void\s*\{[\s\S]*?\n  \}/);
    expect(fn).not.toBeNull();
    expect(fn![0]).toMatch(/setTimeout\(/);
    // Inside the setTimeout: disconnect + reconnect of direct path.
    const tm = fn![0].match(/setTimeout\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?\}\s*,/);
    expect(tm, 'setTimeout callback not found').not.toBeNull();
    expect(tm![0]).toMatch(/\.disconnect\(/);
    expect(tm![0]).toMatch(/source\.connect\(dest\)/);
  });

  it('unwireMasterInsert stores a pending timer that wire can cancel (race guard)', () => {
    // Rapid enable/disable/enable cycles can overlap. The pending timer
    // handle has to live on the instance so a subsequent wire can
    // clearTimeout it and prevent the old disconnect from firing
    // against the new graph.
    expect(SOURCE).toMatch(/masterInsertPending\s*:\s*ReturnType<typeof\s+setTimeout>\s*\|\s*null/);
    const wireFn = SOURCE.match(/wireMasterInsert\([^)]*\)\s*:\s*void\s*\{[\s\S]*?\n  \}/);
    expect(wireFn).not.toBeNull();
    expect(wireFn![0]).toMatch(/clearTimeout\(\s*this\.masterInsertPending\s*\)/);
  });
});
