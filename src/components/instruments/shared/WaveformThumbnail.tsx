/**
 * WaveformThumbnail - Mini canvas preview of a waveform
 *
 * Renders a small visual representation of a waveform sample array.
 * Used in wavetable selectors, instrument lists, wave-type buttons.
 *
 * Usage:
 *   <WaveformThumbnail data={waveData} maxValue={15} width={48} height={24} />
 *
 *   // With named preset waveform (draws the ideal shape)
 *   <WaveformThumbnail type="sine" width={48} height={24} />
 */

import React, { useRef, useEffect } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface WaveformThumbnailDataProps {
  /** Raw sample data (0..maxValue) */
  data: number[];
  maxValue: number;
  width?: number;
  height?: number;
  color?: string;
  /** Draw as bars (like MacroEditor) or as a line */
  style?: 'bar' | 'line';
}

interface WaveformThumbnailTypeProps {
  /** Preset waveform type (renders a synthesized preview) */
  type: 'sine' | 'triangle' | 'saw' | 'square' | 'pulse25' | 'pulse12' | 'noise';
  resolution?: number; // Number of points to draw (default: 64)
  width?: number;
  height?: number;
  color?: string;
  style?: 'bar' | 'line';
}

export type WaveformThumbnailProps = WaveformThumbnailDataProps | WaveformThumbnailTypeProps;

// ── Preset waveform generators ─────────────────────────────────────────────────

function generatePreset(type: WaveformThumbnailTypeProps['type'], n: number): number[] {
  const data: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    switch (type) {
      case 'sine':     data.push(0.5 + 0.5 * Math.sin(t * Math.PI * 2)); break;
      case 'triangle': data.push(t < 0.5 ? t * 2 : 2 - t * 2); break;
      case 'saw':      data.push(t); break;
      case 'square':   data.push(t < 0.5 ? 1 : 0); break;
      case 'pulse25':  data.push(t < 0.25 ? 1 : 0); break;
      case 'pulse12':  data.push(t < 0.125 ? 1 : 0); break;
      case 'noise':    data.push(Math.random()); break;
    }
  }
  return data;
}

// ── Component ──────────────────────────────────────────────────────────────────

export const WaveformThumbnail: React.FC<WaveformThumbnailProps> = (props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const w        = props.width  ?? 48;
  const h        = props.height ?? 24;
  const drawStyle = props.style ?? 'line';
  const color    = props.color  ?? '#06b6d4';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width        = w * dpr;
    canvas.height       = h * dpr;
    canvas.style.width  = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#11131a';
    ctx.fillRect(0, 0, w, h);

    // Get normalised data (0..1)
    let normData: number[];
    if ('type' in props) {
      normData = generatePreset(props.type, props.resolution ?? 64);
    } else {
      const mv = props.maxValue || 1;
      normData = props.data.map(v => v / mv);
    }

    if (normData.length === 0) return;

    if (drawStyle === 'bar') {
      // Bar chart style (like MacroEditor)
      const bw = w / normData.length;
      ctx.fillStyle = color;
      normData.forEach((v, i) => {
        const bh = v * h;
        ctx.fillRect(i * bw, h - bh, bw - 0.5, bh);
      });
    } else {
      // Smooth line
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1.5;
      ctx.lineJoin    = 'round';
      ctx.beginPath();
      normData.forEach((v, i) => {
        const x = (i / normData.length) * w;
        const y = h - v * (h - 2) - 1;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Subtle area fill under the line
      ctx.fillStyle = `${color}22`;
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
    }
  }, [props, w, h, drawStyle, color]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', imageRendering: 'auto' }}
    />
  );
};

export default WaveformThumbnail;
