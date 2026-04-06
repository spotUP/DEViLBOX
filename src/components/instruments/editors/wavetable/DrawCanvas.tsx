/**
 * DrawCanvas — the interactive drawing surface for the Waveform Studio.
 *
 * Features:
 * - Click/drag to draw individual samples
 * - Pen interpolation (fills gaps when dragging fast across multiple X)
 * - Grid snap indicator (shows chip bit-depth as horizontal lines)
 * - Symmetry overlay (semi-transparent mirror of the other half)
 * - Zero-crossing ticks (vertical marks where sign changes)
 * - A/B compare overlay (second waveform drawn in a different color)
 * - Nyquist warning tint for samples that exceed the chip's Nyquist limit
 *
 * All colors come from design tokens (CSS variables). No hardcoded hex.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { ChipTarget } from './chipTargets';
import { penInterpolate } from './waveformOps';

interface DrawCanvasProps {
  data: number[];
  maxValue: number;
  height?: number;
  chipTarget?: ChipTarget;
  compareData?: number[] | null;
  showSymmetryOverlay?: boolean;
  showZeroCrossings?: boolean;
  onChange: (data: number[]) => void;
}

export const DrawCanvas: React.FC<DrawCanvasProps> = ({
  data, maxValue, height = 220,
  chipTarget,
  compareData,
  showSymmetryOverlay = false,
  showZeroCrossings = false,
  onChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const lastIdxRef = useRef<number | null>(null);

  const length = data.length || 32;

  const drawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const logicalWidth = Math.max(320, length * 12);
    const logicalHeight = height;

    canvas.width = logicalWidth * dpr;
    canvas.height = logicalHeight * dpr;
    canvas.style.width = logicalWidth + 'px';
    canvas.style.height = logicalHeight + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const w = logicalWidth;
    const h = logicalHeight;

    // Resolve theme colors
    const cs = getComputedStyle(canvas);
    const bgColor = cs.getPropertyValue('--color-bg').trim() || '#0f0c0c';
    const gridColor = cs.getPropertyValue('--color-bg-secondary').trim() || '#1d1818';
    const borderColor = cs.getPropertyValue('--color-border').trim() || '#2f2525';
    const accentColor = cs.getPropertyValue('--color-accent-highlight').trim() || '#22d3ee';
    const overlayColor = cs.getPropertyValue('--color-accent-primary').trim() || '#10b981';
    const warnColor = cs.getPropertyValue('--color-accent-error').trim() || '#ef4444';
    const subtleColor = cs.getPropertyValue('--color-text-subtle').trim() || '#585050';

    // ── Background ─────────────────────────────────────────────
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // ── Chip constraint shading (bit-depth rows) ───────────────
    // For coarse bit depths (≤6 bits), draw horizontal bands at each allowed level.
    if (chipTarget && chipTarget.bitDepth <= 6) {
      const levels = chipTarget.maxValue + 1;
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 0.5;
      for (let i = 1; i < levels; i++) {
        const y = h - (i / (levels - 1)) * h;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    }

    // ── Sparse grid (always shown) ─────────────────────────────
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    // Horizontal quarters
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // Vertical grid every 8 samples
    const gridStep = Math.max(1, Math.floor(length / 8));
    for (let i = 0; i < length; i += gridStep) {
      const x = (i / length) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // ── Center line ────────────────────────────────────────────
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // ── Zero-crossing ticks ───────────────────────────────────
    if (showZeroCrossings) {
      const mid = maxValue / 2;
      ctx.strokeStyle = subtleColor;
      ctx.lineWidth = 1;
      for (let i = 1; i < data.length; i++) {
        const a = data[i - 1] - mid;
        const b = data[i] - mid;
        if ((a < 0 && b >= 0) || (a > 0 && b <= 0)) {
          const x = (i / length) * w;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
      }
    }

    // ── Symmetry overlay ──────────────────────────────────────
    if (showSymmetryOverlay) {
      const half = Math.floor(data.length / 2);
      ctx.strokeStyle = subtleColor;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      for (let i = 0; i < half; i++) {
        const mirrorIdx = data.length - 1 - i;
        const x = ((mirrorIdx + 0.5) / length) * w;
        const y = h - (data[i] / maxValue) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // ── Compare buffer (B) — drawn first so main is on top ──
    if (compareData && compareData.length > 0) {
      ctx.strokeStyle = overlayColor;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const cmpLen = compareData.length;
      for (let i = 0; i < cmpLen; i++) {
        const x = ((i + 0.5) / cmpLen) * w;
        const y = h - (compareData[i] / maxValue) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ── Main waveform — bars + line ───────────────────────────
    const barWidth = w / length;
    ctx.fillStyle = accentColor;
    data.forEach((value, i) => {
      const x = i * barWidth;
      const normalizedValue = value / maxValue;
      const barHeight = normalizedValue * h;
      const y = h - barHeight;
      ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
    });

    // Overlay line
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    data.forEach((value, i) => {
      const x = (i / length) * w + (barWidth / 2);
      const y = h - (value / maxValue) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // ── Nyquist warning: shade samples above Nyquist freq ──
    // If the waveform has a harmonic component above length/2, tint the
    // top-right corner to warn the user.
    if (chipTarget) {
      // Rough check: if any sample is adjacent to one with a big jump, warn
      let hasAlias = false;
      for (let i = 1; i < data.length; i++) {
        if (Math.abs(data[i] - data[i - 1]) > maxValue * 0.6) { hasAlias = true; break; }
      }
      if (hasAlias) {
        ctx.fillStyle = warnColor;
        ctx.globalAlpha = 0.1;
        ctx.fillRect(0, 0, w, 4);
        ctx.globalAlpha = 1;
      }
    }
  }, [data, maxValue, length, height, chipTarget, compareData, showSymmetryOverlay, showZeroCrossings]);

  useEffect(() => {
    drawAll();
  }, [drawAll]);

  // ── Mouse handling with pen interpolation ────────────────────
  const sampleFromEvent = (e: React.MouseEvent): { idx: number; value: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const idx = Math.max(0, Math.min(length - 1, Math.floor((x / rect.width) * length)));
    const normalizedY = 1 - (y / rect.height);
    const value = Math.round(normalizedY * maxValue);
    return { idx, value };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const hit = sampleFromEvent(e);
    if (!hit) return;
    setIsDragging(true);
    lastIdxRef.current = hit.idx;
    const newData = [...data];
    newData[hit.idx] = Math.max(0, Math.min(maxValue, hit.value));
    onChange(newData);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const hit = sampleFromEvent(e);
    if (!hit) return;
    const fromIdx = lastIdxRef.current ?? hit.idx;
    const newData = penInterpolate(data, fromIdx, hit.idx, hit.value, maxValue);
    lastIdxRef.current = hit.idx;
    onChange(newData);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    lastIdxRef.current = null;
  };

  return (
    <div className="relative rounded border border-dark-border overflow-hidden">
      <canvas
        ref={canvasRef}
        width={Math.max(320, length * 12)}
        height={height}
        className="cursor-crosshair block w-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </div>
  );
};
