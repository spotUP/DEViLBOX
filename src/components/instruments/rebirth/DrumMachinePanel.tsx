/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 *
 * Canvas drum machine panel (port of re-rebirth src/render/devices/drum-machine.js with the step
 * sequencer, pattern selector, pattern tools and ALL LANES grid removed). Same shapes, colours,
 * fonts, layout and knob look as the original; knob drag is hit-tested on the canvas.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import {
  drumParamKey, REBIRTH_LAYOUTS, type DrumGroupDef, type DrumKitId, type DrumKnobDef,
} from '@engine/rebirthdrums/rebirthDrumLayout';
import { C, KNOB, type KnobStyle } from './theme';
import {
  brushed, led, panel, restoreLineScale, rrect, screws, setLineScale, text, textWidth, thinLines, vgrad, px,
  type Ctx, type TextOpts,
} from './primitives';
import { attachCanvasInteraction, click, drawKnobControl, HitRegions } from './controls';

export type DrumPanelConfig = Record<string, number | undefined>;

export interface DrumMachinePanelProps {
  kit: DrumKitId;
  config: DrumPanelConfig;
  onChange: (updates: Record<string, number>) => void;
}

const INSTRUMENT_W = 772;
const HEADER_H = 18;
const GROUP_LABEL: TextOpts = { size: 6.3, weight: 800, spacing: 0.3 };

interface KitStyle {
  title: string;
  subtitle: string;
  baseH: number;
  baseKnobs: number;
  cols: number;
  cellW: number;
  rowH: number;
  r: number;
  top: number;
  knob: KnobStyle;
  panel: readonly string[];
  bottom: readonly string[];
  header: readonly string[];
  stripes: readonly string[];
  ink: string;
  selBg: string;
  selInk: string;
  sep: string;
  brushed: number;
}

const STYLES: Record<DrumKitId, KitStyle> = {
  '808': {
    title: 'DRUM 08', subtitle: 'ANALOG RHYTHM MACHINE', baseH: 200, baseKnobs: 130,
    cols: 1, cellW: 50, rowH: 31.5, r: 8, top: 45.5, knob: KNOB.r808,
    panel: ['#34322f', '#1f1e1c'], bottom: ['#1d1c1b', '#121211'], header: ['#151515', '#0a0a0a'],
    stripes: C.r808Steps, ink: '#ece5d3', selBg: '#ece5d3', selInk: '#1a1a1a', sep: 'rgba(236,229,211,0.14)', brushed: 0.15,
  },
  '909': {
    title: 'DRUM 09', subtitle: 'HYBRID RHYTHM MACHINE', baseH: 188, baseKnobs: 118,
    cols: 2, cellW: 32, rowH: 36, r: 10, top: 50, knob: KNOB.r909,
    panel: ['#d6d7d2', '#acada8'], bottom: ['#3a3b3d', '#232426'], header: ['#2a2b2d', '#18191a'],
    stripes: ['#ef6a1d', '#ef6a1d', '#ef6a1d'], ink: '#1d1d1d', selBg: '#ef6a1d', selInk: '#ffffff', sep: 'rgba(0,0,0,0.2)', brushed: 0.55,
  },
};

/** Original (abbreviated) canvas labels; the registry parameters keep full English names. */
const CANVAS_GROUP_LABEL: Record<DrumKitId, Record<string, string>> = {
  '808': { rs: 'RIM SHOT', cp: 'HAND CLAP', cb: 'COW BELL', oh: 'OPEN HAT', ch: 'CLSD HAT' },
  '909': { rs: 'RIM', cp: 'CLAP' },
};
const CANVAS_KNOB_LABEL: Record<string, string> = {
  chDecay: 'CH DEC', ohDecay: 'OH DEC', crLevel: 'CRASH', crTune: 'C TUNE', rdLevel: 'RIDE', rdTune: 'R TUNE',
};
const CANVAS_SWITCH_LABEL: Record<string, [string, string]> = {
  lt: ['LT', 'LC'], mt: ['MT', 'MC'], ht: ['HT', 'HC'], rs: ['RS', 'CL'], cp: ['CP', 'MA'],
};

const knobLabel = (k: DrumKnobDef): string => CANVAS_KNOB_LABEL[k.key] ?? k.label.toUpperCase();
const groupLabel = (kit: DrumKitId, g: DrumGroupDef): string => CANVAS_GROUP_LABEL[kit][g.id] ?? g.label.toUpperCase();

export function drumPanelHeight(kit: DrumKitId): number {
  return STYLES[kit].baseH;
}

interface Vertical {
  bottomY: number;
  knobTop: (top: number) => number;
  knobRowH: (rowH: number) => number;
}

function verticalLayout(s: KitStyle): Vertical {
  const kv = (s.baseKnobs - HEADER_H) / (s.baseKnobs - HEADER_H);
  return {
    bottomY: s.baseKnobs,
    knobTop: (top) => HEADER_H + (top - HEADER_H) * kv,
    knobRowH: (rowH) => rowH * kv,
  };
}

interface DrawArgs {
  ctx: Ctx;
  kit: DrumKitId;
  hits: HitRegions;
  get: (key: string, def: number) => number;
  set: (key: string, v: number) => void;
}

function drawHeader({ ctx }: DrawArgs, s: KitStyle): void {
  ctx.fillStyle = vgrad(ctx, 0, HEADER_H, s.header);
  ctx.fillRect(0, 0, INSTRUMENT_W, HEADER_H);
  const titleOpts: TextOpts = { size: 10, weight: 900, italic: true, align: 'left', color: C.inkLight };
  text(ctx, s.title, 18, 9.5, titleOpts);
  let x = 18 + textWidth(ctx, s.title, titleOpts) + 8;
  for (const color of s.stripes) {
    ctx.fillStyle = color;
    ctx.fillRect(x, 6, 10, 6);
    x += 12;
  }
  // The synth is always sounding, so the ON lamp is a fixed indicator (no step sequencer to arm).
  led(ctx, x + 6, 9, 2.3, true, C.ledGreen);
  text(ctx, 'ON', x + 12, 9.5, { size: 6, align: 'left', color: C.inkMuted });
  text(ctx, s.subtitle, x + 34, 9.5, { size: 6, align: 'left', color: C.inkMuted, spacing: 1.2 });
}

function drawSwitch(a: DrawArgs, s: KitStyle, x: number, y: number, key: string, labels: [string, string]): void {
  const { ctx, hits, get, set } = a;
  const on = get(key, 0) >= 0.5 ? 1 : 0;
  const hw = 15;
  const h = 11;
  const x0 = x - hw;
  rrect(ctx, x0 - 1, y - 1, hw * 2 + 2, h + 2, 2.5);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
  labels.forEach((label, i) => {
    const lit = i === on;
    rrect(ctx, x0 + i * hw, y, hw, h, 2);
    ctx.fillStyle = lit ? s.selBg : 'rgba(255,255,255,0.08)';
    ctx.fill();
    text(ctx, label, x0 + i * hw + hw / 2, y + h / 2 + 0.5, { size: 5.6, weight: 800, color: lit ? s.selInk : s.ink });
  });
  hits.rect(ctx, x0, y, hw * 2, h, click(() => set(key, on ? 0 : 1)));
}

/** Draws the whole panel and registers its hit regions. */
function drawPanel(a: DrawArgs): void {
  const { ctx, kit, hits, get, set } = a;
  const s = STYLES[kit];
  const layout = REBIRTH_LAYOUTS[kit];
  const V = verticalLayout(s);
  const w = INSTRUMENT_W;
  const h = s.baseH;

  panel(ctx, 0, 0, w, h, s.panel);
  if (s.brushed) brushed(ctx, 0, HEADER_H, w, V.bottomY - HEADER_H, s.brushed);
  ctx.fillStyle = vgrad(ctx, V.bottomY, h, s.bottom);
  ctx.fillRect(0, V.bottomY, w, h - V.bottomY);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, V.bottomY, w, px(1));

  drawHeader(a, s);

  // Group layout: groups spread evenly across the panel, each a small knob grid.
  const pad = 4;
  const widths = layout.groups.map((g) => Math.min(s.cols, g.knobs.filter((k) => !k.switchLabels).length) * s.cellW + pad * 2);
  const total = widths.reduce((acc, v) => acc + v, 0);
  const gap = (w - 36 - total) / (layout.groups.length - 1);
  let gx = 18;
  layout.groups.forEach((g, gi) => {
    const knobs = g.knobs.filter((k) => !k.switchLabels);
    const sw = g.knobs.find((k) => k.switchLabels);
    const cols = Math.min(s.cols, knobs.length);
    knobs.forEach((kn, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const inRow = Math.min(cols, knobs.length - row * cols);
      const key = drumParamKey(g.id, kn.key);
      drawKnobControl(ctx, hits, {
        x: gx + pad + ((cols - inRow) * s.cellW) / 2 + (col + 0.5) * s.cellW,
        y: V.knobTop(s.top) + row * V.knobRowH(s.rowH),
        r: s.r,
        ticks: 9,
        label: knobLabel(kn),
        labelSize: 5.6,
        labelColor: s.ink,
        style: s.knob,
        value: get(key, kn.def),
        def: kn.def,
        get: () => get(key, kn.def),
        set: (v) => set(key, v),
      });
    });
    if (sw) {
      const row = Math.ceil(knobs.length / cols);
      drawSwitch(a, s, gx + widths[gi] / 2, V.knobTop(s.top) + row * V.knobRowH(s.rowH) - 4, drumParamKey(g.id, sw.key), CANVAS_SWITCH_LABEL[g.id] ?? sw.switchLabels!);
    }
    text(ctx, groupLabel(kit, g), gx + widths[gi] / 2, 27.5, { ...GROUP_LABEL, color: s.ink });
    if (gi < layout.groups.length - 1) {
      ctx.strokeStyle = s.sep;
      ctx.lineWidth = 1;
      const sx = Math.round((gx + widths[gi] + gx + widths[gi] + gap) / 2) + 0.5;
      ctx.beginPath();
      ctx.moveTo(sx, 22);
      ctx.lineTo(sx, V.bottomY - 6);
      ctx.stroke();
    }
    gx += widths[gi] + gap;
  });

  screws(ctx, w, h);
}

export const DrumMachinePanel: React.FC<DrumMachinePanelProps> = ({ kit, config, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const configRef = useRef(config);
  const onChangeRef = useRef(onChange);
  const hitsRef = useRef(new HitRegions());
  const lineCtxRef = useRef<Ctx | null>(null);
  configRef.current = config;
  onChangeRef.current = onChange;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const h = STYLES[kit].baseH;
    const cssW = canvas.clientWidth || INSTRUMENT_W;
    const scale = (cssW / INSTRUMENT_W) * (window.devicePixelRatio || 1);
    const bw = Math.max(1, Math.round(INSTRUMENT_W * scale));
    const bh = Math.max(1, Math.round(h * scale));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    if (lineCtxRef.current !== ctx) {
      thinLines(ctx);
      lineCtxRef.current = ctx;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bw, bh);
    ctx.setTransform(bw / INSTRUMENT_W, 0, 0, bh / h, 0, 0);
    const prev = setLineScale(ctx);
    hitsRef.current.clear();
    drawPanel({
      ctx,
      kit,
      hits: hitsRef.current,
      get: (key, def) => configRef.current[key] ?? def,
      set: (key, v) => {
        configRef.current = { ...configRef.current, [key]: v };
        onChangeRef.current({ [key]: v });
        requestAnimationFrame(draw);
      },
    });
    restoreLineScale(prev);
  }, [kit]);

  useEffect(() => {
    draw();
  }, [draw, config]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const detach = attachCanvasInteraction(canvas, hitsRef.current);
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    return () => {
      detach();
      ro.disconnect();
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      data-testid={`rebirth-${kit}-canvas`}
      style={{ width: '100%', maxWidth: INSTRUMENT_W * 1.5, aspectRatio: `${INSTRUMENT_W} / ${STYLES[kit].baseH}`, display: 'block', touchAction: 'none' }}
    />
  );
};
