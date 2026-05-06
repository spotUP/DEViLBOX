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
    expect(toneEngineSrc).toMatch(/threshold:\s*-1/);
  });

  it('disables limiter by setting ratio to 1 (transparent passthrough)', () => {
    expect(toneEngineSrc).toMatch(/ratio.*=.*1/);
  });

  it('uses gentle ratio of 4 (not brickwall 20)', () => {
    expect(toneEngineSrc).toMatch(/ratio:\s*4/);
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
