/**
 * Factory canvas drawing (R2f). Pure functions over a 2D context; colours are passed in, read from the design tokens
 * by `readTokens`, so no colour is written here.
 */
import type { Env, Peaks } from '@/engine/uprough/r2Peaks';

export interface FactoryColors { line: string; wave: string; final: string; env: string; dim: string; eye: string; plate: string; text: string }

/** Reads the design tokens off an element (a canvas inside the themed document). */
export function readTokens(el: Element): FactoryColors {
  const cs = getComputedStyle(el);
  const t = (name: string): string => cs.getPropertyValue(name).trim() || 'currentColor';
  return {
    line: t('--color-border'), wave: t('--color-accent'), final: t('--color-cell-instrument'), env: t('--color-synth-envelope'),
    dim: t('--color-text-muted'), eye: t('--color-text'), plate: t('--color-bg-tertiary'), text: t('--color-text-secondary'),
  };
}

/**
 * Sizes a canvas's backing store to its displayed width times the device pixel ratio and maps the context to CSS pixels,
 * so a drawing keeps its proportions (round gears) and stays sharp however wide the panel is. Returns the logical
 * (CSS pixel) size every draw function takes; `fallbackWidth` covers a canvas not laid out yet.
 */
export function fitCanvas(
  cv: HTMLCanvasElement, ctx: CanvasRenderingContext2D, height: number, fallbackWidth: number, dpr: number = window.devicePixelRatio || 1,
): { w: number; h: number } {
  const w = Math.max(1, Math.round(cv.clientWidth || fallbackWidth));
  const bw = Math.round(w * dpr);
  const bh = Math.round(height * dpr);
  if (cv.width !== bw) cv.width = bw;
  if (cv.height !== bh) cv.height = bh;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h: height };
}

/** The bucket value at fractional position u in 0..1: min and max in -1..1. */
function at(p: Peaks, u: number, reference?: number): { lo: number; hi: number } {
  if (p.n === 0) return { lo: 0, hi: 0 };
  const i = Math.min(p.n - 1, Math.max(0, Math.floor(u * p.n)));
  // Absolute amplitude: the int8 buckets are normalised per buffer, `scale` is the buffer's real max |sample|.
  const gain = reference !== undefined && reference > 0 ? p.scale / reference : 1;
  return { lo: (p.min[i]! / 127) * gain, hi: (p.max[i]! / 127) * gain };
}

/**
 * The min/max bars of `a` morphing into `b` (frac 0..1), over a centre line. `reveal` 0..1 draws only the left part
 * (the one-shot growing). `reference`, when given, draws in absolute amplitude: a bucket's height is (value/127)*scale/reference,
 * so waves of different real loudness keep their relative size (the record press, R2f-32). Without it every wave fills the
 * box (its own normalised look). Returns nothing; draws into the whole canvas box.
 */
export function drawWave(
  ctx: CanvasRenderingContext2D, w: number, h: number, a: Peaks | undefined, b: Peaks | undefined, frac: number,
  color: string, lineColor: string, reveal = 1, reference?: number,
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  if (!a && !b) return;
  const cols = Math.floor(w * reveal);
  ctx.fillStyle = color;
  for (let x = 0; x < cols; x++) {
    const u = x / w;
    const pa = a ? at(a, u, reference) : { lo: 0, hi: 0 };
    const pb = b ? at(b, u, reference) : pa;
    const lo = pa.lo + (pb.lo - pa.lo) * frac;
    const hi = pa.hi + (pb.hi - pa.hi) * frac;
    const y0 = h / 2 - hi * (h / 2 - 1);
    const y1 = h / 2 - lo * (h / 2 - 1);
    ctx.fillRect(x, y0, 1, Math.max(1, y1 - y0));
  }
}

/** An envelope curve (0..1 values) with a label in the corner. */
export function drawEnvelope(ctx: CanvasRenderingContext2D, w: number, h: number, env: Env, label: string, c: FactoryColors): void {
  ctx.strokeStyle = c.env;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  env.values.forEach((v, i) => {
    const x = (i / (env.n - 1)) * w;
    const y = h - 2 - Math.min(1, Math.max(0, Math.abs(v))) * (h - 4);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = c.text;
  ctx.font = '10px sans-serif';
  ctx.fillText(label, 3, 11);
}

/** Two eyes that blink: closed for 0.12 s every 3.6 s, offset by `phase`. */
export function drawEyes(ctx: CanvasRenderingContext2D, x: number, y: number, timeSec: number, phase: number, c: FactoryColors): void {
  const closed = ((timeSec + phase) % 3.6) < 0.12;
  ctx.fillStyle = c.eye;
  for (const dx of [0, 9]) {
    ctx.beginPath();
    ctx.ellipse(x + dx, y, 2.5, closed ? 0.6 : 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A gear with `teeth` teeth turning at angle `a`. */
export function drawGear(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, teeth: number, a: number, color: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const ang = (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.72;
    ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A section chip riding the conveyor (R2f-56): `x` is its left edge from `chipPosition`. */
export interface ConveyorChip { x: number; label: string }

/** A conveyor band: scrolling ticks along the bottom edge, with a chip per real section event riding on it. */
export function drawConveyor(
  ctx: CanvasRenderingContext2D, w: number, y: number, offset: number, color: string,
  chips: readonly ConveyorChip[] = [], plateColor: string = color, textColor: string = color,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, y, w, 1);
  for (let x = -(offset % 10); x < w; x += 10) ctx.fillRect(x, y + 2, 2, 3);
  ctx.font = '9px sans-serif';
  for (const chip of chips) {
    ctx.fillStyle = plateColor;
    ctx.fillRect(chip.x, y - 12, 40, 11);
    ctx.fillStyle = textColor;
    ctx.fillText(chip.label.slice(0, 8), chip.x + 2, y - 3);
  }
}
