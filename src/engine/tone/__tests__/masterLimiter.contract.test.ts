/**
 * Contract tests for master limiter controls.
 *
 * Verifies that ToneEngine exposes limiter control methods
 * and that the audio store has the limiter state + actions.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const toneEngineSrc = readFileSync(
  resolve(__dirname, '../../ToneEngine.ts'),
  'utf-8'
);

const djLimiterSrc = readFileSync(
  resolve(__dirname, '../../dj/djLimiter.ts'),
  'utf-8'
);

const audioStoreSrc = readFileSync(
  resolve(__dirname, '../../../stores/useAudioStore.ts'),
  'utf-8'
);

describe('Master Limiter — ToneEngine contract', () => {
  it('exposes setMasterLimiterEnabled method', () => {
    expect(toneEngineSrc).toMatch(/setMasterLimiterEnabled\s*\(\s*enabled\s*:\s*boolean\s*\)/);
  });

  it('exposes setMasterLimiterThreshold method', () => {
    expect(toneEngineSrc).toMatch(/setMasterLimiterThreshold\s*\(\s*db\s*:\s*number\s*\)/);
  });

  it('defaults safetyLimiter threshold to -1 dB', () => {
    expect(djLimiterSrc).toMatch(/DJ_LIMITER_THRESHOLD_DB = -1;/);
    expect(djLimiterSrc).toMatch(/thresholdDb: DJ_LIMITER_THRESHOLD_DB,/);
  });

  it('disables limiter by setting ratio to 1 (transparent passthrough)', () => {
    expect(toneEngineSrc).toMatch(/ratio.*=.*1/);
  });

  // The soft 4:1 it used to run let a hot master preset through above full
  // scale (Amiga Bass Cannon clipped in the tracker, held in the DJ view,
  // 2026-10-14): the tracker master runs the DJ path's limiter spec.
  it('uses the one safety limiter spec of the DJ path', () => {
    expect(toneEngineSrc).toMatch(/createToneSafetyLimiter\(\)/);
    expect(toneEngineSrc).toMatch(/enabled \? SAFETY_LIMITER\.ratio : 1/);
  });
});

describe('Master Limiter — Audio store contract', () => {
  it('has masterLimiterEnabled state (default true)', () => {
    expect(audioStoreSrc).toMatch(/masterLimiterEnabled/);
  });

  it('has masterLimiterThreshold state (default -1)', () => {
    expect(audioStoreSrc).toMatch(/masterLimiterThreshold.*-1/);
  });

  it('has setMasterLimiterEnabled action', () => {
    expect(audioStoreSrc).toMatch(/setMasterLimiterEnabled/);
  });

  it('has setMasterLimiterThreshold action', () => {
    expect(audioStoreSrc).toMatch(/setMasterLimiterThreshold/);
  });
});
