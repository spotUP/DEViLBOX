/**
 * PixiEQCurve — GL-native EQ frequency response curve visualization.
 * Uses Audio EQ Cookbook biquad math to compute combined magnitude response.
 * Mirrors src/components/effects/EQCurve.tsx for the Pixi UI.
 */

import React, { useCallback } from 'react';
import { Graphics } from 'pixi.js';
import { usePixiTheme } from '../theme';

export type EQBandType = 'peaking' | 'lowShelf' | 'highShelf' | 'highpass' | 'lowpass';

export interface PixiEQBand {
  type: EQBandType;
  freq: number;
  gain: number;
  q: number;
}

interface PixiEQCurveProps {
  bands: PixiEQBand[];
  width?: number;
  height?: number;
  color?: number;
  dbRange?: number;
  sampleRate?: number;
}

const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const NUM_POINTS = 200;

function computeBiquadCoeffs(type: EQBandType, freq: number, gain: number, q: number, sr: number) {
  const w0 = (2 * Math.PI * Math.max(1, Math.min(sr / 2 - 1, freq))) / sr;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * Math.max(0.01, q));
  const A = Math.pow(10, gain / 40);

  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;

  switch (type) {
    case 'peaking':
      b0 = 1 + alpha * A; b1 = -2 * cosW0; b2 = 1 - alpha * A;
      a0 = 1 + alpha / A; a1 = -2 * cosW0; a2 = 1 - alpha / A;
      break;
    case 'lowShelf': {
      const sq = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cosW0 + sq);
      b1 = 2 * A * ((A - 1) - (A + 1) * cosW0);
      b2 = A * ((A + 1) - (A - 1) * cosW0 - sq);
      a0 = (A + 1) + (A - 1) * cosW0 + sq;
      a1 = -2 * ((A - 1) + (A + 1) * cosW0);
      a2 = (A + 1) + (A - 1) * cosW0 - sq;
      break;
    }
    case 'highShelf': {
      const sq = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cosW0 + sq);
      b1 = -2 * A * ((A - 1) + (A + 1) * cosW0);
      b2 = A * ((A + 1) + (A - 1) * cosW0 - sq);
      a0 = (A + 1) - (A - 1) * cosW0 + sq;
      a1 = 2 * ((A - 1) - (A + 1) * cosW0);
      a2 = (A + 1) - (A - 1) * cosW0 - sq;
      break;
    }
    case 'highpass':
      b0 = (1 + cosW0) / 2; b1 = -(1 + cosW0); b2 = (1 + cosW0) / 2;
      a0 = 1 + alpha; a1 = -2 * cosW0; a2 = 1 - alpha;
      break;
    case 'lowpass':
      b0 = (1 - cosW0) / 2; b1 = 1 - cosW0; b2 = (1 - cosW0) / 2;
      a0 = 1 + alpha; a1 = -2 * cosW0; a2 = 1 - alpha;
      break;
    default:
      b0 = 1; b1 = 0; b2 = 0; a0 = 1; a1 = 0; a2 = 0;
  }

  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function magnitudeResponse(
  coeffs: { b0: number; b1: number; b2: number; a1: number; a2: number },
  freq: number, sr: number,
): number {
  const w = (2 * Math.PI * freq) / sr;
  const cosW = Math.cos(w);
  const cos2W = Math.cos(2 * w);
  const sinW = Math.sin(w);
  const sin2W = Math.sin(2 * w);
  const numReal = coeffs.b0 + coeffs.b1 * cosW + coeffs.b2 * cos2W;
  const numImag = -(coeffs.b1 * sinW + coeffs.b2 * sin2W);
  const denReal = 1 + coeffs.a1 * cosW + coeffs.a2 * cos2W;
  const denImag = -(coeffs.a1 * sinW + coeffs.a2 * sin2W);
  const numMag = Math.sqrt(numReal * numReal + numImag * numImag);
  const denMag = Math.sqrt(denReal * denReal + denImag * denImag);
  return numMag / (denMag || 1e-10);
}

function freqToX(freq: number, w: number): number {
  return (Math.log(freq / MIN_FREQ) / Math.log(MAX_FREQ / MIN_FREQ)) * w;
}

function dbToY(db: number, h: number, dbRange: number): number {
  return h / 2 - (db / dbRange) * (h / 2);
}

export const PixiEQCurve: React.FC<PixiEQCurveProps> = ({
  bands, width = 360, height = 120, color, dbRange = 18, sampleRate = 48000,
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

    // Zero dB line
    const y0 = dbToY(0, h, dbRange) + pad;
    g.moveTo(pad, y0).lineTo(width - pad, y0).stroke({ color: 0x444444, width: 1 });

    // ±dB grid
    for (let db = -dbRange; db <= dbRange; db += 6) {
      if (db === 0) continue;
      const y = dbToY(db, h, dbRange) + pad;
      g.moveTo(pad, y).lineTo(width - pad, y).stroke({ color: 0x222222, width: 1 });
    }

    // Frequency grid
    for (const freq of [100, 1000, 10000]) {
      const x = freqToX(freq, w) + pad;
      g.moveTo(x, pad).lineTo(x, height - pad).stroke({ color: 0x222222, width: 1 });
    }

    // Pre-compute band coefficients
    const bandCoeffs = bands.map(b => computeBiquadCoeffs(b.type, b.freq, b.gain, b.q, sampleRate));

    // Generate curve points
    const points: { x: number; y: number }[] = [];
    const logMin = Math.log10(MIN_FREQ);
    const logMax = Math.log10(MAX_FREQ);

    for (let i = 0; i <= NUM_POINTS; i++) {
      const logFreq = logMin + (i / NUM_POINTS) * (logMax - logMin);
      const freq = Math.pow(10, logFreq);
      const x = freqToX(freq, w) + pad;

      let totalMag = 1;
      for (const coeffs of bandCoeffs) {
        totalMag *= magnitudeResponse(coeffs, freq, sampleRate);
      }

      const db = 20 * Math.log10(totalMag || 1e-10);
      const clampedDb = Math.max(-dbRange, Math.min(dbRange, db));
      const y = dbToY(clampedDb, h, dbRange) + pad;
      points.push({ x, y });
    }

    // Filled area from zero line
    if (points.length > 1) {
      g.moveTo(points[0].x, y0);
      for (const p of points) g.lineTo(p.x, p.y);
      g.lineTo(points[points.length - 1].x, y0);
      g.closePath().fill({ color: curveColor, alpha: 0.15 });
    }

    // Curve stroke
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
    g.stroke({ color: curveColor, width: 2 });

    // Band frequency markers
    for (const band of bands) {
      if (band.gain === 0 && band.type === 'peaking') continue;
      const bx = freqToX(Math.max(MIN_FREQ, Math.min(MAX_FREQ, band.freq)), w) + pad;
      g.circle(bx, y0, 3).fill({ color: curveColor, alpha: 0.6 });
    }
  }, [width, height, bands, curveColor, dbRange, sampleRate]);

  return <pixiGraphics draw={draw} layout={{ width, height }} />;
};
