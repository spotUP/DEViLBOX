/**
 * InstrumentLissajous - Stereo phase/XY scope visualization
 *
 * Features:
 * - Real-time L/R → X/Y Lissajous display
 * - Phosphor persistence (slow fade) for CRT look
 * - Mono signal = diagonal line, stereo = spread
 * - Auto-scales to container when width="auto"
 * - High-DPI (Retina) support
 */

import React, { useRef, useEffect, useCallback, useState, useLayoutEffect } from 'react';
import { useVisualizationAnimation } from '@hooks/useVisualizationAnimation';
import { getToneEngine } from '@engine/ToneEngine';

interface InstrumentLissajousProps {
  instrumentId: number;
  width?: number | 'auto';
  height?: number;
  color?: string;
  backgroundColor?: string;
  className?: string;
}

export const InstrumentLissajous: React.FC<InstrumentLissajousProps> = ({
  instrumentId,
  width = 200,
  height = 80,
  color = '#4ade80',
  backgroundColor = '#000000',
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [logicalWidth, setLogicalWidth] = useState(width === 'auto' ? 200 : width);

  // Handle responsive width
  useEffect(() => {
    if (width !== 'auto') {
      requestAnimationFrame(() => setLogicalWidth(width));
      return;
    }
    const container = containerRef.current;
    if (!container) return;
    const updateWidth = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0) setLogicalWidth(Math.floor(rect.width));
    };
    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [width]);

  // Setup High-DPI canvas
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = logicalWidth * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    contextRef.current = ctx;
  }, [logicalWidth, height]);

  const onFrame = useCallback((): boolean => {
    const ctx = contextRef.current;
    if (!ctx) return false;

    const engine = getToneEngine();
    const analyser = engine.getInstrumentAnalyser(instrumentId);

    // Phosphor fade: semi-transparent black overlay
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, 0, logicalWidth, height);

    if (!analyser || !analyser.hasActivity()) {
      // Draw crosshair even when idle
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(logicalWidth / 2, 0);
      ctx.lineTo(logicalWidth / 2, height);
      ctx.moveTo(0, height / 2);
      ctx.lineTo(logicalWidth, height / 2);
      ctx.stroke();
      return false;
    }

    // Draw crosshair guides
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(logicalWidth / 2, 0);
    ctx.lineTo(logicalWidth / 2, height);
    ctx.moveTo(0, height / 2);
    ctx.lineTo(logicalWidth, height / 2);
    ctx.stroke();

    // Use waveform data — since InstrumentAnalyser is mono (summed),
    // we approximate stereo from waveform phase: plot sample[i] vs sample[i+1]
    // This creates a phase portrait that reveals harmonic content
    const waveform = analyser.getWaveform();
    const len = waveform.length;
    if (len < 4) return false;

    const cx = logicalWidth / 2;
    const cy = height / 2;
    const scale = Math.min(logicalWidth, height) * 0.42;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();

    for (let i = 0; i < len - 1; i++) {
      const x = cx + waveform[i] * scale;
      const y = cy + waveform[i + 1] * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Glow pass
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.globalAlpha = 0.4;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    return true;
  }, [instrumentId, color, logicalWidth, height]);

  useVisualizationAnimation({ onFrame, enabled: true, fps: 30 });

  const canvas = (
    <canvas
      ref={canvasRef}
      className={`rounded ${className}`}
      style={{
        backgroundColor,
        width: width === 'auto' ? '100%' : `${width}px`,
        height: `${height}px`,
        display: 'block',
      }}
    />
  );

  if (width === 'auto') {
    return (
      <div ref={containerRef} className="w-full h-full">
        {canvas}
      </div>
    );
  }
  return canvas;
};
