/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 *
 * Vector drawing primitives (port of re-rebirth src/render/primitives.js, the subset the
 * drum panels need). Everything is drawn in design units and scaled by the context transform.
 * Shared by every ReBirth panel.
 */
import { C, type KnobStyle } from './theme';

export const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
export const MONO = 'Menlo, "SF Mono", Consolas, monospace';
const TAU = Math.PI * 2;

export type Ctx = CanvasRenderingContext2D;

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** amt < 0 darkens towards black, amt > 0 lightens towards white. */
export function shade(hex: string, amt: number): string {
  const f = (c: number) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function addStops(g: CanvasGradient, stops: readonly string[]): CanvasGradient {
  stops.forEach((c, i) => g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), c));
  return g;
}

export const vgrad = (ctx: Ctx, y0: number, y1: number, stops: readonly string[]): CanvasGradient =>
  addStops(ctx.createLinearGradient(0, y0, 0, y1), stops);
export const hgrad = (ctx: Ctx, x0: number, x1: number, stops: readonly string[]): CanvasGradient =>
  addStops(ctx.createLinearGradient(x0, 0, x1, 0), stops);

export function circle(ctx: Ctx, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
}

export function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r = 2): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

export interface TextOpts {
  size?: number;
  weight?: number;
  italic?: boolean;
  family?: string;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  spacing?: number;
}

function font({ size = 7, weight = 700, italic = false, family = FONT }: TextOpts): string {
  return `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`;
}

export function text(ctx: Ctx, s: string, x: number, y: number, opts: TextOpts = {}): void {
  const { color = C.inkLight, align = 'center', baseline = 'middle', spacing = 0 } = opts;
  ctx.font = font(opts);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (spacing && 'letterSpacing' in ctx) {
    ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(s, x, y);
    ctx.letterSpacing = '0px';
  } else {
    ctx.fillText(s, x, y);
  }
}

/** Includes letter spacing, as `text` draws it. */
export function textWidth(ctx: Ctx, s: string, opts: TextOpts = {}): number {
  ctx.font = font(opts);
  const spacing = opts.spacing && 'letterSpacing' in ctx ? opts.spacing * s.length : 0;
  return ctx.measureText(s).width + spacing;
}

// Line unit: strokes and hairlines stay at most 1 CSS px per unit however large the view is
// drawn (like SVG non-scaling-stroke). See the original primitives.js for the rationale.
let LINE = 1;
let rawWidth: PropertyDescriptor | undefined;

export const px = (n: number): number => n * LINE;

/** Call after setting each transform. Returns the previous scale for restoreLineScale. */
export function setLineScale(ctx: Ctx): number {
  const m = ctx.getTransform();
  const css = Math.hypot(m.a, m.b) / (globalThis.devicePixelRatio || 1);
  const prev = LINE;
  LINE = Math.min(1, 1 / css);
  return prev;
}

export function restoreLineScale(prev: number): void {
  LINE = prev;
}

/** Makes ctx.lineWidth count in line units, so every stroke follows without call-site changes. */
export function thinLines(ctx: Ctx): void {
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx), 'lineWidth');
  if (!desc || !desc.get || !desc.set) return;
  rawWidth = desc;
  const get = desc.get;
  const set = desc.set;
  Object.defineProperty(ctx, 'lineWidth', {
    configurable: true,
    get: () => (get.call(ctx) as number) / LINE,
    set: (w: number) => set.call(ctx, w * LINE),
  });
}

/** Sets a width that is part of a shape (knob pointer, icon) and should scale like it. */
export function shapeWidth(ctx: Ctx, w: number): void {
  if (rawWidth?.set) rawWidth.set.call(ctx, w);
  else ctx.lineWidth = w;
}

export function panel(
  ctx: Ctx, x: number, y: number, w: number, h: number, stops: readonly string[],
  { radius = 2, bevel = 0.3 }: { radius?: number; bevel?: number } = {},
): void {
  rrect(ctx, x, y, w, h, radius);
  ctx.fillStyle = vgrad(ctx, y, y + h, stops);
  ctx.fill();
  // Bevel: lit top-left edge, shaded bottom-right edge, following the rounded corners.
  const lw = 1;
  const i = px(lw) / 2;
  const r = Math.max(0, radius - i);
  const [l, t, rt, b] = [x + i + r, y + i + r, x + w - i - r, y + h - i - r];
  const q = Math.PI / 4;
  ctx.lineWidth = lw;
  ctx.strokeStyle = `rgba(255,255,255,${bevel})`;
  ctx.beginPath();
  ctx.arc(l, b, r, 3 * q, 4 * q);
  ctx.arc(l, t, r, 4 * q, 6 * q);
  ctx.arc(rt, t, r, 6 * q, 7 * q);
  ctx.stroke();
  ctx.strokeStyle = `rgba(0,0,0,${Math.min(1, bevel + 0.35)})`;
  ctx.beginPath();
  ctx.arc(rt, t, r, 7 * q, 8 * q);
  ctx.arc(rt, b, r, 0, 2 * q);
  ctx.arc(l, b, r, 2 * q, 3 * q);
  ctx.stroke();
}

let brushedTile: HTMLCanvasElement | null = null;
const brushedPatterns = new WeakMap<Ctx, CanvasPattern>();

function brushedPattern(ctx: Ctx): CanvasPattern | null {
  const cached = brushedPatterns.get(ctx);
  if (cached) return cached;
  if (!brushedTile) {
    const W = 512;
    const H = 128;
    const tile = document.createElement('canvas');
    tile.width = W;
    tile.height = H;
    const g = tile.getContext('2d');
    if (!g) return null;
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 1400; i++) {
      const y = rnd() * H;
      const x = rnd() * W;
      const len = 40 + rnd() * 260;
      g.strokeStyle = rnd() > 0.5 ? `rgba(255,255,255,${0.05 + rnd() * 0.12})` : `rgba(0,0,0,${0.04 + rnd() * 0.1})`;
      g.lineWidth = 0.5 + rnd() * 0.6;
      for (const ox of [0, -W]) {
        g.beginPath();
        g.moveTo(x + ox, y);
        g.lineTo(x + ox + len, y);
        g.stroke();
      }
    }
    brushedTile = tile;
  }
  const pattern = ctx.createPattern(brushedTile, 'repeat');
  if (pattern) brushedPatterns.set(ctx, pattern);
  return pattern;
}

export function brushed(ctx: Ctx, x: number, y: number, w: number, h: number, alpha = 1): void {
  const pattern = brushedPattern(ctx);
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = pattern;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

export function softShadow(ctx: Ctx, cx: number, cy: number, r: number, alpha = 0.5): void {
  const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  circle(ctx, cx, cy, r);
  ctx.fill();
}

export function screw(ctx: Ctx, cx: number, cy: number, r = 3.4, angle = 0.6): void {
  softShadow(ctx, cx + 0.5, cy + 1, r + 1.8, 0.55);
  const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#f4f4f4');
  g.addColorStop(0.6, '#a7a9ad');
  g.addColorStop(1, '#55585d');
  circle(ctx, cx, cy, r);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.strokeStyle = 'rgba(30,30,30,0.85)';
  shapeWidth(ctx, r * 0.28);
  ctx.lineCap = 'round';
  line(ctx, -r * 0.55, 0, r * 0.55, 0);
  line(ctx, 0, -r * 0.55, 0, r * 0.55);
  ctx.restore();
}

export function screws(ctx: Ctx, w: number, h: number, inset = 7, top = 9): void {
  screw(ctx, inset, top, 3.4, 0.4);
  screw(ctx, w - inset, top, 3.4, 1.1);
  screw(ctx, inset, h - top, 3.4, 0.9);
  screw(ctx, w - inset, h - top, 3.4, 0.2);
}

export const KNOB_A0 = Math.PI * 0.75;
export const KNOB_SWEEP = Math.PI * 1.5;

export function knob(ctx: Ctx, cx: number, cy: number, r: number, value: number, s: KnobStyle, { ticks = 11 }: { ticks?: number } = {}): void {
  if (ticks > 1) {
    ctx.strokeStyle = s.tick;
    ctx.lineCap = 'round';
    for (let i = 0; i < ticks; i++) {
      const a = KNOB_A0 + (KNOB_SWEEP * i) / (ticks - 1);
      const major = i === 0 || i === ticks - 1;
      const r0 = r + 2.2;
      const r1 = r + (major ? 5 : 4);
      ctx.lineWidth = major ? 1.1 : 0.8;
      line(ctx, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    }
  }

  softShadow(ctx, cx + r * 0.1, cy + r * 0.25, r * 1.35, 0.6);

  let g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.1, cx, cy, r);
  g.addColorStop(0, s.body[0]);
  g.addColorStop(1, s.body[1]);
  circle(ctx, cx, cy, r);
  ctx.fillStyle = g;
  ctx.fill();

  if (s.knurl) {
    ctx.strokeStyle = s.knurl;
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 32; i++) {
      const a = (TAU * i) / 32;
      line(ctx, cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8, cx + Math.cos(a) * r * 0.97, cy + Math.sin(a) * r * 0.97);
    }
  }
  circle(ctx, cx, cy, r);
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  if (s.cap) {
    const rc = r * s.capRatio;
    g = ctx.createRadialGradient(cx - rc * 0.4, cy - rc * 0.5, rc * 0.05, cx, cy, rc * 1.05);
    g.addColorStop(0, s.cap[0]);
    g.addColorStop(1, s.cap[1]);
    circle(ctx, cx, cy, rc);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(cx, cy, rc - px(0.3), Math.PI * 1.05, Math.PI * 1.75);
    ctx.stroke();
  }

  const a = KNOB_A0 + KNOB_SWEEP * clamp01(value);
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  ctx.lineCap = 'round';
  for (const [color, from, to, width] of s.pointers) {
    ctx.strokeStyle = color;
    shapeWidth(ctx, Math.max(0.9, r * width));
    line(ctx, cx + ca * r * from, cy + sa * r * from, cx + ca * r * to, cy + sa * r * to);
  }
}

export function led(ctx: Ctx, cx: number, cy: number, r: number, on: boolean, color: string = C.ledRed): void {
  if (on) {
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3.5);
    glow.addColorStop(0, rgba(color, 0.55));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    circle(ctx, cx, cy, r * 3.5);
    ctx.fill();
  }
  circle(ctx, cx, cy + px(0.3), r + px(0.9));
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fill();
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.05, cx, cy, r);
  if (on) {
    g.addColorStop(0, '#fffbe8');
    g.addColorStop(0.35, color);
    g.addColorStop(1, shade(color, -0.35));
  } else {
    g.addColorStop(0, shade(color, -0.45));
    g.addColorStop(1, shade(color, -0.82));
  }
  circle(ctx, cx, cy, r);
  ctx.fillStyle = g;
  ctx.fill();
  circle(ctx, cx - r * 0.35, cy - r * 0.4, r * 0.28);
  ctx.fillStyle = on ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.22)';
  ctx.fill();
}

/** Saw / square wave glyph (port of re-rebirth waveIcon). */
export function waveIcon(ctx: Ctx, kind: 'saw' | 'square', cx: number, cy: number, s: number, color: string): void {
  const h = s / 2;
  ctx.strokeStyle = color;
  shapeWidth(ctx, 1);
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  if (kind === 'saw') {
    ctx.moveTo(cx - s, cy + h);
    ctx.lineTo(cx, cy - h);
    ctx.lineTo(cx, cy + h);
    ctx.lineTo(cx + s, cy - h);
    ctx.lineTo(cx + s, cy + h);
  } else {
    ctx.moveTo(cx - s, cy + h);
    ctx.lineTo(cx - s, cy - h);
    ctx.lineTo(cx, cy - h);
    ctx.lineTo(cx, cy + h);
    ctx.lineTo(cx + s, cy + h);
    ctx.lineTo(cx + s, cy - h);
  }
  ctx.stroke();
}
