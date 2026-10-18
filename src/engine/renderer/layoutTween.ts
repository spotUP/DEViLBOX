/**
 * Interpolates the grid geometry (row height and channel offsets/widths, all in
 * canvas px) from the picture on screen to the target of the latest `layout`
 * message over LAYOUT_TWEEN_MS with a cubic ease-out, so that zoom, fit, column
 * visibility and resize glide instead of jumping. A target with a different
 * channel count cannot be tweened column by column: the geometry snaps and the
 * new picture fades in instead (`fade` goes 0 -> 1 on the same curve).
 *
 * Owned by tracker-render.worker.ts; no DOM, no GL, so it is unit-testable.
 */
import type { ChannelLayoutSnapshot } from './worker-types';

export const LAYOUT_TWEEN_MS = 150;

export interface LayoutGeometry {
  rowHeight: number;
  layout: ChannelLayoutSnapshot;
}

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

export function geometryEquals(a: LayoutGeometry, b: LayoutGeometry): boolean {
  if (a.rowHeight !== b.rowHeight || a.layout.totalWidth !== b.layout.totalWidth) return false;
  const ao = a.layout.offsets, bo = b.layout.offsets, aw = a.layout.widths, bw = b.layout.widths;
  if (ao.length !== bo.length || aw.length !== bw.length) return false;
  for (let i = 0; i < ao.length; i++) if (ao[i] !== bo[i] || aw[i] !== bw[i]) return false;
  return true;
}

export class LayoutTween {
  /** What the renderer draws this frame (canvas px). Identity stable while a tween runs; the arrays are rewritten in place. */
  current: LayoutGeometry;
  /** 1 = fully visible; < 1 while a channel-count change fades in. */
  fade = 1;
  private from: LayoutGeometry | null = null;
  private to: LayoutGeometry;
  private start = 0;
  private mode: 'geometry' | 'fade' | null = null;
  private readonly duration: number;

  constructor(initial: LayoutGeometry, duration = LAYOUT_TWEEN_MS) {
    this.current = initial;
    this.to = initial;
    this.duration = duration;
  }

  get active(): boolean { return this.mode !== null; }
  get target(): LayoutGeometry { return this.to; }

  /** New target from a `layout` message. `snap` (reduced motion, no renderer yet) applies it at once. */
  retarget(to: LayoutGeometry, now: number, snap: boolean): void {
    if (geometryEquals(this.to, to) && (this.mode !== null || geometryEquals(this.current, to))) {
      this.to = to; // same picture (cell edit re-post): keep whatever motion is running
      return;
    }
    this.to = to;
    if (snap || this.duration <= 0) { this.finish(); return; }
    if (to.layout.offsets.length !== this.current.layout.offsets.length) {
      this.mode = 'fade';
      this.from = null;
      this.current = { rowHeight: to.rowHeight, layout: to.layout };
      this.fade = 0;
    } else {
      this.mode = 'geometry';
      this.from = cloneGeometry(this.current); // the picture on screen now, mid-tween included
      this.current = cloneGeometry(this.current); // own arrays to rewrite per frame
      this.fade = 1;
    }
    this.start = now;
  }

  /** Advance to `now`. Returns true when the picture changed and must be drawn. */
  sample(now: number): boolean {
    if (this.mode === null) return false;
    const t = Math.min(1, (now - this.start) / this.duration);
    const e = easeOutCubic(t);
    if (this.mode === 'fade') {
      this.fade = e;
    } else {
      const f = this.from!, c = this.current, to = this.to;
      c.rowHeight = f.rowHeight + (to.rowHeight - f.rowHeight) * e;
      c.layout.totalWidth = f.layout.totalWidth + (to.layout.totalWidth - f.layout.totalWidth) * e;
      for (let i = 0; i < c.layout.offsets.length; i++) {
        c.layout.offsets[i] = f.layout.offsets[i] + (to.layout.offsets[i] - f.layout.offsets[i]) * e;
        c.layout.widths[i]  = f.layout.widths[i]  + (to.layout.widths[i]  - f.layout.widths[i])  * e;
      }
    }
    if (t >= 1) this.finish();
    return true;
  }

  private finish(): void {
    this.mode = null;
    this.from = null;
    this.current = this.to;
    this.fade = 1;
  }
}

function cloneGeometry(g: LayoutGeometry): LayoutGeometry {
  return { rowHeight: g.rowHeight, layout: { ...g.layout, offsets: g.layout.offsets.slice(), widths: g.layout.widths.slice() } };
}
