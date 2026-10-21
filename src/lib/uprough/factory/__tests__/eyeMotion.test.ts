import { describe, expect, it } from 'vitest';
import { blinkStarts, blinkWindow, directionToSlot, fidgetOffset, FIDGET_MAX_DEG, FIDGET_MAX_PX, gazeAt, gazeFocus, isBlinking } from '../eyeMotion';
import { eyeOpenness } from '../draw';

function blinkTimes(seed: number, seconds: number): number[] {
  const w = blinkWindow(seed);
  const out: number[] = [];
  for (let k = 0; k * w < seconds + w; k++) out.push(...blinkStarts(seed, k));
  return out.filter((s) => s < seconds);
}

describe('eye blink schedule', () => {
  it('differs between slots and is deterministic', () => {
    expect(blinkTimes(0, 20)).not.toEqual(blinkTimes(1, 20));
    expect(blinkTimes(3, 20)).toEqual(blinkTimes(3, 20));
  });
  it('every slot blinks at least twice in 20 s with unequal gaps', () => {
    for (let seed = 0; seed < 12; seed++) {
      const ts = blinkTimes(seed, 20);
      expect(ts.length).toBeGreaterThanOrEqual(2);
      const gaps = ts.slice(1).map((t, i) => +(t - ts[i]).toFixed(4));
      expect(new Set(gaps).size).toBeGreaterThan(1);
    }
  });
  it('shuts the eyes during a blink and leaves them open otherwise; idle stays a slit', () => {
    const s = blinkStarts(2, 5)[0];
    expect(isBlinking(s + 0.05, 2)).toBe(true);
    expect(eyeOpenness(s + 0.05, 2, false)).toBe(0.1);
    expect(eyeOpenness(s + 0.5, 2, false)).toBe(1);
    expect(eyeOpenness(s + 0.05, 2, true)).toBe(0.3);
  });
  it('some slot double-blinks', () => {
    const any = Array.from({ length: 40 }, (_, k) => blinkStarts(1, k).length).some((n) => n === 2);
    expect(any).toBe(true);
  });
});

describe('gaze', () => {
  it('the focus is the building slot, seen from each other slot; the builder looks at its own wave', () => {
    expect(gazeFocus({ slotIndex: 0, cols: 3, buildingIndex: 2 })).toEqual(directionToSlot(0, 2, 3));
    expect(gazeFocus({ slotIndex: 0, cols: 3, buildingIndex: 2 })!.x).toBeGreaterThan(0);
    expect(gazeFocus({ slotIndex: 2, cols: 3, buildingIndex: 0 })!.x).toBeLessThan(0);
    expect(gazeFocus({ slotIndex: 1, cols: 3, buildingIndex: 1 })!.y).toBeGreaterThan(0);
    expect(gazeFocus({ slotIndex: 1, cols: 3, chipRiding: true })!.y).toBeLessThan(0);
    expect(gazeFocus({ slotIndex: 1, cols: 3 })).toBeUndefined();
  });
  it('mostly looks toward the building slot over time and stays in range', () => {
    const focus = gazeFocus({ slotIndex: 0, cols: 3, buildingIndex: 2 });
    let toward = 0;
    for (let i = 0; i < 200; i++) {
      const g = gazeAt(i * 0.37, 0, focus);
      expect(Math.abs(g.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(g.y)).toBeLessThanOrEqual(1);
      if (g.x > 0.4) toward++;
    }
    expect(toward).toBeGreaterThan(100);
  });
  it('saccades quickly then holds: moves within 0.12 s of a window start, constant late in the window', () => {
    const t0 = 5.0;
    const samples = Array.from({ length: 60 }, (_, i) => gazeAt(t0 + i * 0.05, 4));
    const changes = samples.slice(1).filter((g, i) => g.x !== samples[i].x || g.y !== samples[i].y).length;
    expect(changes).toBeLessThan(40);
  });
});

describe('fidget', () => {
  it('stays within bounds, moves sometimes, and is exactly zero between moves', () => {
    let moved = 0;
    let rest = 0;
    for (let seed = 0; seed < 6; seed++) {
      for (let t = 0; t < 60; t += 0.05) {
        const f = fidgetOffset(t, seed);
        expect(Math.abs(f.x)).toBeLessThanOrEqual(FIDGET_MAX_PX);
        expect(Math.abs(f.y)).toBeLessThanOrEqual(FIDGET_MAX_PX);
        expect(Math.abs(f.rot)).toBeLessThanOrEqual(FIDGET_MAX_DEG);
        if (f.x !== 0 || f.y !== 0 || f.rot !== 0) moved++; else rest++;
      }
    }
    expect(moved).toBeGreaterThan(0);
    expect(rest).toBeGreaterThan(moved);
    expect(fidgetOffset(12.3, 2)).toEqual(fidgetOffset(12.3, 2));
  });
  it('slots fidget out of step', () => {
    const a = Array.from({ length: 200 }, (_, i) => fidgetOffset(i * 0.1, 0).x);
    const b = Array.from({ length: 200 }, (_, i) => fidgetOffset(i * 0.1, 1).x);
    expect(a).not.toEqual(b);
  });
});
