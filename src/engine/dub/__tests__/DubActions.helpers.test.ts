/**
 * Pure-function regression floor for DubActions helpers.
 *
 * The dub-bus audio graph requires a real AudioContext (not available in the
 * Vitest Node environment — see AllSynths.test.ts which explicitly treats
 * AudioContext construction as "expected to fail in Node"). Full runtime
 * behavior is verified by the MCP gig-sim at Task 5 Step 7 and Task 9 of the
 * Phase 0 plan.
 *
 * What IS testable cheaply: the pure math helpers exported by DubActions.
 * These regressions would silently desync BPM-synced echoes, so they're worth
 * pinning.
 */
import { describe, it, expect } from 'vitest';
import { bpmSyncedEchoRate } from '../DubActions';

describe('bpmSyncedEchoRate', () => {
  it("returns the fallback unchanged when division is 'off'", () => {
    expect(bpmSyncedEchoRate(120, 'off', 375)).toBe(375);
  });

  it('1/4 at 120 BPM = 500ms (one beat)', () => {
    expect(bpmSyncedEchoRate(120, '1/4', 0)).toBe(500);
  });

  it('1/8 at 120 BPM = 250ms (half beat)', () => {
    expect(bpmSyncedEchoRate(120, '1/8', 0)).toBe(250);
  });

  it('1/8D (dotted eighth — the King Tubby dub skank) at 120 BPM = 375ms', () => {
    expect(bpmSyncedEchoRate(120, '1/8D', 0)).toBe(375);
  });

  it('1/16 at 120 BPM = 125ms', () => {
    expect(bpmSyncedEchoRate(120, '1/16', 0)).toBe(125);
  });

  it('1/2 at 120 BPM = 1000ms (two beats)', () => {
    expect(bpmSyncedEchoRate(120, '1/2', 0)).toBe(1000);
  });

  it('scales with BPM — 1/8D at 84 BPM (reggae) ≈ 535.7ms', () => {
    const ms = bpmSyncedEchoRate(84, '1/8D', 0);
    expect(ms).toBeCloseTo((60000 / 84) * 0.75, 2);
  });

  it('clamps absurdly low BPM to 30', () => {
    // 1/4 @ 30 BPM = 2000ms; passing 0 should clamp to 30 (via the `bpm || 120` fallback skipping 0, then min(..., 30))
    // The function uses Math.max(30, Math.min(300, bpm || 120)) — so bpm=0 → 120 → clamped to 120.
    // Testing the actual clamp requires a small positive bpm.
    expect(bpmSyncedEchoRate(10, '1/4', 0)).toBe(2000); // clamped up to 30 → 60000/30 = 2000
  });

  it('clamps absurdly high BPM to 300', () => {
    expect(bpmSyncedEchoRate(500, '1/4', 0)).toBeCloseTo(200, 2); // clamped down to 300 → 60000/300 = 200
  });

  it('falls back to 120 BPM when BPM is 0 or missing', () => {
    // bpm || 120 → 120 → 1/4 → 500
    expect(bpmSyncedEchoRate(0, '1/4', 0)).toBe(500);
  });
});
