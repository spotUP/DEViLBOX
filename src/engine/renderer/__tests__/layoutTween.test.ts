import { describe, it, expect } from 'vitest';
import { LayoutTween, LAYOUT_TWEEN_MS, LAYOUT_FADE_MS, easeOutCubic, type LayoutGeometry } from '../layoutTween';

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

  it('the channel-count fade is slow enough to see: 400 ms out, 400 ms in', () => {
    expect(LAYOUT_FADE_MS).toBe(400);
    const t = new LayoutTween(A());
    t.retarget(geo(24, [40, 200], 160), 0, false);
    t.sample(LAYOUT_TWEEN_MS); // a glide would be over; the old picture is still on screen
    expect(t.fadingOut).toBe(true);
    expect(t.fade).toBeGreaterThan(0.2);
  });

  it('a channel-count change fades the old picture out, then the new one in', () => {
    const t = new LayoutTween(A());
    const to = geo(24, [40, 200], 160);
    t.retarget(to, 0, false);
    expect(t.fadingOut).toBe(true);
    expect(t.fade).toBe(1);
    expect(t.current.layout.offsets).toEqual([40, 200, 360, 520]); // the old picture stays while it leaves
    expect(t.sample(LAYOUT_FADE_MS / 2)).toBe(true);
    expect(t.fade).toBeCloseTo(1 - easeOutCubic(0.5));
    expect(t.current.layout.offsets).toEqual([40, 200, 360, 520]);
    t.sample(LAYOUT_FADE_MS);
    expect(t.fadingOut).toBe(false);
    expect(t.fade).toBe(0);
    expect(t.current.layout.offsets).toEqual([40, 200]);
    expect(t.sample(LAYOUT_FADE_MS + 1)).toBe(true); // the fade-in anchors its clock at 0
    expect(t.fade).toBe(0);
    t.sample(LAYOUT_FADE_MS + 1 + LAYOUT_FADE_MS / 2);
    expect(t.fade).toBeCloseTo(easeOutCubic(0.5));
    t.sample(2 * LAYOUT_FADE_MS + 1);
    expect(t.fade).toBe(1);
    expect(t.current).toBe(to);
    expect(t.active).toBe(false);
  });

  it('layouts that arrive during the fade-out only move the target, so an intermediate picture is never shown', () => {
    const t = new LayoutTween(A());
    t.retarget(geo(24, [40], 160), 0, false); // the torn-down jingle song
    t.sample(50);
    const restored = geo(24, [40, 200, 360, 520, 680, 840], 160);
    t.retarget(restored, 60, false);
    expect(t.fadingOut).toBe(true);
    expect(t.current.layout.offsets).toEqual([40, 200, 360, 520]);
    t.sample(LAYOUT_FADE_MS);
    expect(t.current.layout.offsets).toEqual(restored.layout.offsets);
  });

  it('the fade-out runs under the overlay; the new picture then waits at 0 until the reveal', () => {
    const t = new LayoutTween(A());
    t.setCovered(true);
    t.retarget(geo(24, [40, 200], 160), 0, false);
    t.sample(75);
    expect(t.fade).toBeGreaterThan(0);
    expect(t.fade).toBeLessThan(1);
    t.sample(LAYOUT_FADE_MS);
    expect(t.fade).toBe(0);
    expect(t.sample(LAYOUT_FADE_MS + 250)).toBe(false);
    expect(t.fade).toBe(0);
    t.setCovered(false);
    t.sample(1000);
    expect(t.fade).toBe(0);
    t.sample(1000 + LAYOUT_FADE_MS);
    expect(t.fade).toBe(1);
  });

  it('a new channel count while the fade-in is still held at 0 skips the fade-out', () => {
    const t = new LayoutTween(A());
    t.setCovered(true);
    t.retarget(geo(24, [40, 200], 160), 0, false);
    t.sample(LAYOUT_FADE_MS);
    t.retarget(geo(24, [40, 200, 360], 160), LAYOUT_FADE_MS + 50, false);
    expect(t.fadingOut).toBe(false);
    expect(t.current.layout.offsets).toEqual([40, 200, 360]);
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

  it('a same-count retarget during a fade keeps the fade and snaps the geometry under it', () => {
    const t = new LayoutTween(A());
    const off16 = Array.from({ length: 16 }, (_, i) => 40 + i * 50);
    t.retarget(geo(24, off16, 50), 0, false);
    t.sample(LAYOUT_FADE_MS); // the old picture is out
    t.sample(LAYOUT_FADE_MS + 1);
    t.sample(LAYOUT_FADE_MS + 31);
    const mid = t.fade;
    expect(mid).toBeGreaterThan(0);
    const next = geo(24, off16, 51);
    t.retarget(next, LAYOUT_FADE_MS + 32, false);
    expect(t.active).toBe(true);
    expect(t.current.layout.widths[0]).toBe(51);
    t.sample(LAYOUT_FADE_MS + 32);
    expect(t.fade).toBeGreaterThanOrEqual(mid);
    expect(t.fade).toBeLessThan(1);
    t.sample(2 * LAYOUT_FADE_MS);
    expect(t.fade).toBeLessThan(1);
    t.sample(2 * LAYOUT_FADE_MS + 1);
    expect(t.fade).toBe(1);
    expect(t.current).toBe(next);
    expect(t.active).toBe(false);
  });

  it('a fade held under an overlay stays at 0, then runs its duration after the reveal', () => {
    const t = new LayoutTween(A());
    t.setCovered(true);
    t.retarget(geo(24, [40, 200], 160), 0, false);
    for (let now = 0; now <= 1000; now += 16) t.sample(now);
    expect(t.fade).toBe(0);
    expect(t.active).toBe(true);
    t.setCovered(false);
    t.sample(2000);
    expect(t.fade).toBe(0);
    t.sample(2000 + LAYOUT_FADE_MS / 2);
    expect(t.fade).toBeGreaterThan(0);
    expect(t.fade).toBeLessThan(1);
    t.sample(2000 + LAYOUT_FADE_MS);
    expect(t.fade).toBe(1);
  });
});
