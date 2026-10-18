import { describe, it, expect } from 'vitest';
import { LayoutTween, LAYOUT_TWEEN_MS, easeOutCubic, type LayoutGeometry } from '../layoutTween';

const geo = (rowHeight: number, offsets: number[], width: number): LayoutGeometry => ({
  rowHeight,
  layout: { offsets, widths: offsets.map(() => width), totalWidth: offsets.length * width },
});
const A = () => geo(24, [40, 200, 360, 520], 160);
const B = () => geo(36, [40, 280, 520, 760], 240);

describe('LayoutTween', () => {
  it('retarget with equal geometry starts nothing', () => {
    const t = new LayoutTween(A());
    t.retarget(A(), 0, false);
    expect(t.active).toBe(false);
    expect(t.sample(10)).toBe(false);
  });

  it('tweens the geometry with a cubic ease-out and lands on the target identity', () => {
    const t = new LayoutTween(A());
    const to = B();
    t.retarget(to, 1000, false);
    expect(t.active).toBe(true);
    expect(t.sample(1000 + LAYOUT_TWEEN_MS / 2)).toBe(true);
    const e = easeOutCubic(0.5);
    expect(t.current.rowHeight).toBeGreaterThan(24);
    expect(t.current.rowHeight).toBeLessThan(36);
    expect(t.current.rowHeight).toBeCloseTo(24 + 12 * e, 9);
    expect(t.current.layout.offsets[1]).toBeCloseTo(200 + 80 * e, 9);
    expect(t.sample(1000 + LAYOUT_TWEEN_MS)).toBe(true);
    expect(t.current).toBe(to);
    expect(t.active).toBe(false);
  });

  it('retargeting mid-tween starts from the interpolated picture', () => {
    const t = new LayoutTween(A());
    t.retarget(B(), 0, false);
    t.sample(75);
    const mid = t.current.rowHeight;
    t.retarget(geo(48, [40, 300, 560, 820], 260), 75, false);
    t.sample(76);
    expect(t.current.rowHeight).toBeGreaterThanOrEqual(mid);
    expect(t.current.rowHeight).toBeLessThan(mid + 1);
  });

  it('a channel-count change snaps the geometry and fades in', () => {
    const t = new LayoutTween(A());
    const to = geo(24, [40, 200], 160);
    t.retarget(to, 0, false);
    expect(t.fade).toBe(0);
    expect(t.current.layout.offsets).toEqual([40, 200]);
    t.sample(75);
    expect(t.fade).toBeGreaterThan(0);
    expect(t.fade).toBeLessThan(1);
    t.sample(LAYOUT_TWEEN_MS);
    expect(t.fade).toBe(1);
    expect(t.active).toBe(false);
  });

  it('snap applies the target at once', () => {
    const t = new LayoutTween(A());
    const to = B();
    t.retarget(to, 0, true);
    expect(t.current).toBe(to);
    expect(t.active).toBe(false);
  });

  it('duration 0 applies the target at once', () => {
    const t = new LayoutTween(A(), 0);
    const to = B();
    t.retarget(to, 0, false);
    expect(t.current).toBe(to);
    expect(t.active).toBe(false);
  });
});
