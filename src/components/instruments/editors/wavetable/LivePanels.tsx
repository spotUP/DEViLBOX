/**
 * LivePanels — the right-side panel of the Waveform Studio.
 *
 * Shows:
 * - Harmonic spectrum: instant FFT of the current buffer, log-scale bars
 * - (Optional) A/B spectrum overlay: second buffer in a different color
 *
 * The spectrum is computed entirely in-process with the existing
 * `fft` utility from `src/lib/audio/SpectralFilter.ts`. The source
 * buffer is zero-padded to the next power of 2 up to 256 samples.
 */

import React, { useEffect, useRef } from 'react';
import { fft } from '@/lib/audio/SpectralFilter';
import { toFloat } from './waveformOps';

interface LivePanelsProps {
  data: number[];
  maxValue: number;
  compareData?: number[] | null;
  compareMax?: number;
}

function computeSpectrum(buffer: Float32Array): number[] {
  // Pad buffer to the nearest power of 2 ≥ length, up to 256.
  let size = 1;
  while (size < buffer.length && size < 256) size *= 2;
  if (size < 16) size = 16;
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  for (let i = 0; i < buffer.length && i < size; i++) re[i] = buffer[i];
  fft(re, im);
  const bins = size / 2;
  const mags: number[] = [];
  let peak = 0;
  for (let i = 1; i <= bins; i++) {
    const r = re[i] ?? 0;
    const m = im[i] ?? 0;
    const mag = Math.sqrt(r * r + m * m);
    mags.push(mag);
    if (mag > peak) peak = mag;
  }
  // Normalize to 0..1
  if (peak > 0) {
    for (let i = 0; i < mags.length; i++) mags[i] /= peak;
  }
  return mags;
}

export const LivePanels: React.FC<LivePanelsProps> = ({
  data, maxValue, compareData, compareMax,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = 260;
    const h = 140;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const cs = getComputedStyle(canvas);
    const bgColor = cs.getPropertyValue('--color-bg').trim() || '#0f0c0c';
    const gridColor = cs.getPropertyValue('--color-bg-secondary').trim() || '#1d1818';
    const accentColor = cs.getPropertyValue('--color-accent-highlight').trim() || '#22d3ee';
    const compareColor = cs.getPropertyValue('--color-accent-primary').trim() || '#10b981';

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Compute spectrum of main buffer
    if (data.length > 0) {
      const buf = toFloat(data, maxValue);
      const mags = computeSpectrum(buf);
      const barWidth = w / mags.length;
      ctx.fillStyle = accentColor;
      for (let i = 0; i < mags.length; i++) {
        // Log scale: 20 * log10(mag) mapped to h
        const db = mags[i] < 1e-6 ? -120 : 20 * Math.log10(mags[i]);
        const norm = Math.max(0, Math.min(1, (db + 60) / 60));
        const bh = norm * h;
        ctx.fillRect(i * barWidth, h - bh, Math.max(1, barWidth - 1), bh);
      }
    }

    // Compute spectrum of compare buffer
    if (compareData && compareData.length > 0) {
      const buf = toFloat(compareData, compareMax ?? maxValue);
      const mags = computeSpectrum(buf);
      const barWidth = w / mags.length;
      ctx.strokeStyle = compareColor;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      for (let i = 0; i < mags.length; i++) {
        const db = mags[i] < 1e-6 ? -120 : 20 * Math.log10(mags[i]);
        const norm = Math.max(0, Math.min(1, (db + 60) / 60));
        const y = h - norm * h;
        const x = i * barWidth + barWidth / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }, [data, maxValue, compareData, compareMax]);

  return (
    <div className="space-y-1 p-2 bg-dark-bgSecondary rounded border border-dark-border">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono font-bold text-text-primary uppercase">
          Spectrum
        </span>
        <span className="text-[9px] font-mono text-text-muted">log / 60 dB</span>
      </div>
      <canvas ref={canvasRef} className="block rounded" />
      {compareData && compareData.length > 0 && (
        <div className="flex items-center gap-2 text-[9px] font-mono">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm bg-accent-highlight" />
            <span className="text-text-muted">A (current)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm bg-accent-primary" />
            <span className="text-text-muted">B (snapshot)</span>
          </div>
        </div>
      )}
    </div>
  );
};
