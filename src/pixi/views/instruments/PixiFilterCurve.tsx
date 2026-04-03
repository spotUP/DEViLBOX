/**
 * PixiFilterCurve — Real-time filter frequency response curve for the Pixi instrument editor.
 * Analytically computed from filter params (cutoff, resonance, type).
 */

import React, { useCallback } from 'react';
import { Graphics } from 'pixi.js';
import { usePixiTheme } from '../../theme';

type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'notch';

interface PixiFilterCurveProps {
  cutoff: number;
  resonance: number;
  type: FilterType;
  width: number;
  height: number;
  color?: number;
}

const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const DB_RANGE = 24;
const NUM_POINTS = 100;

function calcGain(freq: number, cutoff: number, Q: number, type: FilterType): number {
  const ratio = freq / cutoff;
  const bw = 1 / Math.max(Q, 0.5);
  switch (type) {
    case 'lowpass': {
      const base = 1 / Math.sqrt(1 + Math.pow(ratio, 4));
      const peak = Q > 1 ? (Q - 1) * 0.5 * Math.exp(-Math.pow(Math.log(ratio), 2) * 8) : 0;
      return base + peak;
    }
    case 'highpass': {
      const base = Math.pow(ratio, 2) / Math.sqrt(1 + Math.pow(ratio, 4));
      const peak = Q > 1 ? (Q - 1) * 0.5 * Math.exp(-Math.pow(Math.log(ratio), 2) * 8) : 0;
      return base + peak;
    }
    case 'bandpass': {
      const diff = ratio - 1 / ratio;
      return 1 / Math.sqrt(1 + Math.pow(diff / bw, 2));
    }
    case 'notch': {
      const diff = ratio - 1 / ratio;
      return Math.abs(diff) / Math.sqrt(diff * diff + bw * bw);
    }
    default: return 1;
  }
}

function freqToX(freq: number, w: number): number {
  return (Math.log(freq / MIN_FREQ) / Math.log(MAX_FREQ / MIN_FREQ)) * w;
}

function dbToY(db: number, h: number): number {
  return h / 2 - (db / DB_RANGE) * (h / 2);
}

export const PixiFilterCurve: React.FC<PixiFilterCurveProps> = ({
  cutoff, resonance, type, width, height, color,
}) => {
  const theme = usePixiTheme();
  const curveColor = color ?? theme.accent.color;

  const draw = useCallback((g: Graphics) => {
    g.clear();
    const pad = 4;
    const w = width - pad * 2;
    const h = height - pad * 2;

    // Background
    g.rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.3 });

    // Grid: 0 dB, ±12 dB
    const y0 = dbToY(0, h) + pad;
    g.moveTo(pad, y0).lineTo(width - pad, y0).stroke({ color: 0x333333, width: 1 });
    for (const db of [-12, 12]) {
      const y = dbToY(db, h) + pad;
      g.moveTo(pad, y).lineTo(width - pad, y).stroke({ color: 0x333333, width: 1 });
    }
    // Frequency grid: 100, 1k, 10k
    for (const freq of [100, 1000, 10000]) {
      const x = freqToX(freq, w) + pad;
      g.moveTo(x, pad).lineTo(x, height - pad).stroke({ color: 0x333333, width: 1 });
    }

    // Cutoff line (dashed)
    const cutoffX = freqToX(cutoff, w) + pad;
    for (let y = pad; y < height - pad; y += 6) {
      g.moveTo(cutoffX, y).lineTo(cutoffX, Math.min(y + 3, height - pad))
        .stroke({ color: curveColor, width: 1, alpha: 0.4 });
    }

    // Generate curve
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i <= NUM_POINTS; i++) {
      const t = i / NUM_POINTS;
      const freq = MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, t);
      const gain = calcGain(freq, cutoff, resonance, type);
      const db = Math.max(-DB_RANGE, Math.min(DB_RANGE, 20 * Math.log10(Math.max(gain, 0.001))));
      points.push({ x: freqToX(freq, w) + pad, y: dbToY(db, h) + pad });
    }

    // Filled area
    if (points.length > 1) {
      g.moveTo(points[0].x, height - pad);
      for (const p of points) g.lineTo(p.x, p.y);
      g.lineTo(points[points.length - 1].x, height - pad);
      g.closePath().fill({ color: curveColor, alpha: 0.15 });
    }

    // Curve line
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
    g.stroke({ color: curveColor, width: 2 });
  }, [width, height, cutoff, resonance, type, curveColor]);

  return <pixiGraphics draw={draw} layout={{ width, height }} />;
};
