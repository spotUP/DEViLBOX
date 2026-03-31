/**
 * LFOVisualizer - Displays LFO waveform with animated phase indicator
 *
 * Features:
 * - Displays LFO waveform shape (sine/tri/saw/square)
 * - Animated phase indicator (cycling dot)
 * - Rate display with optional BPM sync
 * - Auto-width support
 * - High-DPI (Retina) support
 * - 30fps animation
 */

import React, { useRef, useCallback, useEffect, useState, useLayoutEffect } from 'react';
import { useVisualizationAnimation } from '@hooks/useVisualizationAnimation';
import { useVisualizationStore } from '@stores/useVisualizationStore';

type LFOWaveform = 'sine' | 'triangle' | 'sawtooth' | 'square';

interface LFOVisualizerProps {
  instrumentId: number;
  rate: number;
  depth: number; // 0-100
  waveform: LFOWaveform;
  syncToBPM?: boolean;
  bpm?: number;
  width?: number | 'auto';
  height?: number;
  color?: string;
  dotColor?: string;
  backgroundColor?: string;
  className?: string;
  label?: string;
}

// Get waveform value at phase
function getWaveformValue(waveform: LFOWaveform, phase: number): number {
  switch (waveform) {
    case 'sine':
      return Math.sin(phase * Math.PI * 2);
    case 'triangle':
      return 1 - 4 * Math.abs(Math.round(phase) - phase);
    case 'sawtooth':
      return 2 * (phase - Math.floor(phase + 0.5));
    case 'square':
      return phase < 0.5 ? 1 : -1;
    default:
      return 0;
  }
}

export const LFOVisualizer: React.FC<LFOVisualizerProps> = ({
  instrumentId,
  rate,
  depth,
  waveform,
  syncToBPM = false,
  bpm = 120,
  width = 120,
  height = 50,
  color = '#a855f7',
  dotColor = '#ffffff',
  backgroundColor = 'var(--color-bg-tertiary)',
  className = '',
  label = 'LFO',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const phaseRef = useRef(0);
  const lastTimeRef = useRef(0);
  const [logicalWidth, setLogicalWidth] = useState(width === 'auto' ? 200 : width);

  const setLFOPhase = useVisualizationStore.getState().setLFOPhase;

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

  // Dimensions
  const padding = { top: 4, right: 4, bottom: 16, left: 4 };
  const graphWidth = logicalWidth - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;
  const centerY = padding.top + graphHeight / 2;
  const amplitude = (graphHeight / 2) * (depth / 100);
  const actualRate = syncToBPM ? (bpm / 60) * rate : rate;

  const onFrame = useCallback(
    (timestamp: number): boolean => {
      const ctx = contextRef.current;
      if (!ctx) return false;

      const deltaTime = lastTimeRef.current ? (timestamp - lastTimeRef.current) / 1000 : 0;
      lastTimeRef.current = timestamp;
      phaseRef.current = (phaseRef.current + actualRate * deltaTime) % 1;

      setLFOPhase(instrumentId, {
        filter: phaseRef.current,
        pitch: phaseRef.current,
        rate: actualRate,
      });

      // Clear
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, logicalWidth, height);

      // Center line
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding.left, centerY);
      ctx.lineTo(padding.left + graphWidth, centerY);
      ctx.stroke();

      // Draw waveform
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const numPoints = 100;
      for (let i = 0; i <= numPoints; i++) {
        const phase = i / numPoints;
        const x = padding.left + phase * graphWidth;
        const value = getWaveformValue(waveform, phase);
        const y = centerY - value * amplitude;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Glow
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Phase dot
      const dotX = padding.left + phaseRef.current * graphWidth;
      const value = getWaveformValue(waveform, phaseRef.current);
      const dotY = centerY - value * amplitude;

      ctx.fillStyle = dotColor;
      ctx.shadowColor = dotColor;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Labels
      ctx.fillStyle = '#666';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(label, padding.left, height - 2);
      ctx.textAlign = 'right';
      ctx.fillText(syncToBPM ? `${rate}x` : `${rate.toFixed(1)}Hz`, logicalWidth - padding.right, height - 2);

      return true;
    },
    [instrumentId, waveform, depth, actualRate, syncToBPM, rate, color, dotColor,
     backgroundColor, label, logicalWidth, height, graphWidth, centerY, amplitude,
     padding, setLFOPhase]
  );

  useVisualizationAnimation({ onFrame, enabled: depth > 0, fps: 60 });

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
