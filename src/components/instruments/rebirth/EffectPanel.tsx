/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 *
 * Canvas effect panels (port of re-rebirth src/render/devices/effects.js: the delay, distortion,
 * compressor and pattern filter modules). Same layout, fonts and colours as the original; knobs use the
 * shared rebirth knob renderer. Not ported: the live meters (they need the engine's level taps).
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { C, KNOB } from './theme';
import {
  brushed, line, panel, restoreLineScale, rgba, rrect, setLineScale, text, thinLines, vgrad, led, MONO, px,
  type Ctx,
} from './primitives';
import { attachCanvasInteraction, click, drawKnobControl, HitRegions, knobDrag } from './controls';
import { COMP_KNEE_DB, DELAY_STEPS, choiceIndex, compCurve, pcfShape } from '@engine/rebirtheffects/rebirthFxDsp';
import { PCF_SLOTS, PCF_WAVE_COUNT, PCF_WAVE_SHAPES } from '@engine/rebirtheffects/rebirthPcfWaves';

export type RebirthEffectFamily = 'dist' | 'delay' | 'comp' | 'pcf';
export type EffectPanelConfig = Record<string, number | undefined>;

export interface EffectPanelProps {
  family: RebirthEffectFamily;
  config: EffectPanelConfig;
  onChange: (updates: Record<string, number>) => void;
}

const W = 300;
const H = 92;
const TITLE_H = 16;
const TITLE: Record<RebirthEffectFamily, string> = { delay: 'DELAY', dist: 'DISTORTION', comp: 'COMPRESSOR', pcf: 'PATTERN FILTER' };
const ACCENT: Record<RebirthEffectFamily, string> = { delay: C.delay, dist: C.dist, comp: C.comp, pcf: C.pcf };
const DEFAULTS: Record<string, number> = {
  amount: 0.4, shape: 0.55, steps: 2 / 31, feedback: 0.45, pan: 0.5, triplet: 0, threshold: 0.5,
  freq: 0.45, reso: 0.5, decay: 0.4, wave: 0, mode: 1,
};
const COMP_DEFAULT_AMOUNT = 0.3;
const PCF_DEFAULT_AMOUNT = 0.6;

interface Args {
  ctx: Ctx;
  hits: HitRegions;
  get: (key: string) => number;
  set: (key: string, v: number) => void;
  family: RebirthEffectFamily;
}

const defaultOf = (family: RebirthEffectFamily, key: string): number =>
  key === 'amount' ? (family === 'comp' ? COMP_DEFAULT_AMOUNT : family === 'pcf' ? PCF_DEFAULT_AMOUNT : DEFAULTS.amount) : DEFAULTS[key];

function lcd(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  rrect(ctx, x, y, w, h, 2);
  ctx.fillStyle = vgrad(ctx, y, y + h, C.lcdGreen);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = px(1);
  ctx.stroke();
}

function button(a: Args, x: number, y: number, w: number, h: number, label: string, fn: () => void): void {
  const { ctx, hits } = a;
  rrect(ctx, x, y, w, h, 2);
  ctx.fillStyle = vgrad(ctx, y, y + h, C.btnDark);
  ctx.fill();
  text(ctx, label, x + w / 2, y + h / 2 + 0.5, { size: 6, weight: 800, color: C.inkLight });
  hits.rect(ctx, x, y, w, h, click(fn));
}

function knobAt(a: Args, x: number, y: number, r: number, key: string, label: string, ticks = 11, labelSize = 6): void {
  const def = defaultOf(a.family, key);
  drawKnobControl(a.ctx, a.hits, {
    x, y, r, ticks, label, labelSize, style: KNOB.fx, value: a.get(key), def, get: () => a.get(key), set: (v) => a.set(key, v),
  });
}

function drawFrame(a: Args): void {
  const { ctx, family } = a;
  const accent = ACCENT[family];
  panel(ctx, 0, 0, W, H, C.fxPanel);
  brushed(ctx, 0, 0, W, H, 0.25);
  ctx.fillStyle = vgrad(ctx, 0, TITLE_H, C.fxTitle);
  ctx.fillRect(0, 0, W, TITLE_H);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 3, TITLE_H);
  text(ctx, TITLE[family], 10, TITLE_H / 2 + 0.5, { size: 7, weight: 800, spacing: 1, align: 'left', color: C.inkLight });
  led(ctx, W - 12, TITLE_H / 2, 2.3, true, accent);
}

function drawDelay(a: Args): void {
  const { ctx, hits, get, set } = a;
  const accent = C.delay;
  const steps = choiceIndex(get('steps'), DELAY_STEPS) + 1;
  for (let i = 0; i < 12; i++) led(ctx, 20 + i * 5, 20, 1.6, i < Math.min(12, Math.ceil(steps / 3)), accent);
  lcd(ctx, 14, 24, 52, 36);
  text(ctx, String(steps), 40, 43, { size: 20, weight: 800, family: MONO, color: C.lcdGreenOn });
  hits.rect(ctx, 14, 24, 52, 36, knobDrag(() => get('steps'), (v) => set('steps', v), DEFAULTS.steps));
  const triplet = get('triplet') >= 0.5;
  button(a, 14, 70, 52, 14, triplet ? '1/8 TRIPLET' : '1/16 STEPS', () => set('triplet', triplet ? 0 : 1));
  knobAt(a, 116, 50, 14, 'steps', 'STEPS', 9);
  knobAt(a, 180, 50, 14, 'feedback', 'FEEDBACK');
  knobAt(a, 244, 50, 14, 'pan', 'PAN');
}

function drawDist(a: Args): void {
  knobAt(a, 44, 50, 14, 'amount', 'AMOUNT');
  knobAt(a, 110, 50, 14, 'shape', 'SHAPE');
}

function drawComp(a: Args): void {
  const { ctx, get } = a;
  knobAt(a, 44, 50, 14, 'amount', 'AMOUNT');
  knobAt(a, 110, 50, 14, 'threshold', 'THRESHOLD');
  const x = 160;
  const y = 22;
  const w = 124;
  const h = 56;
  lcd(ctx, x, y, w, h);
  const LO = -60;
  const c = compCurve(get('threshold'), get('amount'));
  const sx = (db: number): number => x + 4 + ((db - LO) / -LO) * (w - 8);
  const sy = (db: number): number => y + h - 4 - ((db - LO) / -LO) * (h - 8);
  ctx.strokeStyle = C.lcdGreenDim;
  ctx.lineWidth = px(1);
  for (let db = LO; db <= 0; db += 12) {
    line(ctx, sx(db), y + 3, sx(db), y + h - 3);
    ctx.stroke();
    line(ctx, x + 3, sy(db), x + w - 3, sy(db));
    ctx.stroke();
  }
  ctx.setLineDash([2, 2]);
  line(ctx, sx(LO), sy(LO), sx(0), sy(0));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = C.lcdGreenOn;
  ctx.lineWidth = px(1.4);
  ctx.beginPath();
  for (let db = LO; db <= 0; db += 1) {
    const over = db - c.thresholdDb;
    const red = over > COMP_KNEE_DB / 2 ? over : over < -COMP_KNEE_DB / 2 ? 0 : (over + COMP_KNEE_DB / 2) ** 2 / (2 * COMP_KNEE_DB);
    const out = Math.min(0, db + c.makeupDb - c.slope * red);
    if (db === LO) ctx.moveTo(sx(db), sy(out)); else ctx.lineTo(sx(db), sy(out));
  }
  ctx.stroke();
}

function drawPcf(a: Args): void {
  const { ctx, hits, get, set } = a;
  const accent = C.pcf;
  knobAt(a, 156, 38, 10, 'freq', 'FREQ', 9, 5.5);
  knobAt(a, 194, 38, 10, 'reso', 'RESO', 9, 5.5);
  knobAt(a, 232, 38, 10, 'amount', 'AMOUNT', 9, 5.5);
  knobAt(a, 270, 38, 10, 'decay', 'DECAY', 9, 5.5);
  const x = 12;
  const y = 22;
  const w = 120;
  const h = 46;
  lcd(ctx, x, y, w, h);
  const wave = choiceIndex(get('wave'), PCF_WAVE_COUNT);
  text(ctx, `WAVE ${String(wave + 1).padStart(2, '0')}`, x + 4, y + 7, { size: 6, weight: 800, align: 'left', family: MONO, color: C.lcdGreenMid });
  const shape = PCF_WAVE_SHAPES[wave];
  const bw = (w - 8) / PCF_SLOTS;
  shape.forEach((v, i) => {
    const bh = Math.max(0.5, v * (h - 16));
    ctx.fillStyle = rgba(accent, 0.9);
    ctx.fillRect(x + 4 + i * bw, y + h - 3 - bh, Math.max(1, bw - 0.6), bh);
  });
  const hz = pcfShape(get('freq'), get('reso')).hz;
  const cy = y + h - 3 - ((Math.log(Math.max(30, hz)) - Math.log(30)) / (Math.log(14000) - Math.log(30))) * (h - 16);
  ctx.strokeStyle = C.lcdGreenOn;
  ctx.lineWidth = px(1);
  line(ctx, x + 3, cy, x + w - 3, cy);
  ctx.stroke();
  text(ctx, `${Math.round(hz)} HZ`, x + w - 4, y + 7, { size: 6, align: 'right', family: MONO, color: C.lcdGreenMid });
  hits.rect(ctx, x, y, w, h, knobDrag(() => get('wave'), (v) => set('wave', v), 0));
  const nudge = (d: number): void => set('wave', (Math.min(PCF_WAVE_COUNT - 1, Math.max(0, wave + d))) / (PCF_WAVE_COUNT - 1));
  button(a, 14, 74, 14, 13, '<', () => nudge(-1));
  button(a, 30, 74, 14, 13, '>', () => nudge(1));
  const lowpass = get('mode') >= 0.5;
  button(a, 54, 74, 60, 13, lowpass ? 'LOWPASS' : 'BANDPASS', () => set('mode', lowpass ? 0 : 1));
}

function drawModule(a: Args): void {
  drawFrame(a);
  if (a.family === 'delay') drawDelay(a);
  else if (a.family === 'dist') drawDist(a);
  else if (a.family === 'comp') drawComp(a);
  else drawPcf(a);
}

export const EffectPanel: React.FC<EffectPanelProps> = ({ family, config, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const configRef = useRef(config);
  const onChangeRef = useRef(onChange);
  const hitsRef = useRef(new HitRegions());
  const lineCtxRef = useRef<Ctx | null>(null);
  configRef.current = config;
  onChangeRef.current = onChange;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const scale = ((canvas.clientWidth || W) / W) * (window.devicePixelRatio || 1);
    const bw = Math.max(1, Math.round(W * scale));
    const bh = Math.max(1, Math.round(H * scale));
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
    if (lineCtxRef.current !== ctx) { thinLines(ctx); lineCtxRef.current = ctx; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bw, bh);
    ctx.setTransform(bw / W, 0, 0, bh / H, 0, 0);
    const prev = setLineScale(ctx);
    hitsRef.current.clear();
    drawModule({
      ctx, family, hits: hitsRef.current,
      get: (key) => configRef.current[key] ?? defaultOf(family, key),
      set: (key, v) => {
        configRef.current = { ...configRef.current, [key]: v };
        onChangeRef.current({ [key]: v });
        requestAnimationFrame(draw);
      },
    });
    restoreLineScale(prev);
  }, [family]);

  useEffect(() => { draw(); }, [draw, config]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const detach = attachCanvasInteraction(canvas, hitsRef.current);
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    return () => { detach(); ro.disconnect(); };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      data-testid={`rebirth-fx-${family}-canvas`}
      style={{ width: '100%', maxWidth: W * 2, aspectRatio: `${W} / ${H}`, display: 'block', touchAction: 'none' }}
    />
  );
};
