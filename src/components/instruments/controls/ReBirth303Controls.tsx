/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 *
 * re-rebirth 303 synth panel: canvas port of re-rebirth src/render/devices/bassline.js (header, brushed
 * knob section, waveform switch and the seven bass knobs, same positions, shapes and colours).
 * The step sequencer, keyboard, edit buttons, pattern selector and pattern tools are not ported.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import type { ReBirth303Config } from '@typedefs/instrument';
import { DEFAULT_REBIRTH303 } from '@typedefs/instrument';
import { C, KNOB } from '../rebirth/theme';
import {
  brushed, circle, led, line, panel, restoreLineScale, rrect, screws, setLineScale, text, textWidth,
  thinLines, vgrad, waveIcon, type Ctx, type TextOpts,
} from '../rebirth/primitives';
import { attachCanvasInteraction, click, drawKnobControl, HitRegions } from '../rebirth/controls';

export interface ReBirth303ControlsProps {
  config: ReBirth303Config;
  onChange: (updates: Partial<ReBirth303Config>) => void;
}

type KnobKey = 'tuning' | 'cutoff' | 'resonance' | 'envmod' | 'decay' | 'accent' | 'volume';
const KNOBS: ReadonlyArray<readonly [KnobKey, string]> = [
  ['tuning', 'TUNING'],
  ['cutoff', 'CUT OFF FREQ'],
  ['resonance', 'RESONANCE'],
  ['envmod', 'ENV MOD'],
  ['decay', 'DECAY'],
  ['accent', 'ACCENT'],
  ['volume', 'VOLUME'],
];

const W = 772;
const H = 80; // original knob section ends at the sequencer top (y = 80)
const HEADER_H = 18;
const SELECTOR_W = 236;
const KNOB_Y = 55.5;
const KNOB_R = 15;
// Original spacing: knobs spread up to where the (unported) pattern selector sits.
const SELECTOR_X = W - 20 - SELECTOR_W;
const knobX = (i: number): number => 102 + (i * (SELECTOR_X - 54 - 102)) / 6;

const num = (cfg: ReBirth303Config, key: keyof ReBirth303Config): number => {
  const v = cfg[key];
  return typeof v === 'number' ? v : (DEFAULT_REBIRTH303[key] as number | undefined) ?? 0;
};

interface DrawArgs {
  ctx: Ctx;
  hits: HitRegions;
  get: (key: keyof ReBirth303Config) => number;
  set: (key: keyof ReBirth303Config, v: number) => void;
}

function drawHeader(ctx: Ctx): void {
  ctx.fillStyle = vgrad(ctx, 0, HEADER_H, C.bassHeader);
  ctx.fillRect(0, 0, W, HEADER_H);
  const title = 'BASS LINE';
  const titleOpts: TextOpts = { size: 10, weight: 900, italic: true, align: 'left', color: C.inkLight };
  text(ctx, title, 18, 9.5, titleOpts);
  const tx = 18 + textWidth(ctx, title, titleOpts) + 6;
  rrect(ctx, tx, 3.5, 13, 11, 2);
  ctx.fillStyle = C.bassAccent;
  ctx.fill();
  text(ctx, '1', tx + 6.5, 9.5, { size: 8, weight: 900, color: C.bassInk });
  // The synth is always sounding, so the ON lamp is a fixed indicator (no step sequencer to arm).
  led(ctx, tx + 24, 9, 2.3, true, C.ledGreen);
  text(ctx, 'ON', tx + 30, 9.5, { size: 6, align: 'left', color: C.inkMuted });
  text(ctx, 'ANALOG BASS SYNTHESIZER', tx + 52, 9.5, { size: 6, align: 'left', color: C.inkMuted, spacing: 1.2 });
}

function drawWaveSwitch(a: DrawArgs, cx: number, cy: number): void {
  const { ctx, hits, get, set } = a;
  const square = get('waveform') >= 0.5;
  text(ctx, 'WAVEFORM', cx, cy - 21, { size: 6.5, color: C.bassInk });
  rrect(ctx, cx - 17, cy - 7.5, 34, 15, 7.5);
  ctx.fillStyle = vgrad(ctx, cy - 7.5, cy + 7.5, ['#0b0b0c', '#2a2b2e']);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 0.7;
  line(ctx, cx - 12, cy + 8, cx + 12, cy + 8);

  const lx = square ? cx + 8.5 : cx - 8.5;
  const g = ctx.createRadialGradient(lx - 2, cy - 2.5, 0.5, lx, cy, 6.5);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#8a8e94');
  circle(ctx, lx, cy, 6);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.stroke();

  waveIcon(ctx, 'saw', cx - 10, cy + 17, 4, square ? 'rgba(27,27,30,0.45)' : C.bassInk);
  waveIcon(ctx, 'square', cx + 10, cy + 17, 4, square ? C.bassInk : 'rgba(27,27,30,0.45)');
  hits.rect(ctx, cx - 20, cy - 9, 40, 30, click(() => set('waveform', square ? 0 : 1)));
}

/** Draws the whole panel and registers its hit regions. */
function drawPanel(a: DrawArgs): void {
  const { ctx, hits, get, set } = a;
  panel(ctx, 0, 0, W, H, C.bassPanel);
  brushed(ctx, 0, HEADER_H, W, H - HEADER_H, 0.9);
  drawHeader(ctx);
  drawWaveSwitch(a, 46, KNOB_Y - 4);
  KNOBS.forEach(([key, label], i) => {
    const def = DEFAULT_REBIRTH303[key] ?? 0;
    drawKnobControl(ctx, hits, {
      x: knobX(i),
      y: KNOB_Y,
      r: KNOB_R,
      label,
      labelPos: 'above',
      labelSize: 6.5,
      labelColor: C.bassInk,
      style: KNOB.bass,
      value: get(key),
      def,
      get: () => get(key),
      set: (v) => set(key, v),
    });
  });
  screws(ctx, W, H);
}

export const ReBirth303Controls: React.FC<ReBirth303ControlsProps> = ({ config, onChange }) => {
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
    const cssW = canvas.clientWidth || W;
    const scale = (cssW / W) * (window.devicePixelRatio || 1);
    const bw = Math.max(1, Math.round(W * scale));
    const bh = Math.max(1, Math.round(H * scale));
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
    ctx.setTransform(bw / W, 0, 0, bh / H, 0, 0);
    const prev = setLineScale(ctx);
    hitsRef.current.clear();
    drawPanel({
      ctx,
      hits: hitsRef.current,
      get: (key) => num(configRef.current, key),
      set: (key, v) => {
        configRef.current = { ...configRef.current, [key]: v };
        onChangeRef.current({ [key]: v } as Partial<ReBirth303Config>);
        requestAnimationFrame(draw);
      },
    });
    restoreLineScale(prev);
  }, []);

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
    <div className="p-3 bg-dark-bg">
      <canvas
        ref={canvasRef}
        data-testid="rebirth-303-canvas"
        style={{ width: '100%', maxWidth: W * 1.5, aspectRatio: `${W} / ${H}`, display: 'block', touchAction: 'none' }}
      />
    </div>
  );
};
