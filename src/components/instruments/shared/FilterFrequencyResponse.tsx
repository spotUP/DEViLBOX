/**
 * FilterFrequencyResponse - Biquad filter frequency response curve
 *
 * Renders the magnitude response (dB vs frequency) of LP/HP/BP/Notch filters
 * in real-time as cutoff and resonance change.  Uses biquad filter math from
 * the Audio EQ Cookbook (Robert Bristow-Johnson) for accurate response curves.
 *
 * Supports 2-pole (12 dB/oct) and 4-pole (24 dB/oct) modes.
 * Both parameters are passed as 0–1 normalised values; the component converts
 * internally to Hz and Q using configurable min/max props.
 *
 * Usage:
 *   // OBXd-style (0-1 normalised, 4-pole LP)
 *   <FilterFrequencyResponse
 *     filterType="lowpass"  cutoff={config.filterCutoff}
 *     resonance={config.filterResonance}  poles={4}
 *   />
 *
 *   // SidMon-style (normalise first: cutoff/255, resonance/15)
 *   <FilterFrequencyResponse
 *     filterType={FILT_MODE[config.filterMode]}
 *     cutoff={config.filterCutoff / 255}
 *     resonance={config.filterResonance / 15}
 *   />
 */

import React, { useRef, useEffect, useCallback } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

const SAMPLE_RATE    = 44100;
const N_POINTS       = 400;      // evaluation points along the frequency axis
const DB_MIN         = -60;
const DB_MAX         = 18;
const DB_RANGE       = DB_MAX - DB_MIN; // 78 dB

const COLOR_BG       = '#0d1117';
const COLOR_GRID     = '#192130';
const COLOR_ZERO_DB  = '#253040';  // brighter than regular grid at 0 dB
const COLOR_LABEL    = '#475569';  // slate-600 for axis hints

// ─── Public types ─────────────────────────────────────────────────────────────

export type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'notch';

export interface FilterFrequencyResponseProps {
  /** Filter topology (default 'lowpass') */
  filterType?: FilterType;
  /** Cutoff frequency, 0–1 normalised → freqMin–freqMax Hz (default 20–20 000) */
  cutoff: number;
  /** Resonance/Q, 0–1 normalised → qMin–qMax (default 0.5–20) */
  resonance: number;
  /** Filter slope: 2 = 12 dB/oct, 4 = 24 dB/oct (default 2) */
  poles?: 2 | 4;
  /** Lowest displayed frequency in Hz (default 20) */
  freqMin?: number;
  /** Highest displayed frequency in Hz (default 20 000) */
  freqMax?: number;
  /** Minimum Q factor (default 0.5) */
  qMin?: number;
  /** Maximum Q factor (default 20) */
  qMax?: number;
  /** Curve / fill colour (any CSS colour string) */
  color?: string;
  width?: number;
  height?: number;
}

// ─── Filter math (Audio EQ Cookbook) ─────────────────────────────────────────

interface Coeffs {
  b0: number; b1: number; b2: number;
  a1: number; a2: number; // a0 normalised out
}

function makeBiquad(type: FilterType, fc: number, Q: number): Coeffs {
  const f     = Math.max(20, Math.min(fc, SAMPLE_RATE * 0.499));
  const w0    = (2 * Math.PI * f) / SAMPLE_RATE;
  const cosw  = Math.cos(w0);
  const sinw  = Math.sin(w0);
  const alpha = sinw / (2 * Math.max(Q, 0.01));
  const a0    = 1 + alpha;
  const a1    = -2 * cosw;
  const a2    = 1 - alpha;
  let b0: number, b1: number, b2: number;

  switch (type) {
    case 'highpass':
      b0 = (1 + cosw) / 2;  b1 = -(1 + cosw);  b2 = (1 + cosw) / 2; break;
    case 'bandpass':
      b0 = sinw / 2;         b1 = 0;             b2 = -sinw / 2;       break;
    case 'notch':
      b0 = 1;                b1 = -2 * cosw;     b2 = 1;               break;
    default: // lowpass
      b0 = (1 - cosw) / 2;  b1 = 1 - cosw;      b2 = (1 - cosw) / 2;
  }

  return { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 };
}

/** Evaluate magnitude response in dB at a single frequency. */
function magnitudeDB(c: Coeffs, freq: number, poles: 2 | 4): number {
  const w     = (2 * Math.PI * freq) / SAMPLE_RATE;
  const cosw  = Math.cos(w);
  const sinw  = Math.sin(w);
  const cos2w = Math.cos(2 * w);
  const sin2w = Math.sin(2 * w);

  const bRe = c.b0 + c.b1 * cosw + c.b2 * cos2w;
  const bIm = -c.b1 * sinw - c.b2 * sin2w;
  const aRe = 1    + c.a1 * cosw + c.a2 * cos2w;
  const aIm = -c.a1 * sinw - c.a2 * sin2w;

  const denom = aRe * aRe + aIm * aIm;
  const mag   = Math.sqrt((bRe * bRe + bIm * bIm) / Math.max(denom, 1e-30));
  const db    = 20 * Math.log10(Math.max(mag, 1e-10));

  // 4-pole = two identical cascaded biquads → double the dB
  return poles === 4 ? db * 2 : db;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const FilterFrequencyResponse: React.FC<FilterFrequencyResponseProps> = ({
  filterType = 'lowpass',
  cutoff,
  resonance,
  poles = 2,
  freqMin = 20,
  freqMax = 20000,
  qMin = 0.5,
  qMax = 20,
  color = '#22d3ee',
  width  = 280,
  height = 72,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width        = width  * dpr;
    canvas.height       = height * dpr;
    canvas.style.width  = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const W = width;
    const H = height;

    // ── Normalised params → real values ────────────────────────────────────
    const fc = freqMin * Math.pow(freqMax / freqMin, Math.max(0, Math.min(1, cutoff)));
    const Q  = qMin + Math.max(0, Math.min(1, resonance)) * (qMax - qMin);
    const coeffs = makeBiquad(filterType, fc, Q);

    // ── Coordinate helpers ──────────────────────────────────────────────────
    const logSpan = Math.log10(freqMax / freqMin);
    const freqX = (f: number) =>
      (Math.log10(Math.max(f, freqMin)) - Math.log10(freqMin)) / logSpan * W;

    const dbY = (db: number) =>
      (1 - (Math.max(DB_MIN, Math.min(DB_MAX, db)) - DB_MIN) / DB_RANGE) * H;

    // ── Background ──────────────────────────────────────────────────────────
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, W, H);

    // ── Horizontal dB grid ──────────────────────────────────────────────────
    ctx.lineWidth = 0.5;
    for (const db of [-60, -48, -36, -24, -12, 0, 12]) {
      const y = Math.round(dbY(db)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.strokeStyle = db === 0 ? COLOR_ZERO_DB : COLOR_GRID;
      ctx.lineWidth   = db === 0 ? 1 : 0.5;
      ctx.stroke();
    }

    // ── Vertical frequency decade markers ───────────────────────────────────
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = COLOR_GRID;
    for (const f of [100, 1000, 10000]) {
      const x = Math.round(freqX(f)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    // ── Evaluate filter curve ────────────────────────────────────────────────
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < N_POINTS; i++) {
      const t    = i / (N_POINTS - 1);
      const freq = freqMin * Math.pow(freqMax / freqMin, t);
      xs.push(freqX(freq));
      ys.push(dbY(magnitudeDB(coeffs, freq, poles)));
    }

    // ── Fill under the curve ─────────────────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(xs[0], H);
    for (let i = 0; i < N_POINTS; i++) ctx.lineTo(xs[i], ys[i]);
    ctx.lineTo(xs[N_POINTS - 1], H);
    ctx.closePath();
    ctx.fillStyle   = color;
    ctx.globalAlpha = 0.14;
    ctx.fill();
    ctx.globalAlpha = 1;

    // ── Curve line ───────────────────────────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(xs[0], ys[0]);
    for (let i = 1; i < N_POINTS; i++) ctx.lineTo(xs[i], ys[i]);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.globalAlpha = 1;
    ctx.stroke();

    // ── Cutoff frequency marker ──────────────────────────────────────────────
    const cx = freqX(fc);
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, H);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1;
    ctx.globalAlpha = 0.4;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // ── Cutoff frequency label ────────────────────────────────────────────────
    const fcLabel = fc >= 1000
      ? `${(fc / 1000).toFixed(fc >= 10000 ? 0 : 1)}k`
      : `${Math.round(fc)}`;
    ctx.font        = '7px monospace';
    ctx.fillStyle   = color;
    ctx.globalAlpha = 0.7;
    ctx.textAlign   = cx > W * 0.8 ? 'right' : 'left';
    ctx.fillText(fcLabel, cx + (cx > W * 0.8 ? -3 : 3), H - 2);
    ctx.globalAlpha = 1;

    // ── Static axis hints ─────────────────────────────────────────────────────
    const zeroY = dbY(0);
    ctx.font      = '7px monospace';
    ctx.fillStyle = COLOR_LABEL;
    ctx.textAlign = 'right';
    ctx.fillText('0', W - 2, zeroY - 2);

  }, [filterType, cutoff, resonance, poles, freqMin, freqMax, qMin, qMax, color, width, height]);

  useEffect(() => { draw(); }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', borderRadius: 4, border: '1px solid rgba(255,255,255,0.06)' }}
    />
  );
};
