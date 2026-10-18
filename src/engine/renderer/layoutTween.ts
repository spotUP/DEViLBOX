/**
 * Interpolates the grid geometry (row height and channel offsets/widths, all in
 * canvas px) from the picture on screen to the target of the latest `layout`
 * message over LAYOUT_TWEEN_MS with a cubic ease-out, so that zoom, fit, column
 * visibility and resize glide instead of jumping. A target with a different
 * channel count cannot be tweened column by column: the picture on screen fades
 * out (`fade` 1 -> 0, the 'out' phase; the worker keeps drawing the last frame),
 * then the geometry snaps and the new picture fades in (0 -> 1, the 'in'
 * phase), each over LAYOUT_TWEEN_MS on the same curve. Layouts that arrive
 * during the 'out' phase only move the target, so a song that passes through an
 * intermediate picture (the jingle's teardown before the restored song) is
 * never shown.
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
  /** 1 = fully visible; < 1 while a channel-count change fades out or in. */
  fade = 1;
  private from: LayoutGeometry | null = null;
  private to: LayoutGeometry;
  /** Fade clock origin; null until the first sampled frame, so the first drawn frame of a fade is fade 0. */
  private start: number | null = 0;
  /** The editor sits under an overlay: a fade stays at 0 until it is uncovered. */
  private covered = false;
  private mode: 'geometry' | 'fade' | null = null;
  /** Which half of a fade runs: the old picture going out, or the new one coming in. */
  private phase: 'out' | 'in' = 'in';
  /** Where the 'out' phase starts (1, or less when a fade-in is cut short). */
  private outFrom = 1;
  private readonly duration: number;

  constructor(initial: LayoutGeometry, duration = LAYOUT_TWEEN_MS) {
    this.current = initial;
    this.to = initial;
    this.duration = duration;
  }

  get active(): boolean { return this.mode !== null; }
  get target(): LayoutGeometry { return this.to; }
  /** The old picture is fading out: the worker draws its last frame, not the current state. */
  get fadingOut(): boolean { return this.mode === 'fade' && this.phase === 'out'; }

  /**
   * Overlay up (song load) or lifted. A pending fade-in holds at 0 while covered
   * and runs its duration from the first frame after. A fade-out keeps running:
   * the old picture leaves while the next song loads.
   */
  setCovered(covered: boolean): void {
    this.covered = covered;
    if (this.mode === 'fade' && this.phase === 'in' && covered) { this.start = null; this.fade = 0; }
  }

  /** New target from a `layout` message. `snap` (reduced motion, no renderer yet) applies it at once. */
  retarget(to: LayoutGeometry, now: number, snap: boolean): void {
    if (geometryEquals(this.to, to) && (this.mode !== null || geometryEquals(this.current, to))) {
      this.to = to; // same picture (cell edit re-post): keep whatever motion is running
      return;
    }
    if (this.fadingOut && !snap) {
      this.to = to; // the old picture is still leaving; the 'in' phase shows the latest target
      return;
    }
    if (this.mode === 'fade' && !snap && this.duration > 0 && to.layout.offsets.length === this.to.layout.offsets.length) {
      // A follow-up layout with the same channel count: keep the fade, snap the geometry under it.
      this.to = to;
      this.current = { rowHeight: to.rowHeight, layout: to.layout };
      return;
    }
    this.to = to;
    if (snap || this.duration <= 0) { this.finish(); return; }
    if (to.layout.offsets.length !== this.current.layout.offsets.length) {
      this.mode = 'fade';
      this.from = null;
      if (this.fade === 0) {
        // Nothing on screen to fade out (a fade-in still held at 0): go straight to the new picture.
        this.phase = 'in';
        this.current = { rowHeight: to.rowHeight, layout: to.layout };
        this.start = null;
        return;
      }
      // `current` stays the picture on screen until the 'out' phase ends.
      this.outFrom = this.fade;
      this.phase = 'out';
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
    if (this.mode === 'fade' && this.phase === 'out') {
      const t = Math.min(1, (now - this.start!) / this.duration);
      this.fade = this.outFrom * (1 - easeOutCubic(t));
      if (t >= 1) {
        // Black: swap to the new picture and fade it in from the next frame (or after the overlay lifts).
        this.phase = 'in';
        this.current = { rowHeight: this.to.rowHeight, layout: this.to.layout };
        this.fade = 0;
        this.start = null;
      }
      return true;
    }
    if (this.mode === 'fade') {
      if (this.covered) return false; // held at 0 under the overlay; already drawn at 0
      if (this.start === null) { this.start = now; this.fade = 0; return true; }
    }
    const t = Math.min(1, (now - this.start!) / this.duration);
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
    this.phase = 'in';
    this.from = null;
    this.current = this.to;
    this.fade = 1;
  }
}

function cloneGeometry(g: LayoutGeometry): LayoutGeometry {
  return { rowHeight: g.rowHeight, layout: { ...g.layout, offsets: g.layout.offsets.slice(), widths: g.layout.widths.slice() } };
}
