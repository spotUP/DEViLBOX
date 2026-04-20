/**
 * FLAT-move diagnostic contract (PR #74 follow-up).
 *
 * The 2026-04-20 dub-untested-sweep flagged `backwardReverb` and
 * `reverseEcho` as FLAT — audible through the move path fired but the
 * probe saw no Δpeak / Δrms. PR #74 added symmetric diagnostic logs to
 * both bus methods so the next live sweep can triage which failure
 * branch the no-audio outcome came from (bus disabled vs. capture node
 * missing vs. worklet timeout vs. empty ring vs. DSP-actually-silent).
 *
 * This test locks the diagnostics in place as a static source contract —
 * a future refactor of DubBus.ts that silently drops the logs loses the
 * triage signal and reopens the investigation. Can't integration-test the
 * live audio path from happy-dom (AudioWorklet registry is missing), so
 * grep the source — same pattern as `masterInsertGlitchGuard.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(
  resolve(__dirname, '..', 'DubBus.ts'),
  'utf8',
);

// Extract the body of a specific async method so assertions don't leak
// across methods (e.g. reverseEcho's logs shouldn't satisfy backwardReverb
// expectations just because they live in the same file).
function extractAsyncMethod(name: string): string {
  const pattern = new RegExp(`async\\s+${name}\\s*\\([^)]*\\)\\s*:\\s*Promise<void>\\s*\\{[\\s\\S]*?\\n  \\}`);
  const m = SOURCE.match(pattern);
  if (!m) throw new Error(`method ${name} not found in DubBus.ts`);
  return m[0];
}

describe('DubBus.backwardReverb — FLAT-move diagnostic contract', () => {
  const body = extractAsyncMethod('backwardReverb');

  it('logs the bus-disabled early-return', () => {
    // Without this, a disabled-bus run looks identical to a successful
    // fire — the sweep can't tell the move was ignored.
    expect(body).toMatch(/backwardReverb ignored — bus disabled/);
  });

  it('logs the capture-node-missing early-return', () => {
    // _ensureReverseCapture can fail (worklet module 404 / addModule throws).
    // Previously this returned silently; now it warns.
    expect(body).toMatch(/backwardReverb ignored — capture node missing/);
  });

  it('logs entry with the requested duration', () => {
    // Start log so the sweep can correlate the move fire with the bus
    // method actually being invoked (previously the reverseEcho side had
    // this, backwardReverb didn't).
    expect(body).toMatch(/backwardReverb ▶ captureDur=/);
  });

  it('logs the worklet-reply timeout', () => {
    // The 1s setTimeout previously resolved silently — a stuck worklet
    // was indistinguishable from a successful fire-and-forget. Must warn.
    expect(body).toMatch(/backwardReverb timeout — worklet did not reply/);
  });

  it('logs the snapshot frame count on receipt', () => {
    // Tells the sweep: "worklet replied with N frames". N=0 means the
    // ring never saw audio; N>0 with no audible output points at the
    // DSP path / envelope as the bug.
    expect(body).toMatch(/backwardReverb snapshot received — frames=\$\{frames\}/);
  });

  it('warns on empty-ring-buffer (frames=0) path', () => {
    // Distinguishes "no audio reached bus.input yet" (infrastructure)
    // from "reverse played but the probe missed it" (measurement).
    expect(body).toMatch(/backwardReverb abort — empty ring buffer/);
  });
});

describe('DubBus.reverseEcho — FLAT-move diagnostic contract', () => {
  // The `reverseEcho` wrapper delegates to the private
  // `_snapshotReverseRing` helper (added 2026-04-20 for the first-fire
  // retry). Timeout / snapshot-received / empty-ring logs live in the
  // helper's `_snapshotReverseRingOnce` method — the diag test covers
  // BOTH so either method being edited in isolation still catches a
  // dropped log.
  const wrapperBody = extractAsyncMethod('reverseEcho');
  // Match the DECLARATIONS (not call sites — `_snapshotReverseRing` and
  // `_snapshotReverseRingOnce` both appear as call sites too).
  const helperIdx = SOURCE.indexOf('private async _snapshotReverseRingOnce');
  const helperBody = helperIdx >= 0 ? SOURCE.slice(helperIdx, helperIdx + 3000) : '';
  const retryIdx = SOURCE.indexOf('private async _snapshotReverseRing(');
  const retryBody = retryIdx >= 0 ? SOURCE.slice(retryIdx, retryIdx + 1500) : '';

  it('logs the bus-disabled early-return', () => {
    expect(wrapperBody).toMatch(/reverseEcho ignored — bus disabled/);
  });

  it('logs the capture-node-missing early-return', () => {
    expect(wrapperBody).toMatch(/reverseEcho ignored — capture node missing/);
  });

  it('logs entry with the requested duration + amount', () => {
    expect(wrapperBody).toMatch(/reverseEcho ▶ captureDur=/);
  });

  it('logs the worklet-reply timeout', () => {
    expect(helperBody, 'timeout log moved into _snapshotReverseRingOnce').toMatch(/reverseEcho timeout — worklet did not reply/);
  });

  it('logs the snapshot frame count on receipt', () => {
    expect(helperBody, '"snapshot received" log moved into _snapshotReverseRingOnce').toMatch(/reverseEcho snapshot received — frames=\$\{frames\}/);
  });

  it('warns on empty-ring-buffer path — after retries are exhausted', () => {
    // Empty-ring now returns false and `_snapshotReverseRing` retries up to
    // N attempts. After the budget is spent, a single summary warn fires.
    expect(retryBody, 'expected ring-empty-after-retries warn in helper').toMatch(/reverseEcho abort — ring still empty/);
  });
});
