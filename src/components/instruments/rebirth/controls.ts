/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 *
 * Immediate-mode hit regions and knob drag (port of re-rebirth src/ui/hits.js, the knob parts of
 * src/ui/handlers.js and the Knob class of src/render/controls.js). Drawing code registers
 * interactive shapes while it paints, capturing the current transform, so hit areas always match
 * the pixels on screen. One HitRegions instance per canvas (the original used a module global).
 */
import { C, type KnobStyle } from './theme';
import { clamp01, knob, text, type Ctx } from './primitives';

export interface Pt {
  x: number;
  y: number;
}

export interface DragEvent {
  /** Pointer position in the region's local (design) units. */
  p: Pt;
  /** CSS pixels moved vertically since the last move event. */
  ddy: number;
  /** Shift held: fine adjustment. */
  fine: boolean;
}

export interface WheelEvent2 {
  delta: number;
  fine: boolean;
}

export interface Session {
  move?: (ev: DragEvent) => void;
  up?: () => void;
}

export interface Handler {
  cursor: string;
  down?: (ev: DragEvent) => Session | void;
  wheel?: (ev: WheelEvent2) => void;
  dblclick?: () => void;
}

interface Region {
  inverse: DOMMatrix;
  test: (p: Pt) => boolean;
  handler: Handler;
}

export class HitRegions {
  private regions: Region[] = [];

  clear(): void {
    this.regions.length = 0;
  }

  private add(ctx: Ctx, test: (p: Pt) => boolean, handler: Handler): void {
    this.regions.push({ inverse: ctx.getTransform().inverse(), test, handler });
  }

  rect(ctx: Ctx, x: number, y: number, w: number, h: number, handler: Handler): void {
    this.add(ctx, (p) => p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h, handler);
  }

  circle(ctx: Ctx, cx: number, cy: number, r: number, handler: Handler): void {
    this.add(ctx, (p) => (p.x - cx) ** 2 + (p.y - cy) ** 2 <= r * r, handler);
  }

  /** (x, y) in canvas backing-store pixels. Later regions win. */
  find(x: number, y: number): { handler: Handler; p: Pt } | null {
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const region = this.regions[i];
      const p = region.inverse.transformPoint({ x, y });
      if (region.test(p)) return { handler: region.handler, p };
    }
    return null;
  }
}

export const KNOB_PX = 200; // CSS pixels of vertical drag for a full sweep
export const FINE = 6;
export const scaled = (px: number, fine: boolean): number => px / (KNOB_PX * (fine ? FINE : 1));

/** Vertical drag, wheel and double-click-to-default handler for one normalised (0..1) value. */
export function knobDrag(get: () => number, set: (v: number) => void, def: number): Handler {
  return {
    cursor: 'ns-resize',
    down: () => ({ move: (ev) => set(clamp01(get() - scaled(ev.ddy, ev.fine))) }),
    wheel: (ev) => set(clamp01(get() - scaled(ev.delta, ev.fine) / 4)),
    dblclick: () => set(def),
  };
}

/** Click handler (voice switch, toggles). */
export function click(fn: () => void): Handler {
  return { cursor: 'pointer', down: () => { fn(); } };
}

export interface KnobControlOpts {
  x: number;
  y: number;
  r?: number;
  ticks?: number;
  label: string;
  labelSize?: number;
  labelColor?: string;
  labelPos?: 'above' | 'below';
  style: KnobStyle;
  value: number;
  def: number;
  get: () => number;
  set: (v: number) => void;
}

/** Draws a labelled knob and registers its drag region (port of the original Knob control). */
export function drawKnobControl(ctx: Ctx, hits: HitRegions, o: KnobControlOpts): void {
  const r = o.r ?? 12;
  knob(ctx, o.x, o.y, r, o.value, o.style, { ticks: o.ticks ?? 11 });
  hits.circle(ctx, o.x, o.y, r + 4, knobDrag(o.get, o.set, o.def));
  text(ctx, o.label, o.x, o.labelPos === 'above' ? o.y - r - 10 : o.y + r + 7.5, {
    size: o.labelSize ?? 6,
    color: o.labelColor ?? C.inkLight,
  });
}

/**
 * Wires pointer, wheel and double-click events of a canvas to the hit regions. Pointer positions
 * are mapped to backing-store pixels. Returns a cleanup function.
 */
export function attachCanvasInteraction(canvas: HTMLCanvasElement, hits: HitRegions): () => void {
  const toBacking = (e: { clientX: number; clientY: number }): Pt => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  };
  let session: Session | null = null;
  let lastY = 0;

  const onDown = (e: PointerEvent) => {
    const b = toBacking(e);
    const hit = hits.find(b.x, b.y);
    if (!hit) return;
    canvas.setPointerCapture(e.pointerId);
    lastY = e.clientY;
    session = hit.handler.down?.({ p: hit.p, ddy: 0, fine: e.shiftKey }) ?? null;
    e.preventDefault();
  };
  const onMove = (e: PointerEvent) => {
    if (session) {
      const b = toBacking(e);
      const hit = hits.find(b.x, b.y);
      session.move?.({ p: hit?.p ?? { x: 0, y: 0 }, ddy: e.clientY - lastY, fine: e.shiftKey });
      lastY = e.clientY;
      return;
    }
    const b = toBacking(e);
    canvas.style.cursor = hits.find(b.x, b.y)?.handler.cursor ?? 'default';
  };
  const onUp = (e: PointerEvent) => {
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    session?.up?.();
    session = null;
  };
  const onWheel = (e: globalThis.WheelEvent) => {
    const b = toBacking(e);
    const hit = hits.find(b.x, b.y);
    if (!hit?.handler.wheel) return;
    e.preventDefault();
    hit.handler.wheel({ delta: e.deltaY, fine: e.shiftKey });
  };
  const onDbl = (e: MouseEvent) => {
    const b = toBacking(e);
    hits.find(b.x, b.y)?.handler.dblclick?.();
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDbl);
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('dblclick', onDbl);
  };
}
