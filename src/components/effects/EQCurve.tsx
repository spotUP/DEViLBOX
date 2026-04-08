/**
 * EQCurve — Frequency response curve visualization for EQ effects.
 *
 * Computes and renders the combined magnitude response of multiple biquad
 * filter bands on a log-frequency / dB-gain grid. Uses Audio EQ Cookbook math.
 *
 * Supports: peaking, lowShelf, highShelf, highpass, lowpass filter types.
 */

import React, { useRef, useEffect, useMemo } from 'react';

export type EQBandType = 'peaking' | 'lowShelf' | 'highShelf' | 'highpass' | 'lowpass';

export interface EQBand {
  type: EQBandType;
  freq: number;    // Hz
  gain: number;    // dB (ignored for HP/LP)
  q: number;       // Q factor
}

interface EQCurveProps {
  bands: EQBand[];
  color?: string;
  width?: number;
  height?: number;
  dbRange?: number;    // ±dB range (default 18)
  sampleRate?: number; // default 48000
}

// Biquad coefficient computation (Audio EQ Cookbook)
function computeBiquadCoeffs(type: EQBandType, freq: number, gain: number, q: number, sr: number) {
  const w0 = (2 * Math.PI * Math.max(1, Math.min(sr / 2 - 1, freq))) / sr;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * Math.max(0.01, q));
  const A = Math.pow(10, gain / 40);

  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;

  switch (type) {
    case 'peaking':
      b0 = 1 + alpha * A;
      b1 = -2 * cosW0;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cosW0;
      a2 = 1 - alpha / A;
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
      b0 = (1 + cosW0) / 2;
      b1 = -(1 + cosW0);
      b2 = (1 + cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    case 'lowpass':
      b0 = (1 - cosW0) / 2;
      b1 = 1 - cosW0;
      b2 = (1 - cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    default:
      b0 = 1; b1 = 0; b2 = 0; a0 = 1; a1 = 0; a2 = 0;
  }

  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

// Compute magnitude response at a given frequency
function magnitudeResponse(
  coeffs: { b0: number; b1: number; b2: number; a1: number; a2: number },
  freq: number,
  sr: number,
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

export const EQCurve: React.FC<EQCurveProps> = ({
  bands,
  color = '#3b82f6',
  width = 300,
  height = 120,
  dbRange = 18,
  sampleRate = 48000,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Pre-compute band coefficients
  const bandCoeffs = useMemo(
    () => bands.map(b => computeBiquadCoeffs(b.type, b.freq, b.gain, b.q, sampleRate)),
    [bands, sampleRate],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr) canvas.width = width * dpr;
    if (canvas.height !== height * dpr) canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    const freqMin = 20;
    const freqMax = 20000;
    const logMin = Math.log10(freqMin);
    const logMax = Math.log10(freqMax);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;

    // Frequency grid (decades)
    for (const f of [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]) {
      const x = ((Math.log10(f) - logMin) / (logMax - logMin)) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // dB grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    for (let db = -dbRange; db <= dbRange; db += 6) {
      const y = ((dbRange - db) / (2 * dbRange)) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Zero line
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Frequency labels
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    for (const [f, label] of [[100, '100'], [1000, '1k'], [10000, '10k']] as const) {
      const x = ((Math.log10(f) - logMin) / (logMax - logMin)) * width;
      ctx.fillText(label, x, height - 2);
    }

    // Compute combined response
    const numPoints = Math.min(width * 2, 512);
    const points: [number, number][] = [];

    for (let i = 0; i < numPoints; i++) {
      const logFreq = logMin + (i / (numPoints - 1)) * (logMax - logMin);
      const freq = Math.pow(10, logFreq);
      const x = (i / (numPoints - 1)) * width;

      // Multiply all band responses together
      let totalMag = 1;
      for (const coeffs of bandCoeffs) {
        totalMag *= magnitudeResponse(coeffs, freq, sampleRate);
      }

      const db = 20 * Math.log10(totalMag || 1e-10);
      const clampedDb = Math.max(-dbRange, Math.min(dbRange, db));
      const y = ((dbRange - clampedDb) / (2 * dbRange)) * height;

      points.push([x, y]);
    }

    // Draw filled area
    ctx.beginPath();
    ctx.moveTo(points[0][0], height / 2);
    for (const [x, y] of points) ctx.lineTo(x, y);
    ctx.lineTo(points[points.length - 1][0], height / 2);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, color + '30');
    gradient.addColorStop(0.5, color + '08');
    gradient.addColorStop(1, color + '30');
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw curve line
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw band frequency markers
    ctx.fillStyle = color + '80';
    for (const band of bands) {
      if (band.gain === 0 && band.type === 'peaking') continue;
      const x = ((Math.log10(Math.max(freqMin, Math.min(freqMax, band.freq))) - logMin) / (logMax - logMin)) * width;
      ctx.beginPath();
      ctx.arc(x, height / 2, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [bandCoeffs, bands, color, width, height, dbRange, sampleRate]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: `${height}px`,
        borderRadius: 4,
        display: 'block',
      }}
    />
  );
};
