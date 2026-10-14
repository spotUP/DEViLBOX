import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tonearmProgress, tipRadius, solveArmAngle, armAngle, LEAD_IN_RADIUS, RUN_OUT_RADIUS, CSS_ARM_GEOMETRY, CSS_ARM_RANGE, VINYL3D_ARM_GEOMETRY, VINYL3D_ARM_RANGE } from '../tonearm';

const trackerDeckB = { playbackMode: 'tracker' as const, durationMs: 0, songPos: 10, totalPositions: 40 };

describe('Deck B tonearm follows song position', () => {
  it('a tracker deck (no stored duration) shows its place in the order list, not a 180 s guess', () => {
    expect(tonearmProgress(trackerDeckB, 100)).toBeCloseTo(0.25);
    expect(tonearmProgress({ ...trackerDeckB, songPos: 20 }, 400)).toBeCloseTo(0.5);
  });
  it('an audio deck shows heard position over duration', () => {
    const audio = { playbackMode: 'audio' as const, durationMs: 200000, songPos: 0, totalPositions: 0 };
    expect(tonearmProgress(audio, 50)).toBeCloseTo(0.25);
    expect(tonearmProgress(audio, 999)).toBe(1);
  });
  it('an empty deck rests at the outer groove', () => {
    expect(tonearmProgress({ playbackMode: 'tracker', durationMs: 0, songPos: 0, totalPositions: 0 }, 30)).toBe(0);
  });
  it('the CSS turntable and the 3D view both take the arm from tonearmProgress', () => {
    const dir = resolve(__dirname, '../../../components/dj');
    for (const f of ['DeckCssTurntable.tsx', 'DeckVinyl3DView.tsx']) {
      const src = readFileSync(resolve(dir, f), 'utf8');
      expect(src).toMatch(/tonearmProgress\(/);
      expect(src).not.toMatch(/: 180;/);
    }
  });
});

describe('the needle starts on the record\'s outer groove, not outside the record', () => {
  const views = [
    ['CSS turntable', CSS_ARM_GEOMETRY, CSS_ARM_RANGE],
    ['3D turntable', VINYL3D_ARM_GEOMETRY, VINYL3D_ARM_RANGE],
  ] as const;
  for (const [name, geometry, range] of views) {
    it(`${name}: progress 0 lands on the lead-in groove, progress 1 on the run-out groove`, () => {
      expect(tipRadius(geometry, armAngle(range, 0))).toBeCloseTo(LEAD_IN_RADIUS, 3);
      expect(tipRadius(geometry, armAngle(range, 1))).toBeCloseTo(RUN_OUT_RADIUS, 3);
      expect(tipRadius(geometry, armAngle(range, 0.5))).toBeLessThan(LEAD_IN_RADIUS);
      expect(tipRadius(geometry, armAngle(range, 0.5))).toBeGreaterThan(RUN_OUT_RADIUS);
    });
  }
  it('the old hand-tuned CSS angles (5 and 25 degrees) put the needle outside the record at the start', () => {
    expect(tipRadius(CSS_ARM_GEOMETRY, (5 * Math.PI) / 180)).toBeGreaterThan(1);
  });
  it('an unreachable radius is rejected, not silently clamped', () => {
    expect(() => solveArmAngle(CSS_ARM_GEOMETRY, 50)).toThrow();
  });
});
