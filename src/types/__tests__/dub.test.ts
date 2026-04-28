/**
 * Pure-function coverage for the dub type module's helpers.
 * Complements src/engine/dub/__tests__/DubRouter.test.ts (runtime) and
 * src/midi/performance/__tests__/dubRouting.test.ts (MIDI CC router).
 */

import { describe, it, expect } from 'vitest';
import { snapToAltecStep, ALTEC_HPF_STEPS, DUB_CHARACTER_PRESETS, DEFAULT_DUB_BUS } from '../dub';

describe('snapToAltecStep', () => {
  it('snaps to the exact step when input matches one', () => {
    for (const step of ALTEC_HPF_STEPS) {
      expect(snapToAltecStep(step)).toBe(step);
    }
  });

  it('snaps to the nearest step in log-space', () => {
    // 180 is log-nearest to 150 (log(180)≈5.193, log(150)≈5.011, log(250)≈5.521)
    expect(snapToAltecStep(180)).toBe(150);
    // 800 is nearer to 1000 (log 800 ≈ 6.685, 1000 ≈ 6.908, 500 ≈ 6.215)
    expect(snapToAltecStep(800)).toBe(1000);
    // 120 is log-nearer to 100 than to 150
    expect(snapToAltecStep(120)).toBe(100);
    // 4500 is nearer to 5000 than to 3000
    expect(snapToAltecStep(4500)).toBe(5000);
  });

  it('clamps above/below the range to first/last step', () => {
    expect(snapToAltecStep(20)).toBe(70);       // below range
    expect(snapToAltecStep(25000)).toBe(10000); // above range
  });
});

describe('DUB_CHARACTER_PRESETS', () => {
  it('has all 5 documented engineer presets', () => {
    expect(Object.keys(DUB_CHARACTER_PRESETS).sort()).toEqual(
      ['jammy', 'madProfessor', 'perry', 'scientist', 'tubby'],
    );
  });

  it('tubby enables stepped HPF + mid-scoop off + narrow stereo', () => {
    const p = DUB_CHARACTER_PRESETS.tubby;
    expect(p.overrides.hpfStepped).toBe(true);
    expect(p.overrides.midScoopGainDb).toBe(0);
    expect(p.overrides.stereoWidth).toBeLessThan(1);
  });

  it('scientist has the signature deep mid-scoop at 700Hz', () => {
    const p = DUB_CHARACTER_PRESETS.scientist;
    expect(p.overrides.midScoopGainDb).toBe(-10);
    expect(p.overrides.midScoopFreqHz).toBe(700);
  });

  it('jammy has controlled sweep + gated-short spring', () => {
    const p = DUB_CHARACTER_PRESETS.jammy;
    // Sweep present but tamed — Jammy was less flanger-heavy than Sherwood,
    // so sweepAmount sits at ~0.30 (was 0.42 under the old "gatedFlanger" name).
    expect(p.overrides.sweepAmount).toBeGreaterThan(0.2);
    expect(p.overrides.sweepAmount).toBeLessThan(0.5);
    expect(p.overrides.sweepFeedback).toBeLessThan(0.6);
    expect(p.overrides.springWet).toBeLessThan(0.5);
    // 'tape15ips' = warmer BBD-style saturation. 'single' was too thin to
    // give the persona Perry-level depth; tape15ips adds the phat 80s
    // low-end body without breaking the gated/sweep character.
    expect(p.overrides.tapeSatMode).toBe('tape15ips');
  });

  it('perry enables tape stack + non-zero sweep amount + near-mono', () => {
    const p = DUB_CHARACTER_PRESETS.perry;
    expect(p.overrides.tapeSatMode).toBe('stack');
    expect(p.overrides.sweepAmount).toBeGreaterThan(0);
    expect(p.overrides.stereoWidth).toBeLessThan(0.5);
  });

  it('madProfessor is wide + pristine (low tapeSatDrive)', () => {
    const p = DUB_CHARACTER_PRESETS.madProfessor;
    expect(p.overrides.stereoWidth).toBeGreaterThan(1.3);
    // 0.30 → still cleaner than Perry (0.70), still well below 'gritty'
    // territory, but bumped from 0.12 to give the lush hi-fi texture some
    // body so the persona doesn't sound thinner than Perry.
    expect(p.tapeSatDrive).toBeLessThan(0.4);
    // 'tape15ips' = lush low-end body. Mad Prof's hi-fi sound benefits from
    // the slow-tape warmth without the per-path complexity of Perry's stack.
    expect(p.overrides.tapeSatMode).toBe('tape15ips');
  });
});

describe('DEFAULT_DUB_BUS', () => {
  it('starts with sweep disabled and single-path tapeSat', () => {
    expect(DEFAULT_DUB_BUS.sweepAmount).toBe(0);
    expect(DEFAULT_DUB_BUS.tapeSatMode).toBe('single');
    expect(DEFAULT_DUB_BUS.hpfStepped).toBe(false);
  });

  it('has characterPreset: custom by default (no auto-preset on fresh engine)', () => {
    expect(DEFAULT_DUB_BUS.characterPreset).toBe('custom');
  });
});
