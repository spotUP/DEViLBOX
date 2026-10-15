/**
 * Plot geometry for CurveCanvas: units in, pixels out. Pure, so the mapping (and the log frequency axis) is
 * tested without a canvas.
 */
export interface PlotBox { width: number; height: number; padLeft: number; padRight: number; padTop: number; padBottom: number }

/** The axes of a curve once its ranges are numbers. */
export interface Axis {
  xScale?: 'linear' | 'log';
  xDomain: readonly [number, number];
  yDomain: readonly [number, number];
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** 0..1 position of x along the x axis. */
export function xFraction(axis: Axis, x: number): number {
  const [lo, hi] = axis.xDomain;
  if (axis.xScale === 'log') {
    if (x <= 0 || lo <= 0) return 0;
    return clamp01((Math.log(x) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)));
  }
  return clamp01((x - lo) / (hi - lo));
}

/** 0..1 position of y along the y axis (0 = bottom). */
export function yFraction(axis: Axis, y: number): number {
  const [lo, hi] = axis.yDomain;
  return clamp01((y - lo) / (hi - lo));
}

export function toPixel(axis: Axis, box: PlotBox, x: number, y: number): [number, number] {
  const w = box.width - box.padLeft - box.padRight;
  const h = box.height - box.padTop - box.padBottom;
  return [box.padLeft + xFraction(axis, x) * w, box.padTop + (1 - yFraction(axis, y)) * h];
}

/** Grid lines of the x axis: decades for a log axis, quarters for a linear one. */
export function xGridValues(axis: Axis): number[] {
  const [lo, hi] = axis.xDomain;
  if (axis.xScale === 'log') {
    const out: number[] = [];
    for (let d = 10 ** Math.floor(Math.log10(lo)); d <= hi; d *= 10) for (const m of [1]) if (d * m >= lo && d * m <= hi) out.push(d * m);
    return out;
  }
  return [0.25, 0.5, 0.75].map((f) => lo + f * (hi - lo));
}
