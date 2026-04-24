/**
 * Regression test for "dub bus totally dry" bug (2026-04-24).
 *
 * Root cause was two interacting bugs introduced in Phase 3:
 *
 * 1. ConvolverNode with null buffer was connected to return_ even when
 *    club simulation was disabled (default). A convolver with null buffer
 *    in the audio graph can cause browser-specific rendering issues.
 *    Fix: only wire convolver when clubSimEnabled is true.
 *
 * 2. External feedback loop (return_ → extFeedbackEq → extFeedbackGain
 *    → input → … → return_) created a cycle without any native DelayNode.
 *    The Web Audio spec says: "Cycles that do not contain any DelayNode
 *    will be muted by outputting silence." The echo engines have delays,
 *    but inside AudioWorkletNode/Tone wrappers — not visible to the
 *    browser's topological sort.
 *    Fix: insert a tiny native DelayNode (128 samples) in the ext
 *    feedback path.
 *
 * Source-contract test — happy-dom can't simulate Web Audio graph state.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const DUBBUS_SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../DubBus.ts'),
  'utf8',
);

describe('DubBus dry-bus regression — ConvolverNode null buffer', () => {
  it('tracks whether the club convolver is wired via _clubConvolverWired', () => {
    expect(DUBBUS_SRC).toMatch(/_clubConvolverWired/);
  });

  it('does NOT unconditionally connect return_ to clubConvolver in constructor', () => {
    // The constructor should only connect the convolver when club sim is
    // enabled. Look for the conditional guard.
    const constructorStart = DUBBUS_SRC.indexOf('constructor(');
    const constructorBody = DUBBUS_SRC.slice(constructorStart, constructorStart + 8000);
    // Should NOT have a bare return_.connect(clubConvolver) — it should be
    // gated by clubSimEnabled or similar condition
    const bareConnect = /this\.return_\.connect\(this\.clubConvolver\)/.test(constructorBody);
    expect(bareConnect).toBe(false);
  });

  it('wires/unwires convolver dynamically in setSettings based on clubSimEnabled', () => {
    // setSettings should check clubSimEnabled and connect/disconnect accordingly
    // The method is very large (~20K chars) so we search the whole body
    const setSettingsStart = DUBBUS_SRC.indexOf('setSettings(settings:');
    const nextMethod = DUBBUS_SRC.indexOf('\n  /**', setSettingsStart + 100);
    const setSettingsBody = DUBBUS_SRC.slice(setSettingsStart, nextMethod > 0 ? nextMethod : undefined);
    expect(setSettingsBody).toMatch(/clubSimEnabled/);
    expect(setSettingsBody).toMatch(/_clubConvolverWired/);
  });
});

describe('DubBus dry-bus regression — feedback cycle DelayNode', () => {
  it('has an extFeedbackDelay: DelayNode field', () => {
    expect(DUBBUS_SRC).toMatch(/extFeedbackDelay/);
  });

  it('creates the delay node via createDelay in constructor', () => {
    expect(DUBBUS_SRC).toMatch(/createDelay\(/);
  });

  it('inserts extFeedbackDelay between extFeedbackGain and input', () => {
    // The ext feedback path should be:
    //   extFeedbackGain → extFeedbackDelay → input
    // NOT:
    //   extFeedbackGain → input (no DelayNode = muted cycle)
    expect(DUBBUS_SRC).toMatch(/extFeedbackGain.*connect.*extFeedbackDelay/s);
    expect(DUBBUS_SRC).toMatch(/extFeedbackDelay.*connect.*this\.input/s);
  });

  it('disconnects extFeedbackDelay in dispose', () => {
    const disposeStart = DUBBUS_SRC.indexOf('dispose(): void');
    expect(disposeStart).toBeGreaterThan(-1);
    const disposeBody = DUBBUS_SRC.slice(disposeStart, disposeStart + 3000);
    expect(disposeBody).toMatch(/extFeedbackDelay.*disconnect/s);
  });
});
